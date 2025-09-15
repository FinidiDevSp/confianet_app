from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import select

from ..core.database import session_scope
from ..models.password_policy import PasswordPolicyORM


def get_policy(org_id: Optional[str]) -> PasswordPolicyORM:
    with session_scope() as session:
        if org_id:
            row = session.execute(select(PasswordPolicyORM).where(PasswordPolicyORM.org_id == org_id)).scalar_one_or_none()
            if row:
                return row
        # fallback global
        row = session.execute(select(PasswordPolicyORM).where(PasswordPolicyORM.org_id.is_(None))).scalar_one_or_none()
        if row:
            return row
        # default
        obj = PasswordPolicyORM(id="default", org_id=None, min_length=10, require_upper=True, require_number=True, require_symbol=True, updated_at=datetime.utcnow())
        session.add(obj)
        return obj


def update_policy(org_id: Optional[str], min_length: int, require_upper: bool, require_number: bool, require_symbol: bool) -> PasswordPolicyORM:
    with session_scope() as session:
        row = None
        if org_id:
            row = session.execute(select(PasswordPolicyORM).where(PasswordPolicyORM.org_id == org_id)).scalar_one_or_none()
        if not row:
            row = PasswordPolicyORM(id=str(datetime.utcnow().timestamp()), org_id=org_id, min_length=min_length, require_upper=require_upper, require_number=require_number, require_symbol=require_symbol, updated_at=datetime.utcnow())
            session.add(row)
        else:
            row.min_length = min_length
            row.require_upper = require_upper
            row.require_number = require_number
            row.require_symbol = require_symbol
            row.updated_at = datetime.utcnow()
            session.add(row)
        return row

