from __future__ import annotations

from sqlalchemy import CHAR, Boolean, Column, DateTime, String

from ..core.database import Base


class RefreshTokenORM(Base):
    __tablename__ = "auth_refresh_tokens"

    id = Column(CHAR(36), primary_key=True)
    user_id = Column(CHAR(36), nullable=False)
    token_hash = Column(String(128), nullable=False, unique=True)
    revoked = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False)

