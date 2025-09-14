from __future__ import annotations

from typing import Dict, Optional

from ..core.security import hash_password
from ..models.auth import Role, User


class InMemoryUserRepository:
    def __init__(self) -> None:
        # Seed users for development
        self._users: Dict[str, User] = {}
        self._by_id: Dict[int, User] = {}

        self._add_user(1, "admin@themesbrand.com", "Admin", Role.admin, "123456")
        self._add_user(2, "responsable@example.com", "Responsable", Role.responsable, "123456")
        self._add_user(3, "investigador@example.com", "Investigador", Role.investigador, "123456")
        self._add_user(4, "auditor@example.com", "Auditor", Role.auditor, "123456")

    def _add_user(self, id_: int, email: str, name: str, role: Role, password: str) -> None:
        user = User(
            id=id_,
            email=email,
            full_name=name,
            role=role,
            password_hash=hash_password(password),
        )
        self._users[email.lower()] = user
        self._by_id[id_] = user

    def get_by_email(self, email: str) -> Optional[User]:
        return self._users.get(email.lower())

    def get_by_id(self, id_: int) -> Optional[User]:
        return self._by_id.get(id_)


users_repo = InMemoryUserRepository()

