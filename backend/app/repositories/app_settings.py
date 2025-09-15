from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import text

from ..core.database import engine
from ..core.crypto import encrypt_str, decrypt_str


def ensure_table() -> None:
    ddl = (
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            org_id CHAR(36) NOT NULL,
            key_name VARCHAR(64) NOT NULL,
            value_enc TEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (org_id, key_name)
        )
        """
    )
    with engine.connect() as conn:
        conn.execute(text(ddl))


def set_json(org_id: str, key: str, value: dict[str, Any]) -> None:
    ensure_table()
    now = datetime.utcnow()
    payload = encrypt_str(json.dumps(value))
    sql = text(
        """
        INSERT INTO app_settings (org_id, key_name, value_enc, updated_at)
        VALUES (:org_id, :key, :val, :ts)
        ON DUPLICATE KEY UPDATE value_enc=VALUES(value_enc), updated_at=VALUES(updated_at)
        """
    )
    with engine.connect() as conn:
        conn.execute(sql, {"org_id": org_id, "key": key, "val": payload, "ts": now})


def get_json(org_id: str, key: str) -> Optional[dict[str, Any]]:
    ensure_table()
    sql = text("SELECT value_enc FROM app_settings WHERE org_id=:org_id AND key_name=:key")
    with engine.connect() as conn:
        row = conn.execute(sql, {"org_id": org_id, "key": key}).first()
    if not row:
        return None
    try:
        data = json.loads(decrypt_str(row[0]))
        if isinstance(data, dict):
            return data  # type: ignore[return-value]
    except Exception:
        return None
    return None

