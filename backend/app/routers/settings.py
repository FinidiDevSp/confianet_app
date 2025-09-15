from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from ..core.deps import require_roles
from ..models.auth import MeResponse, Role
from ..repositories.app_settings import get_json, set_json


router = APIRouter()


class EmailSettingsIn(BaseModel):
    smtp_host: str
    smtp_port: int = Field(ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None  # if None -> keep existing; empty string -> clear
    use_tls: bool = True
    use_ssl: bool = False
    from_name: str
    from_email: EmailStr


class EmailSettingsOut(BaseModel):
    smtp_host: str
    smtp_port: int
    username: Optional[str]
    has_password: bool
    use_tls: bool
    use_ssl: bool
    from_name: str
    from_email: EmailStr


@router.get("/email", response_model=EmailSettingsOut)
def get_email_settings(me: MeResponse = Depends(require_roles(Role.admin))) -> EmailSettingsOut:
    conf = get_json(me.org_id, "email_settings") or {}
    has_password = bool(conf.get("password"))
    return EmailSettingsOut(
        smtp_host=conf.get("smtp_host", ""),
        smtp_port=int(conf.get("smtp_port", 587)),
        username=conf.get("username"),
        has_password=has_password,
        use_tls=bool(conf.get("use_tls", True)),
        use_ssl=bool(conf.get("use_ssl", False)),
        from_name=conf.get("from_name", "Confianet"),
        from_email=conf.get("from_email", "admin@example.com"),
    )


@router.patch("/email", response_model=EmailSettingsOut)
def set_email_settings(payload: EmailSettingsIn, me: MeResponse = Depends(require_roles(Role.admin))) -> EmailSettingsOut:
    current = get_json(me.org_id, "email_settings") or {}
    new_pw: Optional[str]
    if payload.password is None:
        new_pw = current.get("password")
    elif payload.password == "":
        new_pw = None
    else:
        new_pw = payload.password
    conf = {
        "smtp_host": payload.smtp_host,
        "smtp_port": int(payload.smtp_port),
        "username": payload.username,
        "password": new_pw,
        "use_tls": bool(payload.use_tls),
        "use_ssl": bool(payload.use_ssl),
        "from_name": payload.from_name,
        "from_email": str(payload.from_email),
    }
    set_json(me.org_id, "email_settings", conf)
    return EmailSettingsOut(
        smtp_host=conf["smtp_host"],
        smtp_port=conf["smtp_port"],
        username=conf.get("username"),
        has_password=bool(conf.get("password")),
        use_tls=conf["use_tls"],
        use_ssl=conf["use_ssl"],
        from_name=conf["from_name"],
        from_email=conf["from_email"],
    )

