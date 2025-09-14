from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Tuple
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from .settings import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_jwt(subject: str, data: dict[str, Any], ttl_seconds: int) -> str:
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
        **data,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token


def create_jwt_with_jti(subject: str, data: dict[str, Any], ttl_seconds: int) -> Tuple[str, str, int]:
    """Create JWT adding a JTI and return (token, jti, exp)."""
    now = datetime.now(tz=timezone.utc)
    exp_ts = int((now + timedelta(seconds=ttl_seconds)).timestamp())
    jti = str(uuid4())
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": exp_ts,
        "jti": jti,
        **data,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti, exp_ts


def decode_jwt(token: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
