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
    database_url: str = "mysql+pymysql://user:password@localhost:3306/canal_denuncias"
    dev_default_password: str = "123456"  # Fallback if no password column exists (dev only)

    class Config:
        env_file = ".env"
        env_prefix = ""


settings = Settings()
