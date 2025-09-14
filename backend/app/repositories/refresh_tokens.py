from __future__ import annotations

from datetime import datetime
from hashlib import sha256
from typing import Optional
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.database import session_scope
from ..models.refresh_token import RefreshTokenORM


def _hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def store_refresh_token(user_id: str, token: str, expires_at_ts: int) -> str:
    token_id = str(uuid4())
    token_hash = _hash_token(token)
    with session_scope() as session:  # type: Session
        obj = RefreshTokenORM(
            id=token_id,
            user_id=user_id,
            token_hash=token_hash,
            revoked=False,
            expires_at=datetime.fromtimestamp(expires_at_ts),
            created_at=datetime.utcnow(),
        )
        session.add(obj)
    return token_id


def revoke_refresh_token(token: str) -> None:
    token_hash = _hash_token(token)
    with session_scope() as session:
        row = session.execute(
            select(RefreshTokenORM).where(RefreshTokenORM.token_hash == token_hash)
        ).scalar_one_or_none()
        if row:
            row.revoked = True
            session.add(row)


def is_refresh_token_valid(token: str) -> bool:
    token_hash = _hash_token(token)
    with session_scope() as session:
        row = session.execute(
            select(RefreshTokenORM).where(RefreshTokenORM.token_hash == token_hash)
        ).scalar_one_or_none()
        if row is None:
            return False
        if row.revoked:
            return False
        if row.expires_at <= datetime.utcnow():
            return False
        return True

