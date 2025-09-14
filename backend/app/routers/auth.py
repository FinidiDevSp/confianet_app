from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..core.security import decode_jwt
from ..core.settings import settings
from ..models.auth import LoginRequest, MeResponse, TokenResponse, UserOut
from ..services.auth import authenticate_user, issue_tokens, me_from_user_id
from ..repositories.refresh_tokens import is_refresh_token_valid, revoke_refresh_token
from ..repositories.audit import log_event
from ..core.rate_limit import rate_limiter

router = APIRouter()

auth_scheme = HTTPBearer(auto_error=False)


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        max_age=settings.refresh_ttl_seconds,
        path="/api/auth",
    )


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(request: Request, response: Response) -> TokenResponse:
    # Accept JSON or form-encoded bodies for flexibility with clients
    data: dict
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("invalid body")
    except Exception:
        form = await request.form()
        data = {"email": form.get("email"), "password": form.get("password")}

    try:
        payload = LoginRequest.model_validate(data)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request body")

    # rate limit by email+ip
    client_ip = request.client.host if request.client else None
    key = f"{payload.email}|{client_ip}"
    ok, msg = rate_limiter.check_and_increment(key)
    if not ok:
        log_event("login_rate_limited", org_id=None, actor_id=None, actor_role=None, target_type=None, target_id=None, metadata={"email": payload.email}, ip=client_ip, ip_salt=settings.ip_hash_salt)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg or "Too many attempts")

    user: UserOut = authenticate_user(payload.email, payload.password)
    access, refresh = issue_tokens(user)
    set_refresh_cookie(response, refresh)
    # audit: login success
    log_event("login_success", org_id=None, actor_id=str(user.id), actor_role=str(user.role), target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    # reset limiter after success
    rate_limiter.reset(key)
    return TokenResponse(access_token=access, user=user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response) -> TokenResponse:
    raw: Optional[str] = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    # Verify the token is known and not revoked (rotation)
    if not is_refresh_token_valid(raw):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    data = decode_jwt(raw)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user_id = str(data["sub"])  # sub is user id (UUID)
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    # rotate: revoke current and issue a new refresh
    revoke_refresh_token(raw)
    access, refresh_token = issue_tokens(me)
    set_refresh_cookie(response, refresh_token)
    # audit: refresh success
    client_ip = request.client.host if request.client else None
    log_event("token_refreshed", org_id=None, actor_id=str(me.id), actor_role=str(me.role), target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    return TokenResponse(access_token=access, user=me)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, request: Request) -> Response:
    response.delete_cookie(key="refresh_token", path="/api/auth")
    # audit: logout
    client_ip = request.client.host if request.client else None
    log_event("logout", org_id=None, actor_id=None, actor_role=None, target_type=None, target_id=None, metadata=None, ip=client_ip, ip_salt=settings.ip_hash_salt)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(auth_scheme)) -> MeResponse:
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


@router.get("/me", response_model=MeResponse)
def me(me: MeResponse = Depends(get_current_user)) -> MeResponse:
    return me
