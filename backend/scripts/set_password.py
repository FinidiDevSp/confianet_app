from __future__ import annotations

import argparse

from sqlalchemy import select

from backend.app.core.database import session_scope
from backend.app.core.security import hash_password
from backend.app.models.user import UserORM


def main() -> None:
    parser = argparse.ArgumentParser(description="Set bcrypt password hash for a user")
    parser.add_argument("email", help="User email")
    parser.add_argument("password", help="Plain password to hash")
    args = parser.parse_args()

    pwd_hash = hash_password(args.password)
    with session_scope() as session:
        row = session.execute(select(UserORM).where(UserORM.email == args.email)).scalar_one_or_none()
        if row is None:
            raise SystemExit(f"User not found: {args.email}")
        row.password_hash = pwd_hash
        session.add(row)
        print(f"Password hash set for {args.email}")


if __name__ == "__main__":
    main()

