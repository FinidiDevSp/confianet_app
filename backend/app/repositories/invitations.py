from __future__ import annotations

from datetime import datetime, timedelta
from hashlib import sha256
from typing import Optional
from uuid import uuid4

from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from ..core.database import session_scope
from ..core.settings import settings
from ..models.invitation import UserInvitationORM


def _hash(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def create_invitation(org_id: str, invited_by: str, email: str, name: Optional[str], role: str) -> tuple[str, datetime]:
    raw = str(uuid4())
    token_hash = _hash(raw)
    now = datetime.utcnow()
    expires = now + timedelta(seconds=settings.invitation_ttl_seconds)
    with session_scope() as session:  # type: Session
        inv = UserInvitationORM(
            id=str(uuid4()),
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
    return raw, expires


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
