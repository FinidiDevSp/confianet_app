from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, HttpUrl, ValidationError

from ..core.deps import require_roles
from ..models.auth import MeResponse, Role
from ..repositories.app_settings import get_json, set_json
from ..core.emailer import SmtpConfig
from ..core.settings import settings
from ..services.email_delivery import EmailRateLimitError, send_templated_email
from ..services.email_templates import EmailBranding, EmailTemplateManager
from ..services.webhooks import DEFAULT_EVENTS, WebhookSettings, load_webhook_settings, save_webhook_settings


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


class EmailTemplateOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    subject_template: str
    body_html: str
    allowed_variables: List[str]
    sample_context: Dict[str, Any]
    updated_at: Optional[datetime]


class EmailTemplatesResponse(BaseModel):
    branding: EmailBranding
    templates: List[EmailTemplateOut]


class EmailTemplateUpdatePayload(BaseModel):
    subject_template: str = Field(min_length=3)
    body_html: str = Field(min_length=3)


class EmailTemplatePreviewPayload(BaseModel):
    variables: Dict[str, Any] = Field(default_factory=dict)


class EmailTemplatePreviewResponse(BaseModel):
    subject: str
    html: str


class EmailTestLogEntry(BaseModel):
    level: str
    message: str
    timestamp: datetime


class EmailTestPayload(BaseModel):
    to_email: EmailStr
    template_id: str = "user_invitation"
    variables: Dict[str, Any] = Field(default_factory=dict)
    smtp: Optional[EmailSettingsIn] = None


class EmailTestResponse(BaseModel):
    success: bool
    idempotent: bool
    detail: Optional[str]
    logs: List[EmailTestLogEntry]


class WebhookSettingsPayload(BaseModel):
    url: Optional[str] = None
    secret: Optional[str] = None
    enabled_events: List[str] = Field(default_factory=lambda: list(DEFAULT_EVENTS))
    enabled: bool = False


class WebhookSettingsResponse(BaseModel):
    url: Optional[HttpUrl] = None
    secret: Optional[str] = None
    enabled_events: List[str]
    enabled: bool


def _template_to_out(template: Any) -> EmailTemplateOut:
    data = template.model_dump()
    return EmailTemplateOut(**data)


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


@router.get("/email/templates", response_model=EmailTemplatesResponse)
def list_email_templates(me: MeResponse = Depends(require_roles(Role.admin))) -> EmailTemplatesResponse:
    manager = EmailTemplateManager(me.org_id)
    templates = [_template_to_out(tpl) for tpl in manager.list_templates()]
    return EmailTemplatesResponse(branding=manager.branding, templates=templates)


@router.patch("/email/templates/branding", response_model=EmailBranding)
def update_email_branding(payload: EmailBranding, me: MeResponse = Depends(require_roles(Role.admin))) -> EmailBranding:
    manager = EmailTemplateManager(me.org_id)
    branding = manager.save_branding(payload)
    return branding


@router.put("/email/templates/{template_id}", response_model=EmailTemplateOut)
def update_email_template(
    template_id: str,
    payload: EmailTemplateUpdatePayload,
    me: MeResponse = Depends(require_roles(Role.admin)),
) -> EmailTemplateOut:
    manager = EmailTemplateManager(me.org_id)
    try:
        updated = manager.save_template(template_id, subject_template=payload.subject_template, body_html=payload.body_html)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plantilla no encontrada")
    return _template_to_out(updated)


