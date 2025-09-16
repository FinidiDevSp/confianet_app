from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Set

from sqlalchemy import text

from ..core.database import engine


def create_delegation(*, id_: str, org_id: str, granter_id: str, grantee_id: str, roles: List[str], expires_at: datetime) -> None:
    sql = text(
        """
        INSERT INTO user_delegations (id, org_id, granter_id, grantee_id, roles_csv, created_at, expires_at)
        VALUES (:id, :org_id, :granter, :grantee, :roles_csv, :created_at, :expires_at)
        """
    )
    now = datetime.utcnow()
    with engine.begin() as conn:
        conn.execute(
            sql,
            {
                "id": id_,
                "org_id": org_id,
                "granter": granter_id,
                "grantee": grantee_id,
                "roles_csv": ",".join(sorted(set(roles))),
                "created_at": now,
                "expires_at": expires_at,
            },
        )


def revoke_delegation(id_: str) -> None:
    sql = text("UPDATE user_delegations SET revoked_at=:ts WHERE id=:id")
    with engine.begin() as conn:
        conn.execute(sql, {"id": id_, "ts": datetime.utcnow()})


def list_delegations(org_id: str) -> list[dict]:
    sql = text(
        """
        SELECT id, org_id, granter_id, grantee_id, roles_csv, created_at, expires_at, revoked_at
        FROM user_delegations
        WHERE org_id=:org_id
        ORDER BY created_at DESC
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(sql, {"org_id": org_id}).mappings().all()
    return [dict(r) for r in rows]


def get_active_roles_for_user(user_id: str, org_id: str) -> Set[str]:
    sql = text(
        """
        SELECT roles_csv
        FROM user_delegations
        WHERE org_id=:org_id AND grantee_id=:uid AND revoked_at IS NULL AND expires_at > :now
        """
    )
    now = datetime.utcnow()
    with engine.connect() as conn:
        rows = conn.execute(sql, {"org_id": org_id, "uid": user_id, "now": now}).all()
    roles: Set[str] = set()
    for (csv,) in rows:
        if csv:
            for r in csv.split(","):
                roles.add(r.strip())
    return roles

