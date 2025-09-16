from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import text

from ..core.crypto import decrypt_str, encrypt_str
from ..core.database import engine


def ensure_table() -> None:
    ddl = (
        """
        CREATE TABLE IF NOT EXISTS invitation_tokens (
            invitation_id CHAR(36) PRIMARY KEY,
            token_enc TEXT NOT NULL,
            created_at DATETIME NOT NULL
        )
        """
    )
    with engine.begin() as conn:
        conn.execute(text(ddl))


def store_token(invitation_id: str, raw_token: str) -> None:
    ensure_table()
    sql = text(
        """
        INSERT INTO invitation_tokens (invitation_id, token_enc, created_at)
        VALUES (:invitation_id, :token_enc, :created_at)
        ON DUPLICATE KEY UPDATE token_enc = VALUES(token_enc), created_at = VALUES(created_at)
        """
    )
    with engine.begin() as conn:
        conn.execute(
            sql,
            {
                "invitation_id": invitation_id,
                "token_enc": encrypt_str(raw_token),
                "created_at": datetime.utcnow(),
            },
        )


def get_token(invitation_id: str) -> Optional[str]:
    ensure_table()
    sql = text(
        "SELECT token_enc FROM invitation_tokens WHERE invitation_id = :invitation_id LIMIT 1"
    )
    with engine.connect() as conn:
        row = conn.execute(sql, {"invitation_id": invitation_id}).first()
    if not row:
        return None
    try:
        return decrypt_str(row[0])
    except Exception:
        return None


def delete_token(invitation_id: str) -> None:
    ensure_table()
    sql = text("DELETE FROM invitation_tokens WHERE invitation_id = :invitation_id")
    with engine.begin() as conn:
        conn.execute(sql, {"invitation_id": invitation_id})
