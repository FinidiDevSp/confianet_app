from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class Role(str, Enum):
    admin = "admin"
    responsable = "responsable"
    investigador = "investigador"
    auditor = "auditor"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class User(BaseModel):
    id: str
    org_id: str
    email: EmailStr
    full_name: str
    role: Role
    password_hash: str
    status: str = "active"  # "active" | "suspended"
    mfa_enabled: bool = False


class UserOut(BaseModel):
    id: str
    org_id: str
    email: EmailStr
    full_name: str
    role: Role
    status: str
    mfa_enabled: bool = False
    delegated_roles: list[str] = []


class MeResponse(UserOut):
    pass


TokenResponse.model_rebuild()
