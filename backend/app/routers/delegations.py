from __future__ import annotations

from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..core.deps import require_roles
from ..models.auth import MeResponse, Role
from ..repositories.delegations import create_delegation, list_delegations, revoke_delegation
from ..repositories.audit import log_event


router = APIRouter()


class CreateDelegationPayload(BaseModel):
    grantee_user_id: str
    roles: List[Role] = Field(min_length=1)
    expires_at: datetime


@router.post("", status_code=status.HTTP_201_CREATED)
def create(payload: CreateDelegationPayload, me: MeResponse = Depends(require_roles(Role.admin))) -> dict[str, Any]:
    from uuid import uuid4
    if payload.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expiration must be in the future")
    id_ = str(uuid4())
    create_delegation(
        id_=id_,
        org_id=me.org_id,
        granter_id=str(me.id),
        grantee_id=payload.grantee_user_id,
        roles=[r.value for r in payload.roles],
        expires_at=payload.expires_at,
    )
    log_event(
        "delegation.created", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value,
        target_type="user", target_id=payload.grantee_user_id, metadata={"roles": [r.value for r in payload.roles]},
        ip=None, ip_salt="",
    )
    return {"id": id_}


@router.get("")
def list_all(me: MeResponse = Depends(require_roles(Role.admin))) -> list[dict[str, Any]]:
    return list_delegations(me.org_id)


@router.post("/{delegation_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke(delegation_id: str, me: MeResponse = Depends(require_roles(Role.admin))) -> None:
    revoke_delegation(delegation_id)
    log_event("delegation.revoked", org_id=me.org_id, actor_id=str(me.id), actor_role=me.role.value, target_type="delegation", target_id=delegation_id, metadata=None, ip=None, ip_salt="")
    return None

