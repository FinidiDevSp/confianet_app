from __future__ import annotations

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


class SmtpConfig:
    def __init__(self, host: str, port: int, from_email: str, from_name: str, username: Optional[str] = None, password: Optional[str] = None, use_tls: bool = True, use_ssl: bool = False) -> None:
        self.host = host
        self.port = int(port)
        self.username = username
        self.password = password
        self.from_email = from_email
        self.from_name = from_name
        self.use_tls = use_tls
        self.use_ssl = use_ssl


def send_email(cfg: SmtpConfig, to_email: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg.from_name} <{cfg.from_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", _charset="utf-8"))

    if cfg.use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(cfg.host, cfg.port, context=context) as server:
            if cfg.username:
                server.login(cfg.username, cfg.password or "")
            server.sendmail(cfg.from_email, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(cfg.host, cfg.port) as server:
            if cfg.use_tls:
                server.starttls()
            if cfg.username:
                server.login(cfg.username, cfg.password or "")
            server.sendmail(cfg.from_email, [to_email], msg.as_string())

