from __future__ import annotations

from sqlalchemy import CHAR, Column, DateTime, Integer, Boolean

from ..core.database import Base


class PasswordPolicyORM(Base):
    __tablename__ = "password_policies"

    id = Column(CHAR(36), primary_key=True)
    org_id = Column(CHAR(36), nullable=True)
    min_length = Column(Integer, nullable=False)
    require_upper = Column(Boolean, nullable=False)
    require_number = Column(Boolean, nullable=False)
    require_symbol = Column(Boolean, nullable=False)
    updated_at = Column(DateTime, nullable=False)

