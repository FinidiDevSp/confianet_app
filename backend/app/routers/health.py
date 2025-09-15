from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from ..core.database import engine

router = APIRouter()


@router.get("/health", tags=["health"], status_code=status.HTTP_200_OK)
def health() -> dict[str, str]:
    """Simple liveness/readiness probe.

    Returns 200 if the API is up and the DB connection is healthy.
    Returns 503 if the DB connection fails.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception:
        # Do not leak internal error details
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="database unavailable")

