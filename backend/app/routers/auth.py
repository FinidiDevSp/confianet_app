from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

from ..core.security import decode_jwt
from ..core.settings import settings
from ..models.auth import LoginRequest, MeResponse, TokenResponse, UserOut, Role
from ..services.auth import authenticate_user, issue_tokens, me_from_user_id
from ..core.deps import require_roles, require_real_roles
from ..repositories.refresh_tokens import is_refresh_token_valid, revoke_refresh_token
from ..repositories.audit import log_event
from ..core.rate_limit import rate_limiter
from ..repositories.mfa import get_mfa
from ..core.crypto import decrypt_str, encrypt_str
import pyotp
import qrcode
import io
import base64
import json as _json

router = APIRouter()

auth_scheme = HTTPBearer(auto_error=False)


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        max_age=settings.refresh_ttl_seconds,
        path="/api/auth",
    )


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(request: Request, response: Response) -> TokenResponse:
    # Accept JSON or form-encoded bodies for flexibility with clients
    data: dict
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("invalid body")
    except Exception:
        form = await request.form()
        data = {"email": form.get("email"), "password": form.get("password")}

    try:
        payload = LoginRequest.model_validate(data)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request body")

    # rate limit by email+ip
    client_ip = request.client.host if request.client else None
    key = f"{payload.email}|{client_ip}"
    ok, remaining, wait_seconds = rate_limiter.check_and_increment(key)
    if not ok:
        # org_id unknown; skip audit if org_id is None (enforced in log_event)
        log_event("login_rate_limited", org_id=None, actor_id=None, actor_role=None, target_type=None, target_id=None, metadata={"email": payload.email}, ip=client_ip, ip_salt=settings.ip_hash_salt)
        minutes = max((wait_seconds + 59) // 60, 1)
        detail = f"Demasiados intentos. Intenta de nuevo en {minutes} minutos"
        return JSONResponse(status_code=status.HTTP_429_TOO_MANY_REQUESTS, content={"detail": detail, "retry_after_minutes": minutes, "remaining": 0}, headers={"Retry-After": str(minutes * 60)})

    try:
        user: UserOut = authenticate_user(payload.email, payload.password)
    except HTTPException as exc:
        if exc.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN):
            # If user exists, log failed attempt with org_id
            from ..repositories.users import users_repo
            existing = users_repo.get_by_email(payload.email)
            org_for_log = getattr(existing, "org_id", None) if existing else None
            log_event("login_failed", org_id=org_for_log, actor_id=None, actor_role=None, target_type=None, target_id=None, metadata={"email": payload.email}, ip=client_ip, ip_salt=settings.ip_hash_salt)
            # Special-case forbidden accounts: always show a clear message
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                status_str = getattr(existing, "status", None) if existing else None
                if status_str == "suspended":
                    detail = "Tu cuenta está suspendida. Contacta al administrador."
                elif status_str == "pending":
                    detail = "Tu cuenta aún no está activada. Revisa tu email para completar el registro."
                else:
                    detail = "Cuenta no activa"
                raise HTTPException(status_code=exc.status_code, detail=detail)
            # Include remaining attempts in message or show blocked info
            if remaining <= 0:
                seconds = rate_limiter.force_block(key)
                minutes = max((seconds + 59) // 60, 1)
                detail = f"Usuario bloqueado. Intenta de nuevo en {minutes} minutos"
            else:
                detail = f"Credenciales inválidas. Intentos restantes: {remaining}"
            raise HTTPException(status_code=exc.status_code, detail=detail)
        raise
    # Enrich with delegated roles for UI/menus
    from ..repositories.delegations import get_active_roles_for_user
    delegated = list(get_active_roles_for_user(str(user.id), user.org_id))
    user = UserOut.model_validate({**user.model_dump(), "delegated_roles": delegated})

    # If 2FA is enabled, return a challenge instead of tokens
    if getattr(user, "mfa_enabled", False):
        # generate a short-lived MFA token (JWT) that encodes user id
        from ..core.security import create_jwt
        mfa_token = create_jwt(subject=str(user.id), data={"type": "mfa"}, ttl_seconds=300)
        return JSONResponse(status_code=status.HTTP_200_OK, content={"mfa_required": True, "mfa_token": mfa_token})

    access, refresh = issue_tokens(user)
    set_refresh_cookie(response, refresh)
    # audit: login success
    log_event("login_success", org_id=user.org_id, actor_id=str(user.id), actor_role=user.role.value, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    # reset limiter after success
    rate_limiter.reset(key)
    return TokenResponse(access_token=access, user=user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response) -> TokenResponse:
    raw: Optional[str] = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    # Verify the token is known and not revoked (rotation)
    if not is_refresh_token_valid(raw):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    data = decode_jwt(raw)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user_id = str(data["sub"])  # sub is user id (UUID)
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    # rotate: revoke current and issue a new refresh
    revoke_refresh_token(raw)
    from ..repositories.delegations import get_active_roles_for_user
    delegated = list(get_active_roles_for_user(str(me.id), me.org_id))
    me = MeResponse.model_validate({**me.model_dump(), "delegated_roles": delegated})
    access, refresh_token = issue_tokens(me)
    set_refresh_cookie(response, refresh_token)
    # audit: refresh success
    client_ip = request.client.host if request.client else None
    log_event("token_refreshed", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    return TokenResponse(access_token=access, user=me)


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: Optional[str] = None
    recovery_code: Optional[str] = None


@router.post("/mfa/verify", response_model=TokenResponse)
def mfa_verify(payload: MfaVerifyRequest, request: Request, response: Response) -> TokenResponse:
    # decode mfa token
    data = decode_jwt(payload.mfa_token)
    if not data or data.get("type") != "mfa":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA token")
    user_id = str(data["sub"])  # user id
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    rec = get_mfa(user_id)
    if not rec or not rec.get("enabled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA not enabled")

    # decrypt secret and codes
    try:
        secret = decrypt_str(rec["secret_enc"])
        recovery_codes_json_enc = rec["recovery_codes_enc"]
        recovery_codes_json = decrypt_str(recovery_codes_json_enc)
        recovery_codes: list[str] = []
        try:
            import json as _json
            recovery_codes = _json.loads(recovery_codes_json)
        except Exception:
            recovery_codes = []
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="MFA data error")

    client_ip = request.client.host if request.client else None

    verified = False
    if payload.code:
        totp = pyotp.TOTP(secret)
        verified = bool(totp.verify(payload.code, valid_window=1))
    elif payload.recovery_code:
        if payload.recovery_code in recovery_codes:
            verified = True
            # consume the code
            recovery_codes.remove(payload.recovery_code)
            from ..core.crypto import encrypt_str
            from sqlalchemy import text
            from ..core.database import engine
            with engine.begin() as conn:
                conn.execute(text("UPDATE user_mfa SET recovery_codes_enc=:rc WHERE user_id=:uid"), {"rc": encrypt_str(_json.dumps(recovery_codes)), "uid": user_id})
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing code")

    if not verified:
        log_event("2fa.login.failed", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    # success
    access, refresh = issue_tokens(me)
    set_refresh_cookie(response, refresh)
    log_event("2fa.login.success", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    return TokenResponse(access_token=access, user=me)


class MfaSetupStartPayload(BaseModel):
    mfa_token: str


class MfaStartResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_data_url: str


@router.post("/mfa/setup/start", response_model=MfaStartResponse)
def mfa_setup_start_from_mfa(payload: MfaSetupStartPayload) -> MfaStartResponse:
    data = decode_jwt(payload.mfa_token)
    if not data or data.get("type") != "mfa":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA token")
    user_id = str(data["sub"])
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    from ..repositories.mfa import get_mfa
    # If already configured, block setup here
    rec = get_mfa(user_id)
    if rec and rec.get("enabled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA already configured")
    # Generate secret and QR
    secret = pyotp.random_base32()
    issuer = "Confianet"
    label = f"{me.email}"
    otpauth_url = pyotp.totp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)
    img = qrcode.make(otpauth_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
    return MfaStartResponse(secret=secret, otpauth_url=otpauth_url, qr_data_url=data_url)


class MfaSetupConfirmPayload(BaseModel):
    mfa_token: str
    secret: str
    code: str


class MfaConfirmResponse(BaseModel):
    recovery_codes: list[str]


@router.post("/mfa/setup/confirm", response_model=MfaConfirmResponse)
def mfa_setup_confirm_from_mfa(payload: MfaSetupConfirmPayload) -> MfaConfirmResponse:
    data = decode_jwt(payload.mfa_token)
    if not data or data.get("type") != "mfa":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA token")
    user_id = str(data["sub"])
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    totp = pyotp.TOTP(payload.secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código 2FA inválido")
    # Generate recovery codes and persist
    recovery = [base64.urlsafe_b64encode(__import__('os').urandom(9)).decode('utf-8')[:10] for _ in range(10)]
    secret_enc = encrypt_str(payload.secret)
    recovery_enc = encrypt_str(_json.dumps(recovery))
    from ..repositories.mfa import upsert_mfa
    upsert_mfa(user_id=user_id, secret_enc=secret_enc, recovery_codes_enc=recovery_enc, enabled=True)
    # Audit
    log_event("2fa.enabled", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type=None, target_id=None, metadata=None, ip=None, ip_salt=settings.ip_hash_salt)
    return MfaConfirmResponse(recovery_codes=recovery)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, request: Request) -> Response:
    raw: Optional[str] = request.cookies.get("refresh_token")
    if raw:
        revoke_refresh_token(raw)
    response.delete_cookie(key="refresh_token", path="/api/auth")
    # audit: logout
    client_ip = request.client.host if request.client else None
    log_event("logout", org_id=None, actor_id=None, actor_role=None, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class ImpersonateStartPayload(BaseModel):
    target_email: EmailStr


@router.post("/impersonate/start")
def impersonate_start(payload: ImpersonateStartPayload, request: Request, me: MeResponse = Depends(require_real_roles(Role.admin))) -> dict:
    _require_step_up(request, str(me.id))
    # Issue an access token for the target user without refresh (short-lived), include imp_by claim
    from ..repositories.users import users_repo
    target_user = users_repo.get_by_email(str(payload.target_email))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario objetivo no encontrado")
    if target_user.org_id != me.org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario fuera de tu organización")
    target = me_from_user_id(str(target_user.id))
    from ..core.security import create_jwt
    access = create_jwt(subject=str(target.id), data={"role": str(target.role), "type": "access", "imp_by": str(me.id), "impersonating": True}, ttl_seconds=900)
    # audit
    log_event("admin.impersonate.start", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type="user", target_id=str(target.id), metadata={"target_email": str(payload.target_email)}, ip=None, ip_salt=settings.ip_hash_salt)
    return {"access_token": access, "token_type": "bearer", "user": target, "impersonating": True}


@router.post("/impersonate/stop")
def impersonate_stop(me: MeResponse = Depends(require_roles(Role.admin, Role.responsable, Role.investigador, Role.auditor)), request: Request = None) -> dict:
    # Current token belongs to impersonated user; retrieve imp_by from token and return admin tokens
    auth_header = request.headers.get("Authorization") if request else None
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = auth_header.split(" ", 1)[1]
    data = decode_jwt(token)
    imp_by = data.get("imp_by") if data else None
    if not imp_by:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No impersonation active")
    admin_user = me_from_user_id(str(imp_by))
    if not admin_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    access, refresh = issue_tokens(admin_user)
    # audit stop
    log_event("admin.impersonate.stop", org_id=admin_user.org_id, actor_id=str(admin_user.id), actor_role=admin_user.role.value, target_type="user", target_id=str(me.id), metadata=None, ip=None, ip_salt=settings.ip_hash_salt)
    return TokenResponse(access_token=access, user=admin_user).model_dump()


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(auth_scheme)) -> MeResponse:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    data = decode_jwt(creds.credentials)
    if not data or data.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = str(data["sub"])  # sub is user id (UUID)
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return me


@router.get("/me", response_model=MeResponse)
def me(me: MeResponse = Depends(get_current_user)) -> MeResponse:
    from ..repositories.delegations import get_active_roles_for_user
    delegated = list(get_active_roles_for_user(str(me.id), me.org_id))
    return MeResponse.model_validate({**me.model_dump(), "delegated_roles": delegated})
class StepUpPayload(BaseModel):
    code: Optional[str] = None
    recovery_code: Optional[str] = None


@router.post("/step-up")
def step_up(payload: StepUpPayload, request: Request) -> dict:
    me = get_current_user(HTTPAuthorizationCredentials(scheme="bearer", credentials=request.headers.get("Authorization", "").split(" ")[-1]) if request.headers.get("Authorization") else None)
    rec = get_mfa(str(me.id))
    if not rec or not rec.get("enabled"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA not enabled")
    # validate same as MFA verify
    secret = decrypt_str(rec["secret_enc"]) if rec.get("secret_enc") else ""
    ok = False
    if payload.code:
        totp = pyotp.TOTP(secret)
        ok = bool(totp.verify(payload.code, valid_window=1))
    elif payload.recovery_code:
        codes = []
        try:
            codes = _json.loads(decrypt_str(rec["recovery_codes_enc"]))
        except Exception:
            codes = []
        ok = payload.recovery_code in codes
    if not ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")
    # issue short-lived step-up token
    from ..core.security import create_jwt
    token = create_jwt(subject=str(me.id), data={"type": "stepup"}, ttl_seconds=300)
    log_event("stepup.success", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type=None, target_id=None, metadata=None, ip=None, ip_salt=settings.ip_hash_salt)
    return {"step_up_token": token}


def _require_step_up(request: Request, user_id: str) -> None:
    tok = request.headers.get("X-Step-Up") or request.headers.get("x-step-up")
    if not tok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Step-up required")
    data = decode_jwt(tok)
    if not data or data.get("type") != "stepup" or str(data.get("sub")) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid step-up token")
