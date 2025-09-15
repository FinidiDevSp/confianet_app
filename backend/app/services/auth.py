from __future__ import annotations

from typing import Optional, Tuple

from fastapi import HTTPException, status

from ..core.security import create_jwt, create_jwt_with_jti
from ..core.settings import settings
from ..models.auth import MeResponse, Role, TokenResponse, UserOut, User
from ..repositories.users import users_repo
from ..repositories.refresh_tokens import store_refresh_token, revoke_refresh_token, is_refresh_token_valid


def authenticate_user(email: str, password: str) -> UserOut:
    user_db: User | None = users_repo.get_by_email(email)
    user = user_db
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active")
    # Password check: use bcrypt hash if present, otherwise fallback to dev_default_password
    if user.password_hash:
        from ..core.security import verify_password
        if not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    else:
        if password != settings.dev_default_password:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    # Return safe shape
    return UserOut(id=user.id, org_id=user.org_id, email=user.email, full_name=user.full_name, role=user.role, status=user.status, mfa_enabled=user.mfa_enabled)


def issue_tokens(user: UserOut) -> Tuple[str, str]:
    access = create_jwt(subject=str(user.id), data={"role": str(user.role), "type": "access"}, ttl_seconds=settings.jwt_ttl_seconds)
    refresh, jti, exp_ts = create_jwt_with_jti(subject=str(user.id), data={"type": "refresh"}, ttl_seconds=settings.refresh_ttl_seconds)
    # store refresh token hash for rotation/revocation
    store_refresh_token(user_id=str(user.id), token=refresh, expires_at_ts=exp_ts)
    return access, refresh


def me_from_user_id(user_id: str) -> Optional[MeResponse]:
    user = users_repo.get_by_id(user_id)
    if not user:
        return None
    # Normalize to dict for Pydantic v2 compatibility when adapting UserOut -> MeResponse
    return MeResponse.model_validate(user.model_dump())
