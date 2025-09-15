from __future__ import annotations

from sqlalchemy import CHAR, Column, DateTime, String

from ..core.database import Base


class UserInvitationORM(Base):
    __tablename__ = "user_invitations"

    id = Column(CHAR(36), primary_key=True)
    org_id = Column(CHAR(36), nullable=False)
    email = Column(String(254), nullable=False, unique=False)
    name = Column(String(200), nullable=True)
    role = Column(String(32), nullable=False)
    token_hash = Column(String(128), nullable=False, unique=True)
    invited_by = Column(CHAR(36), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)

