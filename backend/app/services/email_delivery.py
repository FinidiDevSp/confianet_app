from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional

from ..core.emailer import SmtpConfig, send_email
from ..core.settings import settings
from ..repositories.email_logs import get_last_by_dedupe, get_last_send, record_send
from .email_templates import EmailTemplateManager


@dataclass
class EmailSendOutcome:
    sent: bool
    idempotent: bool
    subject: Optional[str] = None
    html: Optional[str] = None
    last_sent_at: Optional[datetime] = None
    detail: Optional[str] = None


class EmailRateLimitError(Exception):
    def __init__(self, retry_after_seconds: int, last_sent_at: datetime) -> None:
        super().__init__("Rate limit reached")
        self.retry_after_seconds = retry_after_seconds
        self.last_sent_at = last_sent_at



def send_templated_email(
    org_id: str,
    template_id: str,
    smtp_cfg: SmtpConfig,
    to_email: str,
    context: Dict[str, Any],
    *,
    dedupe_key: Optional[str] = None,
    rate_limit_seconds: Optional[int] = None,
    idempotency_window_seconds: Optional[int] = None,
) -> EmailSendOutcome:
    now = datetime.utcnow()
    rate_limit_seconds = rate_limit_seconds or settings.email_rate_limit_seconds
    idempotency_window_seconds = idempotency_window_seconds or settings.email_idempotency_seconds

    if dedupe_key:
        existing = get_last_by_dedupe(org_id, dedupe_key)
        if existing and (now - existing.sent_at).total_seconds() < idempotency_window_seconds:
            return EmailSendOutcome(
                sent=False,
                idempotent=True,
                last_sent_at=existing.sent_at,
                detail="Idempotent: el mensaje ya se envió recientemente",
            )

    last = get_last_send(org_id, template_id, to_email)
    if last:
        delta = (now - last.sent_at).total_seconds()
        if delta < rate_limit_seconds:
            raise EmailRateLimitError(int(rate_limit_seconds - delta), last.sent_at)

    manager = EmailTemplateManager(org_id)
    rendered = manager.render(template_id, context)
    send_email(smtp_cfg, to_email, rendered.subject, rendered.html)
    record_send(org_id, template_id, to_email, dedupe_key=dedupe_key, sent_at=now)
    return EmailSendOutcome(
        sent=True,
        idempotent=False,
        subject=rendered.subject,
        html=rendered.html,
        last_sent_at=now,
    )
