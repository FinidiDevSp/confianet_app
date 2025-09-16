from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel, Field, EmailStr

from ..core.deps import require_roles
from ..models.auth import MeResponse, Role
from ..repositories.delegations import create_delegation, list_delegations, revoke_delegation
from ..repositories.audit import log_event


router = APIRouter()


class CreateDelegationPayload(BaseModel):
    grantee_email: EmailStr
    roles: List[Role] = Field(min_length=1)
    expires_at: datetime


@router.post("", status_code=status.HTTP_201_CREATED)
def create(payload: CreateDelegationPayload, me: MeResponse = Depends(require_roles(Role.admin))) -> dict[str, Any]:
    from uuid import uuid4
    # Normalize datetimes to UTC-aware for comparison
    now_utc = datetime.now(timezone.utc)
    exp = payload.expires_at
    exp_utc = exp.astimezone(timezone.utc) if exp.tzinfo is not None else exp.replace(tzinfo=timezone.utc)
    if exp_utc <= now_utc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expiration must be in the future")
    id_ = str(uuid4())
    # resolve grantee by email within org
    from ..repositories.users import users_repo
    grantee = users_repo.get_by_email(str(payload.grantee_email))
    if not grantee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario destinatario no encontrado")
    if grantee.org_id != me.org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario fuera de tu organización")
    # Store naive UTC in DB (DATETIME assumed UTC)
    exp_naive_utc = exp_utc.replace(tzinfo=None)
    create_delegation(
        id_=id_,
        org_id=me.org_id,
        granter_id=str(me.id),
        grantee_id=str(grantee.id),
        roles=[r.value for r in payload.roles],
        expires_at=exp_naive_utc,
    )
    log_event(
        "delegation.created", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value,
        target_type="user", target_id=str(grantee.id), metadata={"roles": [r.value for r in payload.roles], "grantee_email": str(payload.grantee_email)},
        ip=None, ip_salt="",
    )
    return {"id": id_}


@router.get("")
def list_all(me: MeResponse = Depends(require_roles(Role.admin))) -> list[dict[str, Any]]:
    return list_delegations(me.org_id)


@router.post("/{delegation_id}/revoke", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def revoke(delegation_id: str, me: MeResponse = Depends(require_roles(Role.admin))) -> Response:
    revoke_delegation(delegation_id)
    log_event("delegation.revoked", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type="delegation", target_id=delegation_id, metadata=None, ip=None, ip_salt="")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
