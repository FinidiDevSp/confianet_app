from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.database import session_scope
from ..models.user import UserORM
from ..models.auth import Role, User, UserOut


class UserRepository:
    def get_by_email(self, email: str) -> Optional[User]:
        with session_scope() as session:  # type: Session
            stmt = select(UserORM).where(UserORM.email == email)
            row = session.execute(stmt).scalar_one_or_none()
            if row is None:
                return None
            return User(
                id=row.id,
                email=row.email or "",
                full_name=row.name or "",
                role=Role(row.role),
                password_hash=row.password_hash or "",
                status=str(row.status),
            )

    def get_by_id(self, id_: str) -> Optional[UserOut]:
        with session_scope() as session:
            row = session.get(UserORM, id_)
            if row is None:
                return None
            return UserOut(
                id=row.id,
                email=row.email or "",
                full_name=row.name or "",
                role=Role(row.role),
                status=str(row.status),
            )


users_repo = UserRepository()
