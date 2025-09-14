from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_seconds: int = 900  # 15 minutes
    refresh_ttl_seconds: int = 7 * 24 * 3600  # 7 days
    cors_origins: List[str] = ["http://localhost:3000"]
    cookie_secure: bool = False  # True in production
    cookie_samesite: str = "lax"  # 'lax' | 'strict' | 'none'

    class Config:
        env_file = ".env"
        env_prefix = "JWT_"


settings = Settings()

