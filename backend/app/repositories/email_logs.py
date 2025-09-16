from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
from typing import Optional
from uuid import uuid4

from sqlalchemy import text

from ..core.database import engine


@dataclass
class EmailSendLogEntry:
    id: str
    org_id: str
    template_name: str
    to_email: str
    dedupe_hash: Optional[str]
    sent_at: datetime


def _row_to_entry(row: tuple[str, str, str, str, Optional[str], datetime]) -> EmailSendLogEntry:
    return EmailSendLogEntry(
        id=row[0],
        org_id=row[1],
        template_name=row[2],
        to_email=row[3],
        dedupe_hash=row[4],
        sent_at=row[5],
    )


def ensure_table() -> None:
    ddl = (
        """
        CREATE TABLE IF NOT EXISTS email_send_log (
            id CHAR(36) NOT NULL,
            org_id CHAR(36) NOT NULL,
            template_name VARCHAR(128) NOT NULL,
            to_email VARCHAR(254) NOT NULL,
            dedupe_hash CHAR(64) NULL,
            sent_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_email_log_org_template (org_id, template_name, to_email, sent_at),
            INDEX idx_email_log_dedupe (org_id, dedupe_hash)
        )
        """
    )
    with engine.begin() as conn:
        conn.execute(text(ddl))


def _hash(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def record_send(org_id: str, template_name: str, to_email: str, *, dedupe_key: Optional[str] = None, sent_at: Optional[datetime] = None) -> None:
    ensure_table()
    now = sent_at or datetime.utcnow()
    dedupe_hash = _hash(dedupe_key) if dedupe_key else None
    sql = text(
        """
        INSERT INTO email_send_log (id, org_id, template_name, to_email, dedupe_hash, sent_at)
        VALUES (:id, :org_id, :template_name, :to_email, :dedupe_hash, :sent_at)
        """
    )
    with engine.begin() as conn:
        conn.execute(
            sql,
            {
                "id": str(uuid4()),
                "org_id": org_id,
                "template_name": template_name,
                "to_email": to_email,
                "dedupe_hash": dedupe_hash,
                "sent_at": now,
            },
        )


def get_last_send(org_id: str, template_name: str, to_email: str) -> Optional[EmailSendLogEntry]:
    ensure_table()
    sql = text(
        """
        SELECT id, org_id, template_name, to_email, dedupe_hash, sent_at
        FROM email_send_log
        WHERE org_id = :org_id AND template_name = :template_name AND to_email = :to_email
        ORDER BY sent_at DESC
        LIMIT 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(
            sql, {"org_id": org_id, "template_name": template_name, "to_email": to_email}
        ).first()
    if not row:
        return None
    return _row_to_entry(row)


def get_last_by_dedupe(org_id: str, dedupe_key: str) -> Optional[EmailSendLogEntry]:
    ensure_table()
    dedupe_hash = _hash(dedupe_key)
    sql = text(
        """
        SELECT id, org_id, template_name, to_email, dedupe_hash, sent_at
        FROM email_send_log
        WHERE org_id = :org_id AND dedupe_hash = :dedupe_hash
        ORDER BY sent_at DESC
        LIMIT 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(sql, {"org_id": org_id, "dedupe_hash": dedupe_hash}).first()
    if not row:
        return None
    return _row_to_entry(row)