@router.post("/email/templates/{template_id}/preview", response_model=EmailTemplatePreviewResponse)
def preview_email_template(
    template_id: str,
    payload: EmailTemplatePreviewPayload,
    me: MeResponse = Depends(require_roles(Role.admin)),
) -> EmailTemplatePreviewResponse:
    manager = EmailTemplateManager(me.org_id)
    try:
        base_context = manager.sample_context(template_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plantilla no encontrada")
    context = {**base_context, **payload.variables}
    context.setdefault("organization_name", manager.branding.brand_name)
    rendered = manager.render(template_id, context)
    return EmailTemplatePreviewResponse(subject=rendered.subject, html=rendered.html)


@router.post("/email/test", response_model=EmailTestResponse)
def send_test_email(payload: EmailTestPayload, me: MeResponse = Depends(require_roles(Role.admin))) -> EmailTestResponse:
    logs: List[EmailTestLogEntry] = []

    def log(level: str, message: str) -> None:
        logs.append(EmailTestLogEntry(level=level, message=message, timestamp=datetime.utcnow()))

    manager = EmailTemplateManager(me.org_id)
    try:
        manager.get_template(payload.template_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plantilla no encontrada")

    stored_conf = get_json(me.org_id, "email_settings") or {}
    smtp_payload = payload.smtp
    password: Optional[str] = None
    if smtp_payload:
        if smtp_payload.password is None:
            password = stored_conf.get("password")
        elif smtp_payload.password == "":
            password = None
        else:
            password = smtp_payload.password
        host = smtp_payload.smtp_host
        port = smtp_payload.smtp_port
        username = smtp_payload.username
        use_tls = smtp_payload.use_tls
        use_ssl = smtp_payload.use_ssl
        from_name = smtp_payload.from_name
        from_email = smtp_payload.from_email
    else:
        host = stored_conf.get("smtp_host")
        port = int(stored_conf.get("smtp_port", 587)) if stored_conf else 587
        username = stored_conf.get("username")
        use_tls = bool(stored_conf.get("use_tls", True))
        use_ssl = bool(stored_conf.get("use_ssl", False))
        from_name = stored_conf.get("from_name", manager.branding.brand_name)
        from_email = stored_conf.get("from_email")
        password = stored_conf.get("password")

    if not host or not from_email:
        log("error", "Configura el servidor SMTP antes de enviar un correo de prueba")
        return EmailTestResponse(success=False, idempotent=False, detail="Configuración SMTP incompleta", logs=logs)
    if password is None or password == "":
        log("error", "La contraseña SMTP es obligatoria para la prueba")
        return EmailTestResponse(success=False, idempotent=False, detail="Contraseña SMTP requerida", logs=logs)

    try:
        smtp_cfg = SmtpConfig(
            host=str(host),
            port=int(port),
            username=username,
            password=password,
            use_tls=bool(use_tls),
            use_ssl=bool(use_ssl),
            from_name=str(from_name or manager.branding.brand_name),
            from_email=str(from_email),
        )
    except Exception as exc:
        log("error", f"Configuración SMTP inválida: {exc}")
        return EmailTestResponse(success=False, idempotent=False, detail="Configuración SMTP inválida", logs=logs)

    log("info", f"Preparando prueba con plantilla {payload.template_id}")
    context = manager.sample_context(payload.template_id)
    context.update(payload.variables)
    context.setdefault("organization_name", manager.branding.brand_name)
    context.setdefault("invited_by_name", me.full_name or me.email)

    try:
        outcome = send_templated_email(
            org_id=me.org_id,
            template_id=payload.template_id,
            smtp_cfg=smtp_cfg,
            to_email=str(payload.to_email),
            context=context,
            dedupe_key=f"test:{payload.template_id}:{payload.to_email}",
            rate_limit_seconds=max(60, settings.email_rate_limit_seconds // 2),
            idempotency_window_seconds=settings.email_idempotency_seconds,
        )
    except EmailRateLimitError as exc:
        log("error", f"Rate limit alcanzado. Intenta nuevamente en {exc.retry_after_seconds} segundos")
        return EmailTestResponse(
            success=False,
            idempotent=False,
            detail=f"Rate limit alcanzado. Intenta en {exc.retry_after_seconds} segundos",
            logs=logs,
        )
    except Exception as exc:
        log("error", f"Error enviando correo de prueba: {exc}")
        return EmailTestResponse(success=False, idempotent=False, detail=f"Error enviando correo: {exc}", logs=logs)

    if outcome.sent:
        log("info", f"Correo de prueba enviado a {payload.to_email}")
    elif outcome.idempotent:
        log("info", "El correo ya se había enviado recientemente (idempotencia)")

    return EmailTestResponse(
        success=outcome.sent,
        idempotent=outcome.idempotent,
        detail=outcome.detail,
        logs=logs,
    )


@router.get("/webhooks", response_model=WebhookSettingsResponse)
def get_webhook_settings(me: MeResponse = Depends(require_roles(Role.admin))) -> WebhookSettingsResponse:
    conf = load_webhook_settings(me.org_id)
    return WebhookSettingsResponse(
        url=conf.url,
        secret=conf.secret,
        enabled_events=conf.enabled_events,
        enabled=conf.enabled,
    )


@router.put("/webhooks", response_model=WebhookSettingsResponse)
def set_webhook_settings(
    payload: WebhookSettingsPayload,
    me: MeResponse = Depends(require_roles(Role.admin)),
) -> WebhookSettingsResponse:
    url_value = (payload.url or "").strip() or None
    events = [event for event in payload.enabled_events if event in DEFAULT_EVENTS]
    try:
        conf = WebhookSettings(url=url_value, secret=payload.secret, enabled_events=events, enabled=payload.enabled and bool(url_value))
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    saved = save_webhook_settings(me.org_id, conf)
    return WebhookSettingsResponse(
        url=saved.url,
        secret=saved.secret,
        enabled_events=saved.enabled_events,
        enabled=saved.enabled,
    )
