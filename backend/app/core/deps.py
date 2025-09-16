from __future__ import annotations

from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..models.auth import MeResponse, Role
from ..repositories.delegations import get_active_roles_for_user
from ..core.security import decode_jwt
from ..services.auth import me_from_user_id


auth_scheme = HTTPBearer(auto_error=False)


def _get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(auth_scheme)) -> MeResponse:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    data = decode_jwt(creds.credentials)
    if not data or data.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = str(data["sub"])  # sub is user id (UUID)
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return me


def require_roles(*roles: Role):
    allowed: List[Role] = list(roles)

    def _dep(user: MeResponse = Depends(_get_current_user)) -> MeResponse:
        delegated_raw = get_active_roles_for_user(str(user.id), user.org_id)
        delegated = sorted(delegated_raw)
        delegated_normalized = {role.lower() for role in delegated_raw}
        enriched = MeResponse.model_validate({**user.model_dump(), "delegated_roles": delegated})
        if user.role in allowed:
            return enriched
        for r in allowed:
            value = r.value if hasattr(r, "value") else r
            if str(value).lower() in delegated_normalized:
                return enriched
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

    return _dep


def require_real_roles(*roles: Role):
    allowed: List[Role] = list(roles)

    def _dep(user: MeResponse = Depends(_get_current_user)) -> MeResponse:
        # Only accept real role, ignore delegated
        delegated = sorted(get_active_roles_for_user(str(user.id), user.org_id))
        enriched = MeResponse.model_validate({**user.model_dump(), "delegated_roles": delegated})
        if user.role in allowed:
            return enriched
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role (real admin required)")

    return _dep
