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
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if action:
        base += " AND action = :action"
        params["action"] = action
    if role:
        base += " AND actor_role = :role"
        params["role"] = role
    base += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
    sql = text(base)
    with engine.connect() as conn:
        rows = conn.execute(sql, params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/stats", response_model=dict[str, int])
def stats(
    me: MeResponse = Depends(require_roles(Role.admin, Role.responsable, Role.investigador, Role.auditor)),
) -> dict[str, int]:
    sql = text(
        """
        SELECT action, COUNT(*) AS total
        FROM audit_log
        GROUP BY action
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(sql).all()
    return {action: int(total) for action, total in rows}
