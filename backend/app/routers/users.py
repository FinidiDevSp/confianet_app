from __future__ import annotations

from typing import Any, Optional
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from ..core.deps import require_roles
from ..models.auth import MeResponse, Role
from ..repositories.invitations import create_invitation, get_invitation, mark_accepted
from ..repositories.password_policy import get_policy, update_policy
from ..core.security import hash_password, validate_password_policy
from ..repositories.users import users_repo
from ..core.database import session_scope
from ..models.user import UserORM


router = APIRouter()


class InvitePayload(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    role: Role = Role.investigador


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
def invite_user(payload: InvitePayload, me: MeResponse = Depends(require_roles(Role.admin))) -> dict[str, Any]:
    token, expires = create_invitation(org_id=me.org_id, invited_by=str(me.id), email=payload.email, name=payload.name, role=payload.role.value)
    # Ensure user exists in suspended (pending) state until password is set
    with session_scope() as session:
        existing = users_repo.get_by_email(payload.email)
        if not existing:
            u = UserORM(
                id=str(uuid4()),
                org_id=me.org_id,
                email=payload.email,
                name=payload.name,
                role=payload.role.value,
                status='suspended',
                mfa_enabled='0',
                created_at=datetime.utcnow(),
                password_hash=None,
            )
            session.add(u)
    # In dev, return the link to signup page with token and prefilled data
    link = f"http://localhost:3000/auth-signup-basic?token={token}&email={payload.email}&name={payload.name or ''}"
    return {"invitation_url": link, "expires_at": expires.isoformat()}


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
    with session_scope() as session:
        existing = users_repo.get_by_email(inv.email)
        if existing:
            obj = session.get(UserORM, existing.id)
            if obj:
                obj.password_hash = pwd_hash
                obj.status = 'active'
                session.add(obj)
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
    mark_accepted(inv)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class UpdateUserPayload(BaseModel):
    name: Optional[str] = None
    role: Optional[Role] = None
    status: Optional[str] = None  # 'active' | 'suspended'


@router.get("", response_model=list[dict[str, Any]])
def list_users(me: MeResponse = Depends(require_roles(Role.admin))) -> list[dict[str, Any]]:
    # Minimal listing with SQL to avoid new repo method
    from sqlalchemy import text
    from ..core.database import engine
    sql = text("SELECT id, org_id, email, name, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 100")
    with engine.connect() as conn:
        rows = conn.execute(sql).mappings().all()
    return [dict(r) for r in rows]


@router.patch("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def update_user(user_id: str, payload: UpdateUserPayload, me: MeResponse = Depends(require_roles(Role.admin))) -> Response:
    with session_scope() as session:
        obj = session.get(UserORM, user_id)
        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        if payload.name is not None:
            obj.name = payload.name
        if payload.role is not None:
            obj.role = payload.role.value
        if payload.status is not None:
            obj.status = payload.status
        session.add(obj)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/suspend", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def suspend_user(user_id: str, me: MeResponse = Depends(require_roles(Role.admin))) -> Response:
    with session_scope() as session:
        obj = session.get(UserORM, user_id)
        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        obj.status = 'suspended'
        session.add(obj)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
