from __future__ import annotations

from sqlalchemy import CHAR, Column, Enum, String, TIMESTAMP

from ..core.database import Base


class UserORM(Base):
    __tablename__ = "users"

    id = Column(CHAR(36), primary_key=True)
    org_id = Column(CHAR(36), nullable=False)
    email = Column(String(254), unique=True, nullable=True)
    name = Column(String(200), nullable=True)
    password_hash = Column(String(128), nullable=True)
    role = Column(Enum("admin", "responsable", "investigador", "auditor", name="role_enum"), nullable=False)
    status = Column(Enum("active", "suspended", name="user_status_enum"), nullable=False)
    mfa_enabled = Column("mfa_enabled", String(1), nullable=False)  # stored as TINYINT(1), not used here
    created_at = Column(TIMESTAMP, nullable=False)
