from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

import httpx
from pydantic import BaseModel, Field, HttpUrl

from ..core.settings import settings
from ..repositories.app_settings import get_json, set_json

logger = logging.getLogger("confianet.webhooks")


class WebhookSettings(BaseModel):
    url: Optional[HttpUrl] = None
    secret: Optional[str] = None
    enabled_events: list[str] = Field(default_factory=list)
    enabled: bool = False


DEFAULT_EVENTS = ["user.invited", "user.activated", "user.suspended"]
STORAGE_KEY = "webhook_settings"


def load_webhook_settings(org_id: str) -> WebhookSettings:
    raw = get_json(org_id, STORAGE_KEY) or {}
    data = {
        "url": raw.get("url"),
        "secret": raw.get("secret"),
        "enabled_events": raw.get("enabled_events") or DEFAULT_EVENTS,
        "enabled": bool(raw.get("enabled", False)),
    }
    try:
        return WebhookSettings(**data)
    except Exception:
        return WebhookSettings(url=None, secret=None, enabled_events=DEFAULT_EVENTS, enabled=False)


def save_webhook_settings(org_id: str, conf: WebhookSettings) -> WebhookSettings:
    payload = {
        "url": str(conf.url) if conf.url else None,
        "secret": conf.secret,
        "enabled_events": conf.enabled_events,
        "enabled": conf.enabled,
    }
    set_json(org_id, STORAGE_KEY, payload)
    return conf


def trigger_webhook(org_id: str, event: str, data: Dict[str, Any]) -> None:
    conf = load_webhook_settings(org_id)
    if not conf.enabled:
        return
    if not conf.url:
        return
    if event not in conf.enabled_events:
        return

    body = {
        "event": event,
        "occurred_at": datetime.utcnow().isoformat() + "Z",
        "data": data,
    }
    json_body = json.dumps(body)
    headers = {
        "User-Agent": "ConfianetWebhook/1.0",
        "Content-Type": "application/json",
    }
    if conf.secret:
        secret_bytes = conf.secret.encode("utf-8")
        signature = hmac.new(secret_bytes, json_body.encode("utf-8"), hashlib.sha256).hexdigest()
        headers["X-Confianet-Signature"] = signature

    try:
        with httpx.Client(timeout=settings.webhook_timeout_seconds) as client:
            response = client.post(str(conf.url), data=json_body, headers=headers)
            if response.status_code >= 400:
                logger.warning("Webhook %s responded with %s", event, response.status_code)
    except Exception as exc:  # pragma: no cover - network errors should not break flow
        logger.warning("No se pudo enviar webhook %s: %s", event, exc)
