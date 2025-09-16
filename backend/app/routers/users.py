from __future__ import annotations

from typing import Any, Optional
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status, Query
from pydantic import BaseModel, EmailStr, Field

from ..core.deps import require_roles
from ..repositories.audit import log_event
from ..core.settings import settings
from ..models.auth import MeResponse, Role
from ..repositories.invitations import (
    create_invitation,
    get_invitation,
    mark_accepted,
    get_latest_pending_invitation,
)
from ..repositories.password_policy import get_policy, update_policy
from ..core.security import hash_password, validate_password_policy
from ..repositories.users import users_repo
from ..core.database import session_scope
from ..models.user import UserORM
from ..repositories.mfa import get_mfa, upsert_mfa, set_enabled, ensure_mfa_table
from ..core.crypto import encrypt_str, decrypt_str
import pyotp
import io
import base64
import json as _json
import qrcode
from ..repositories.app_settings import get_json
from ..core.emailer import SmtpConfig
from ..services.email_templates import EmailTemplateManager
from ..services.email_delivery import EmailRateLimitError, send_templated_email
from ..services.webhooks import trigger_webhook
from ..repositories.invitation_tokens import get_token as get_invitation_token


router = APIRouter()


def _smtp_config_or_error(org_id: str) -> tuple[SmtpConfig, dict[str, Any]]:
    conf = get_json(org_id, "email_settings")
    if not conf or not conf.get("smtp_host") or not conf.get("from_email") or not conf.get("smtp_port"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email settings not configured")
    smtp_cfg = SmtpConfig(
        host=str(conf.get("smtp_host")),
        port=int(conf.get("smtp_port", 587)),
        username=conf.get("username"),
        password=conf.get("password"),
        use_tls=bool(conf.get("use_tls", True)),
        use_ssl=bool(conf.get("use_ssl", False)),
        from_name=str(conf.get("from_name", "Confianet")),
        from_email=str(conf.get("from_email")),
    )
    return smtp_cfg, conf


class InvitePayload(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    role: Role = Role.investigador
    mfa: Optional[bool] = False


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
def invite_user(payload: InvitePayload, request: Request, me: MeResponse = Depends(require_roles(Role.admin))) -> dict[str, Any]:
    invitation = create_invitation(
        org_id=me.org_id,
        invited_by=str(me.id),
        email=payload.email,
        name=payload.name,
        role=payload.role.value,
    )
    # Ensure user exists in suspended (pending) state until password is set
    new_user_id: Optional[str] = None
    with session_scope() as session:
        existing = users_repo.get_by_email(payload.email)
        if not existing:
            u = UserORM(
                id=str(uuid4()),
                org_id=me.org_id,
                email=payload.email,
                name=payload.name,
                role=payload.role.value,
                # Store as 'suspended' in DB (enum), UI will show 'pending' if password_hash IS NULL
                status='suspended',
                mfa_enabled='1' if payload.mfa else '0',
                created_at=datetime.utcnow(),
                password_hash=None,
            )
            session.add(u)
            new_user_id = u.id
    # Build link for email
    link = f"http://localhost:3000/auth-signup-basic?token={invitation.token}&email={payload.email}&name={payload.name or ''}"
    # Send real email using org email settings
    smtp_cfg, conf = _smtp_config_or_error(me.org_id)
    manager = EmailTemplateManager(me.org_id)
    context = {
        "invitee_name": payload.name or payload.email,
        "organization_name": manager.branding.brand_name,
        "invite_link": link,
        "invited_by_name": me.full_name or me.email,
        "expires_at": invitation.expires_at.isoformat(),
    }
    try:
        outcome = send_templated_email(
            org_id=me.org_id,
            template_id="user_invitation",
            smtp_cfg=smtp_cfg,
            to_email=payload.email,
            context=context,
            dedupe_key=f"invitation:{invitation.invitation_id}",
        )
    except EmailRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Espera {exc.retry_after_seconds} segundos antes de reenviar otra invitación",
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"No se pudo enviar el correo: {e}")

    if outcome.idempotent:
        # No enviar respuesta de error; continuar para auditoría pero indicar en mensaje
        pass
    # Audit: user invited
    client_ip = request.client.host if request.client else None
    target_id = new_user_id or (existing.id if existing else None)
    log_event(
        action="user_invited",
        org_id=me.org_id,
        actor_id=str(me.id),
        actor_role=me.role.value,
        target_type="user",
        target_id=str(target_id) if target_id else None,
        metadata={"email": payload.email, "role": payload.role.value},
        ip=client_ip,
        ip_salt=settings.ip_hash_salt,
    )
    trigger_webhook(
        me.org_id,
        "user.invited",
        {
            "email": payload.email,
            "role": payload.role.value,
            "invited_by": str(me.id),
            "user_id": target_id,
            "expires_at": invitation.expires_at.isoformat(),
        },
    )
    return {"message": f"Invitación enviada a {payload.email}", "idempotent": outcome.idempotent}


class AcceptInvitationPayload(BaseModel):
    token: str = Field(min_length=10)
    password: str = Field(min_length=1)


@router.post("/accept-invitation", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def accept_invitation(payload: AcceptInvitationPayload) -> Response:
    inv = get_invitation(payload.token)
    if not inv:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="InvitaciÃ³n invÃ¡lida")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El enlace de invitación ha caducado. Solicita una nueva invitación.")
    # Validate policy for org (fallback global)
    pol = get_policy(inv.org_id)
    msg = validate_password_policy(payload.password, pol.min_length, pol.require_upper, pol.require_number, pol.require_symbol)
    if msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
    pwd_hash = hash_password(payload.password)
    # Create or update user
    activated_user_id: Optional[str] = None
    with session_scope() as session:
        existing = users_repo.get_by_email(inv.email)
        if existing:
            obj = session.get(UserORM, existing.id)
            if obj:
                obj.password_hash = pwd_hash
                obj.status = 'active'
                session.add(obj)
                activated_user_id = obj.id
        else:
            user = UserORM(
                id=str(uuid4()),
                org_id=inv.org_id,
                email=inv.email,
                name=inv.name,
                role=inv.role,
                status='active',
                mfa_enabled='0',
                created_at=datetime.utcnow(),
                password_hash=pwd_hash,
            )
            session.add(user)
            activated_user_id = user.id
    mark_accepted(inv)
    trigger_webhook(
        inv.org_id,
        "user.activated",
        {"email": inv.email, "user_id": activated_user_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class UpdateUserPayload(BaseModel):
    name: Optional[str] = None
    role: Optional[Role] = None
    status: Optional[str] = None  # 'active' | 'suspended'


@router.get("", response_model=list[dict[str, Any]])
def list_users(
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
    me: MeResponse = Depends(require_roles(Role.admin)),
) -> list[dict[str, Any]]:
    # Minimal listing with SQL; compute 'pending' if password_hash is NULL
    from sqlalchemy import text
    from ..core.database import engine
    sql = text(
        """
        SELECT id, org_id, email, name, role,
               CASE WHEN password_hash IS NULL THEN 'pending' ELSE status END AS status,
               mfa_enabled,
               created_at
        FROM users
        WHERE org_id = :org_id
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(sql, {"limit": limit, "offset": offset, "org_id": me.org_id}).mappings().all()
    return [dict(r) for r in rows]


@router.patch("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def update_user(user_id: str, payload: UpdateUserPayload, request: Request, me: MeResponse = Depends(require_roles(Role.admin))) -> Response:
    with session_scope() as session:
        obj = session.get(UserORM, user_id)
        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        prev_name = obj.name
        prev_role = obj.role
        prev_status = obj.status
        if payload.name is not None:
            obj.name = payload.name
        if payload.role is not None:
            # step-up required for role changes
            from ..routers.auth import _require_step_up
            _require_step_up(request, str(me.id))
            obj.role = payload.role.value
        if payload.status is not None:
            obj.status = payload.status
        session.add(obj)
    # Audit outside session
    client_ip = request.client.host if request.client else None
    # Determine action
    if payload.status == 'active' and prev_status != 'active':
        log_event(
            action="user_reactivated",
            org_id=me.org_id,
            actor_id=str(me.id),
            actor_role=me.role.value,
            target_type="user",
            target_id=user_id,
            metadata={"previous_status": prev_status, "new_status": "active"},
            ip=client_ip,
            ip_salt=settings.ip_hash_salt,
        )
    else:
        changes: dict[str, Any] = {}
        if payload.name is not None and payload.name != prev_name:
            changes["name"] = {"from": prev_name, "to": payload.name}
        if payload.role is not None and payload.role.value != prev_role:
            changes["role"] = {"from": prev_role, "to": payload.role.value}
        if payload.status is not None and payload.status != prev_status:
            changes["status"] = {"from": prev_status, "to": payload.status}
        log_event(
            action="user_updated",
            org_id=me.org_id,
            actor_id=str(me.id),
            actor_role=me.role.value,
            target_type="user",
            target_id=user_id,
            metadata=changes or None,
            ip=client_ip,
            ip_salt=settings.ip_hash_salt,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/suspend", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def suspend_user(user_id: str, request: Request, me: MeResponse = Depends(require_roles(Role.admin))) -> Response:
    with session_scope() as session:
        obj = session.get(UserORM, user_id)
        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        obj.status = 'suspended'
        session.add(obj)
    # Audit
    client_ip = request.client.host if request.client else None
    log_event(
        action="user_suspended",
        org_id=me.org_id,
        actor_id=str(me.id),
        actor_role=me.role.value,
        target_type="user",
        target_id=user_id,
        metadata=None,
        ip=client_ip,
        ip_salt=settings.ip_hash_salt,
    )
    trigger_webhook(
        me.org_id,
        "user.suspended",
        {"user_id": user_id, "by": str(me.id)},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# MFA endpoints for current user
class MfaStartResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_data_url: str


@router.post("/mfa/setup/start", response_model=MfaStartResponse)
def mfa_setup_start(me: MeResponse = Depends(require_roles(Role.admin, Role.responsable, Role.investigador, Role.auditor))) -> MfaStartResponse:
    # Generate a new TOTP secret; do not persist yet. Client must confirm.
    secret = pyotp.random_base32()
    issuer = "CanalDenuncias"
    label = f"{me.email}"
    otpauth_url = pyotp.totp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)
    # Generate QR image as data URL
    img = qrcode.make(otpauth_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
    return MfaStartResponse(secret=secret, otpauth_url=otpauth_url, qr_data_url=data_url)


class MfaConfirmPayload(BaseModel):
    secret: str
    code: str


class MfaConfirmResponse(BaseModel):
    recovery_codes: list[str]


@router.post("/mfa/setup/confirm", response_model=MfaConfirmResponse)
def mfa_setup_confirm(payload: MfaConfirmPayload, request: Request, me: MeResponse = Depends(require_roles(Role.admin, Role.responsable, Role.investigador, Role.auditor))) -> MfaConfirmResponse:
    totp = pyotp.TOTP(payload.secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código 2FA inválido")
    # Generate recovery codes
    recovery = [base64.urlsafe_b64encode(uuid4().bytes)[:10].decode("utf-8") for _ in range(10)]
    # Persist encrypted secret and codes
    secret_enc = encrypt_str(payload.secret)
    recovery_enc = encrypt_str(_json.dumps(recovery))
    upsert_mfa(user_id=str(me.id), secret_enc=secret_enc, recovery_codes_enc=recovery_enc, enabled=True)
    # Flip user flag
    with session_scope() as session:
        obj = session.get(UserORM, str(me.id))
        if obj:
            obj.mfa_enabled = '1'
            session.add(obj)
    # Audit
    client_ip = request.client.host if request.client else None
    log_event("2fa.enabled", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    return MfaConfirmResponse(recovery_codes=recovery)


class MfaDisablePayload(BaseModel):
    code: Optional[str] = None
    recovery_code: Optional[str] = None


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def mfa_disable(payload: MfaDisablePayload, request: Request, me: MeResponse = Depends(require_roles(Role.admin, Role.responsable, Role.investigador, Role.auditor))) -> Response:
    rec = get_mfa(str(me.id))
    if not rec or not rec.get("enabled"):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    secret = decrypt_str(rec["secret_enc"]) if rec.get("secret_enc") else ""
    codes = []
    try:
        codes = _json.loads(decrypt_str(rec["recovery_codes_enc"]))
    except Exception:
        codes = []
    ok = False
    if payload.code:
        totp = pyotp.TOTP(secret)
        ok = bool(totp.verify(payload.code, valid_window=1))
    elif payload.recovery_code:
        if payload.recovery_code in codes:
            ok = True
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código inválido")
    # Disable flag on both tables
    set_enabled(str(me.id), False)
    with session_scope() as session:
        obj = session.get(UserORM, str(me.id))
        if obj:
            obj.mfa_enabled = '0'
            session.add(obj)
    # Audit
    client_ip = request.client.host if request.client else None
    log_event("2fa.disabled", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_user(user_id: str, request: Request, me: MeResponse = Depends(require_roles(Role.admin))) -> Response:
    from ..routers.auth import _require_step_up
    _require_step_up(request, str(me.id))
    with session_scope() as session:
        obj = session.get(UserORM, user_id)
        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        session.delete(obj)
    # Audit deletion (optional)
    client_ip = request.client.host if request.client else None
    log_event(
        action="user_deleted",
        org_id=me.org_id,
        actor_id=str(me.id),
        actor_role=me.role.value,
        target_type="user",
        target_id=user_id,
        metadata=None,
        ip=client_ip,
        ip_salt=settings.ip_hash_salt,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/resend-invitation")
def resend_invitation(user_id: str, request: Request, me: MeResponse = Depends(require_roles(Role.admin))) -> dict[str, Any]:
    # Only for users without password (pending)
    with session_scope() as session:
        obj = session.get(UserORM, user_id)
        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        if obj.org_id != me.org_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if obj.password_hash is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El usuario ya activó su cuenta")
        email = obj.email
        name = obj.name
        role = obj.role

    # Check latest invitation status
    latest = get_latest_pending_invitation(me.org_id, email)
    manager = EmailTemplateManager(me.org_id)
    smtp_cfg, _ = _smtp_config_or_error(me.org_id)
    now = datetime.utcnow()
    client_ip = request.client.host if request.client else None

    if latest and latest.expires_at >= now:
        token_raw = get_invitation_token(latest.id)
        if not token_raw:
            # Fall back to new invitation if token is not available
            latest = None
        else:
            link = f"http://localhost:3000/auth-signup-basic?token={token_raw}&email={email}&name={name or ''}"
            context = {
                "invitee_name": name or email,
                "organization_name": manager.branding.brand_name,
                "invite_link": link,
                "invited_by_name": me.full_name or me.email,
                "expires_at": latest.expires_at.isoformat(),
            }
            try:
                outcome = send_templated_email(
                    org_id=me.org_id,
                    template_id="user_invitation",
                    smtp_cfg=smtp_cfg,
                    to_email=email,
                    context=context,
                    dedupe_key=f"invitation:{latest.id}",
                )
            except EmailRateLimitError as exc:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Espera {exc.retry_after_seconds} segundos antes de reenviar otra invitación",
                )
            except Exception as exc:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"No se pudo reenviar el correo: {exc}")

            action = "invitation_reused" if outcome.idempotent else "invitation_resent"
            log_event(
                action=action,
                org_id=me.org_id,
                actor_id=str(me.id),
                actor_role=me.role.value,
                target_type="user",
                target_id=user_id,
                metadata={"expires_at": latest.expires_at.isoformat(), "email": email},
                ip=client_ip,
                ip_salt=settings.ip_hash_salt,
            )
            trigger_webhook(
                me.org_id,
                "user.invited",
                {
                    "email": email,
                    "role": role,
                    "invited_by": str(me.id),
                    "user_id": user_id,
                    "expires_at": latest.expires_at.isoformat(),
                    "resent": True,
                    "idempotent": outcome.idempotent,
                },
            )
            return {
                "reused": True,
                "invitation_url": link,
                "expires_at": latest.expires_at.isoformat(),
                "idempotent": outcome.idempotent,
            }

    # Otherwise, create a new invitation
    new_invitation = create_invitation(org_id=me.org_id, invited_by=str(me.id), email=email, name=name, role=role)
    link = f"http://localhost:3000/auth-signup-basic?token={new_invitation.token}&email={email}&name={name or ''}"
    context = {
        "invitee_name": name or email,
        "organization_name": manager.branding.brand_name,
        "invite_link": link,
        "invited_by_name": me.full_name or me.email,
        "expires_at": new_invitation.expires_at.isoformat(),
    }
    try:
        outcome = send_templated_email(
            org_id=me.org_id,
            template_id="user_invitation",
            smtp_cfg=smtp_cfg,
            to_email=email,
            context=context,
            dedupe_key=f"invitation:{new_invitation.invitation_id}",
        )
    except EmailRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Espera {exc.retry_after_seconds} segundos antes de reenviar otra invitación",
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"No se pudo reenviar el correo: {exc}")

    log_event(
        action="invitation_resent",
        org_id=me.org_id,
        actor_id=str(me.id),
        actor_role=me.role.value,
        target_type="user",
        target_id=user_id,
        metadata={"email": email},
        ip=client_ip,
        ip_salt=settings.ip_hash_salt,
    )
    trigger_webhook(
        me.org_id,
        "user.invited",
        {
            "email": email,
            "role": role,
            "invited_by": str(me.id),
            "user_id": user_id,
            "expires_at": new_invitation.expires_at.isoformat(),
            "resent": False,
            "idempotent": outcome.idempotent,
        },
    )
    return {
        "reused": False,
        "invitation_url": link,
        "expires_at": new_invitation.expires_at.isoformat(),
        "idempotent": outcome.idempotent,
    }

class PasswordPolicyPayload(BaseModel):
    min_length: int = 10
    require_upper: bool = True
    require_number: bool = True
    require_symbol: bool = True


@router.get("/password-policy", response_model=PasswordPolicyPayload)
def get_password_policy(me: MeResponse = Depends(require_roles(Role.admin))) -> PasswordPolicyPayload:
    pol = get_policy(me.org_id)
    return PasswordPolicyPayload(min_length=pol.min_length, require_upper=pol.require_upper, require_number=pol.require_number, require_symbol=pol.require_symbol)


@router.patch("/password-policy", response_model=PasswordPolicyPayload)
def set_password_policy(payload: PasswordPolicyPayload, me: MeResponse = Depends(require_roles(Role.admin))) -> PasswordPolicyPayload:
    pol = update_policy(me.org_id, payload.min_length, payload.require_upper, payload.require_number, payload.require_symbol)
    return PasswordPolicyPayload(min_length=pol.min_length, require_upper=pol.require_upper, require_number=pol.require_number, require_symbol=pol.require_symbol)




@router.get("/invitations/validate")
def validate_invitation(token: str) -> dict[str, Any]:
    inv = get_invitation(token)
    if not inv:
        return {"valid": False, "expired": False, "used": False, "detail": "Invitación inválida"}
    expired = inv.expires_at < datetime.utcnow()
    used = inv.accepted_at is not None
    if expired:
        return {"valid": False, "expired": True, "used": used, "detail": "El enlace de invitación ha caducado. Solicita una nueva invitación."}
    if used:
        return {"valid": False, "expired": False, "used": True, "detail": "Este enlace ya fue utilizado."}
    return {"valid": True, "expired": False, "used": False, "email": inv.email, "name": inv.name, "expires_at": inv.expires_at.isoformat()}
