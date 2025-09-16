from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256
from typing import Optional
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..core.database import session_scope
from ..core.settings import settings
from ..models.invitation import UserInvitationORM
from .invitation_tokens import delete_token, store_token


@dataclass
class InvitationToken:
    token: str
    invitation_id: str
    expires_at: datetime


def _hash(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def create_invitation(org_id: str, invited_by: str, email: str, name: Optional[str], role: str) -> InvitationToken:
    raw = str(uuid4())
    token_hash = _hash(raw)
    now = datetime.utcnow()
    expires = now + timedelta(seconds=settings.invitation_ttl_seconds)
    invitation_id = str(uuid4())
    with session_scope() as session:  # type: Session
        inv = UserInvitationORM(
            id=invitation_id,
            org_id=org_id,
            email=email,
            name=name,
            role=role,
            token_hash=token_hash,
            invited_by=invited_by,
            created_at=now,
            expires_at=expires,
        )
        session.add(inv)
    store_token(invitation_id, raw)
    return InvitationToken(token=raw, invitation_id=invitation_id, expires_at=expires)


def get_invitation(token: str) -> Optional[UserInvitationORM]:
    token_hash = _hash(token)
    with session_scope() as session:
        return session.execute(select(UserInvitationORM).where(UserInvitationORM.token_hash == token_hash)).scalar_one_or_none()


def mark_accepted(inv: UserInvitationORM) -> None:
    with session_scope() as session:
        obj = session.get(UserInvitationORM, inv.id)
        if obj:
            obj.accepted_at = datetime.utcnow()
            session.add(obj)
    delete_token(inv.id)


def get_latest_pending_invitation(org_id: str, email: str) -> Optional[UserInvitationORM]:
    """Returns the latest non-accepted invitation for an email within an org."""
    with session_scope() as session:  # type: Session
        stmt = (
            select(UserInvitationORM)
            .where(UserInvitationORM.org_id == org_id)
            .where(UserInvitationORM.email == email)
            .where(UserInvitationORM.accepted_at.is_(None))
            .order_by(desc(UserInvitationORM.created_at))
            .limit(1)
        )
        return session.execute(stmt).scalar_one_or_none()
