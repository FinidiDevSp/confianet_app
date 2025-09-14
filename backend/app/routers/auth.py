from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..core.security import decode_jwt
from ..core.settings import settings
from ..models.auth import LoginRequest, MeResponse, TokenResponse, UserOut
from ..services.auth import authenticate_user, issue_tokens, me_from_user_id

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

    user: UserOut = authenticate_user(payload.email, payload.password)
    access, refresh = issue_tokens(user)
    set_refresh_cookie(response, refresh)
    return TokenResponse(access_token=access, user=user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response) -> TokenResponse:
    raw: Optional[str] = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    data = decode_jwt(raw)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user_id = str(data["sub"])  # sub is user id (UUID)
    me = me_from_user_id(user_id)
    if not me:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    access, refresh_token = issue_tokens(me)
    set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access, user=me)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie(key="refresh_token", path="/api/auth")
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
