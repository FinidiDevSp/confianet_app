from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from jinja2 import BaseLoader, Environment, select_autoescape
from markupsafe import Markup
from pydantic import BaseModel, Field

from ..repositories.app_settings import get_json, set_json


class EmailBranding(BaseModel):
    brand_name: str = "Confianet"
    logo_url: Optional[str] = None
    primary_color: str = "#1F2937"
    button_text_color: str = "#FFFFFF"
    footer_text: Optional[str] = None


class EmailTemplateDefinition(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    subject_template: str
    body_html: str
    allowed_variables: List[str] = Field(default_factory=list)
    sample_context: Dict[str, Any] = Field(default_factory=dict)
    updated_at: Optional[datetime] = None


@dataclass
class RenderedEmail:
    subject: str
    html: str


DEFAULT_BRANDING = EmailBranding()

DEFAULT_LAYOUT = """
<!DOCTYPE html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <title>{{ subject }}</title>
    <style>
      body {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        background-color: #f5f5f5;
        color: #111827;
        margin: 0;
        padding: 24px;
      }
      .container {
        max-width: 560px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
      }
      .header {
        background-color: {{ brand.primary_color }};
        padding: 24px;
        text-align: center;
      }
      .header img {
        max-width: 180px;
        height: auto;
      }
      .header h1 {
        color: #ffffff;
        margin: 0;
        font-size: 24px;
        font-weight: 600;
      }
      .content {
        padding: 32px 32px 16px 32px;
        line-height: 1.6;
        color: #1f2937;
      }
      .content a.button {
        display: inline-block;
        background-color: {{ brand.primary_color }};
        color: {{ brand.button_text_color }};
        padding: 14px 22px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        margin: 16px 0;
      }
      .footer {
        padding: 16px 24px 32px 24px;
        font-size: 12px;
        color: #6b7280;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class=\"container\">
      <div class=\"header\">
        {% if brand.logo_url %}
          <img src=\"{{ brand.logo_url }}\" alt=\"{{ brand.brand_name }}\" />
        {% else %}
          <h1>{{ brand.brand_name }}</h1>
        {% endif %}
      </div>
      <div class=\"content\">
        {{ content | safe }}
      </div>
      {% if brand.footer_text %}
        <div class=\"footer\">{{ brand.footer_text }}</div>
      {% endif %}
    </div>
  </body>
</html>
"""


DEFAULT_TEMPLATES: Dict[str, EmailTemplateDefinition] = {
    "user_invitation": EmailTemplateDefinition(
        id="user_invitation",
        name="Invitación de usuario",
        description="Correo que se envía cuando invitas a una persona a Confianet.",
        subject_template="{{ organization_name }} te invitó a Confianet",
        body_html="""
<p>Hola {{ invitee_name or 'equipo' }},</p>
<p>{{ invited_by_name }} te invitó a colaborar en <strong>{{ organization_name }}</strong>.</p>
<p>Usa el siguiente botón para crear tu contraseña y activar tu cuenta:</p>
<p><a class=\"button\" href=\"{{ invite_link }}\">Crear contraseña</a></p>
<p>El enlace caduca el {{ expires_at }}.</p>
<p>Si no esperabas este correo, puedes ignorarlo sin problemas.</p>
""",
        allowed_variables=[
            "invitee_name",
            "organization_name",
            "invite_link",
            "invited_by_name",
            "expires_at",
        ],
        sample_context={
            "invitee_name": "María López",
            "organization_name": "Confianet Demo",
            "invite_link": "https://demo.confianet.app/invitacion/123",
            "invited_by_name": "Equipo Confianet",
            "expires_at": "2024-12-31 23:59",
        },
    ),
}


class EmailTemplateManager:
    STORAGE_KEY = "email_templates"

    def __init__(self, org_id: str) -> None:
        self.org_id = org_id
        raw = get_json(org_id, self.STORAGE_KEY) or {}
        branding_raw = raw.get("branding") or {}
        templates_raw = raw.get("templates") or {}
        # Merge branding with defaults
        base_brand = DEFAULT_BRANDING.model_copy(deep=True)
        for key, value in branding_raw.items():
            if hasattr(base_brand, key) and value is not None:
                setattr(base_brand, key, value)
        self.branding = base_brand
        self._templates_cache: Dict[str, EmailTemplateDefinition] = {}
        self._templates_raw = templates_raw

    def _merge_template(self, template_id: str) -> EmailTemplateDefinition:
        default = DEFAULT_TEMPLATES[template_id]
        stored = self._templates_raw.get(template_id) or {}
        subject = stored.get("subject_template") or default.subject_template
        body = stored.get("body_html") or default.body_html
        updated_at: Optional[datetime] = None
        if stored.get("updated_at"):
            try:
                updated_at = datetime.fromisoformat(stored["updated_at"])
            except ValueError:
                updated_at = None
        return EmailTemplateDefinition(
            id=default.id,
            name=default.name,
            description=default.description,
            subject_template=subject,
            body_html=body,
            allowed_variables=list(default.allowed_variables),
            sample_context=dict(default.sample_context),
            updated_at=updated_at,
        )

    def list_templates(self) -> List[EmailTemplateDefinition]:
        if not self._templates_cache:
            for template_id in DEFAULT_TEMPLATES.keys():
                self._templates_cache[template_id] = self._merge_template(template_id)
        return list(self._templates_cache.values())

    def get_template(self, template_id: str) -> EmailTemplateDefinition:
        if template_id not in DEFAULT_TEMPLATES:
            raise KeyError(f"Plantilla no soportada: {template_id}")
        if template_id not in self._templates_cache:
            self._templates_cache[template_id] = self._merge_template(template_id)
        return self._templates_cache[template_id]

    def save_template(self, template_id: str, *, subject_template: str, body_html: str) -> EmailTemplateDefinition:
        if template_id not in DEFAULT_TEMPLATES:
            raise KeyError(f"Plantilla no soportada: {template_id}")
        now = datetime.utcnow().replace(microsecond=0)
        self._templates_raw[template_id] = {
            "subject_template": subject_template,
            "body_html": body_html,
            "updated_at": now.isoformat(),
        }
        payload = {
            "branding": self.branding.model_dump(),
            "templates": self._templates_raw,
        }
        set_json(self.org_id, self.STORAGE_KEY, payload)
        self._templates_cache[template_id] = self._merge_template(template_id)
        return self._templates_cache[template_id]

    def save_branding(self, branding: EmailBranding) -> EmailBranding:
        self.branding = branding
        payload = {
            "branding": branding.model_dump(),
            "templates": self._templates_raw,
        }
        set_json(self.org_id, self.STORAGE_KEY, payload)
        self._templates_cache.clear()
        return branding

    def render(self, template_id: str, context: Dict[str, Any]) -> RenderedEmail:
        template = self.get_template(template_id)
        env = Environment(loader=BaseLoader(), autoescape=select_autoescape(["html", "xml"]))
        base_context = {**context, "brand": self.branding.model_dump()}
        subject_template = env.from_string(template.subject_template)
        subject = subject_template.render(**base_context)
        body_template = env.from_string(template.body_html)
        body_html = body_template.render(**base_context)
        layout = env.from_string(DEFAULT_LAYOUT)
        html = layout.render(subject=subject, brand=self.branding.model_dump(), content=Markup(body_html), **base_context)
        return RenderedEmail(subject=subject, html=html)

    def sample_context(self, template_id: str) -> Dict[str, Any]:
        template = self.get_template(template_id)
        return dict(template.sample_context)
