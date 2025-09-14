from __future__ import annotations

from typing import Optional, Tuple

from fastapi import HTTPException, status

from ..core.security import create_jwt
from ..core.settings import settings
from ..models.auth import MeResponse, Role, TokenResponse, UserOut
from ..repositories.users import users_repo


def authenticate_user(email: str, password: str) -> UserOut:
    user = users_repo.get_by_email(email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active")
    # Temporary dev check: since DB does not store password hash yet, require a configured dev password
    if password != settings.dev_default_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return UserOut.model_validate(user)


def issue_tokens(user: UserOut) -> Tuple[str, str]:
    access = create_jwt(subject=str(user.id), data={"role": user.role, "type": "access"}, ttl_seconds=settings.jwt_ttl_seconds)
    refresh = create_jwt(subject=str(user.id), data={"type": "refresh"}, ttl_seconds=settings.refresh_ttl_seconds)
    return access, refresh


def me_from_user_id(user_id: str) -> Optional[MeResponse]:
    user = users_repo.get_by_id(user_id)
    if not user:
        return None
    return MeResponse.model_validate(user)
