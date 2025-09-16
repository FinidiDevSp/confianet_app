from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text

from ..core.database import engine
from ..core.deps import require_roles
from ..models.auth import MeResponse, Role

router = APIRouter()


@router.get("/logs", response_model=list[dict[str, Any]])
def list_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    me: Any = Depends(require_roles(Role.admin, Role.responsable, Role.investigador, Role.auditor)),
) -> list[dict[str, Any]]:
    base = (
        "SELECT id, org_id, actor_id, actor_role, action, target_type, target_id, ip_hash, created_at "
        "FROM audit_log WHERE 1=1"
    )
    params: dict[str, Any] = {"limit": limit, "offset": offset, "org_id": me.org_id}
    if action:
        base += " AND action = :action"
        params["action"] = action
    if role:
        base += " AND actor_role = :role"
        params["role"] = role
    # Non-admin users see only their own events
    if me.role != Role.admin:
        base += " AND actor_id = :actor_id"
        params["actor_id"] = str(me.id)
    base += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
    sql = text(base)
    with engine.connect() as conn:
        rows = conn.execute(sql, params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/stats", response_model=dict[str, int])
def stats(
    me: Any = Depends(require_roles(Role.admin, Role.responsable, Role.investigador, Role.auditor)),
) -> dict[str, int]:
    if me.role == Role.admin:
        sql = text(
            """
            SELECT action, COUNT(*) AS total
            FROM audit_log
            WHERE org_id = :org_id
            GROUP BY action
            """
        )
        params = {"org_id": me.org_id}
    else:
        sql = text(
            """
            SELECT action, COUNT(*) AS total
            FROM audit_log
            WHERE org_id = :org_id AND actor_id = :actor_id
            GROUP BY action
            """
        )
        params = {"org_id": me.org_id, "actor_id": str(me.id)}
    with engine.connect() as conn:
        rows = conn.execute(sql, params).all()
    return {action: int(total) for action, total in rows}
