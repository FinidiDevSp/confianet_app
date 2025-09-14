from __future__ import annotations

from typing import Iterable, List

from fastapi import Depends, HTTPException, status

from ..models.auth import MeResponse, Role
from ..routers.auth import get_current_user


def require_roles(*roles: Role):
    allowed: List[Role] = list(roles)

    def _dep(user: MeResponse = Depends(get_current_user)) -> MeResponse:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return _dep

