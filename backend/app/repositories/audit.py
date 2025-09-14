from __future__ import annotations

from hashlib import sha256
from typing import Any, Optional
import json

from sqlalchemy.orm import Session
from sqlalchemy import text

from ..core.database import session_scope


def _hash_ip(ip: Optional[str], salt: str) -> Optional[str]:
    if not ip:
        return None
    return sha256(f"{ip}{salt}".encode("utf-8")).hexdigest()


def log_event(action: str, org_id: Optional[str], actor_id: Optional[str], actor_role: Optional[str], target_type: Optional[str], target_id: Optional[str], metadata: Optional[dict[str, Any]], ip: Optional[str], ip_salt: str) -> None:
    ip_hash = _hash_ip(ip, ip_salt)
    # Direct SQL to existing audit_log table to avoid defining ORM
    with session_scope() as session:
        session.execute(
            text(
                """
                INSERT INTO audit_log (id, org_id, actor_id, actor_role, action, target_type, target_id, metadata, ip_hash)
                VALUES (UUID(), :org_id, :actor_id, :actor_role, :action, :target_type, :target_id, :metadata, :ip_hash)
                """
            ),
            {
                "org_id": org_id,
                "actor_id": actor_id,
                "actor_role": actor_role,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "metadata": json.dumps(metadata) if metadata is not None else None,
                "ip_hash": ip_hash,
            },
        )
