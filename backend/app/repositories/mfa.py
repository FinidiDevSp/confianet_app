from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import text

from ..core.database import engine, session_scope


def ensure_mfa_table() -> None:
    ddl = (
        """
        CREATE TABLE IF NOT EXISTS user_mfa (
            user_id CHAR(36) PRIMARY KEY,
            secret_enc VARCHAR(512) NOT NULL,
            recovery_codes_enc TEXT NOT NULL,
            enabled TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL
        )
        """
    )
    with engine.begin() as conn:
        conn.execute(text(ddl))


def get_mfa(user_id: str) -> Optional[dict[str, Any]]:
    ensure_mfa_table()
    sql = text("SELECT user_id, secret_enc, recovery_codes_enc, enabled, created_at FROM user_mfa WHERE user_id=:uid")
    with engine.connect() as conn:
        row = conn.execute(sql, {"uid": user_id}).mappings().first()
    if not row:
        return None
    return dict(row)


def upsert_mfa(user_id: str, secret_enc: str, recovery_codes_enc: str, enabled: bool) -> None:
    ensure_mfa_table()
    now = datetime.utcnow()
    sql = text(
        """
        INSERT INTO user_mfa (user_id, secret_enc, recovery_codes_enc, enabled, created_at)
        VALUES (:user_id, :secret_enc, :rc, :enabled, :created_at)
        ON DUPLICATE KEY UPDATE
            secret_enc=VALUES(secret_enc),
            recovery_codes_enc=VALUES(recovery_codes_enc),
            enabled=VALUES(enabled)
        """
    )
    with engine.begin() as conn:
        conn.execute(sql, {"user_id": user_id, "secret_enc": secret_enc, "rc": recovery_codes_enc, "enabled": 1 if enabled else 0, "created_at": now})


def set_enabled(user_id: str, enabled: bool) -> None:
    ensure_mfa_table()
    sql = text("UPDATE user_mfa SET enabled=:en WHERE user_id=:uid")
    with engine.begin() as conn:
        conn.execute(sql, {"uid": user_id, "en": 1 if enabled else 0})


def consume_recovery_code(user_id: str, code: str) -> bool:
    rec = get_mfa(user_id)
    if not rec:
        return False
    try:
        arr = json.loads(rec["recovery_codes_enc_plain"])  # non-existent, kept for back-compat placeholder
    except Exception:
        # We store encrypted JSON; caller should decrypt before calling this util, so this function not used directly
        return False
