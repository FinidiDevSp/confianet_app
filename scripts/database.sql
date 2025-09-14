-- ============================================================
-- Canal de Denuncias – Esquema MySQL 8.0
-- Motor: InnoDB, Charset: utf8mb4
-- Nota: Genera los UUIDs desde la aplicación (UUID()).
-- ============================================================

-- 1) Base de datos
CREATE DATABASE IF NOT EXISTS canal_denuncias
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE canal_denuncias;

-- 2) Opciones por defecto (asegura InnoDB)
SET NAMES utf8mb4;

-- ============================================================
-- TABLAS MAESTRAS
-- ============================================================

-- ORGANIZATIONS
CREATE TABLE organizations (
  id           CHAR(36)     NOT NULL,
  name         VARCHAR(200) NOT NULL,
  slug         VARCHAR(120) NOT NULL,
  settings     JSON         NULL,
  region       VARCHAR(10)  NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_org_slug (slug)
) ENGINE=InnoDB;

-- USERS (usuarios del panel)
CREATE TABLE users (
  id           CHAR(36)     NOT NULL,
  org_id       CHAR(36)     NOT NULL,
  email        VARCHAR(254) NULL,
  name         VARCHAR(200) NULL,
  role         ENUM('admin','responsable','investigador','auditor') NOT NULL,
  status       ENUM('active','suspended') NOT NULL DEFAULT 'active',
  mfa_enabled  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_org (org_id),
  CONSTRAINT fk_users_org
    FOREIGN KEY (org_id) REFERENCES organizations(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- CATEGORIES (categorías de denuncia y SLAs)
CREATE TABLE categories (
  id               CHAR(36)     NOT NULL,
  org_id           CHAR(36)     NOT NULL,
  name             VARCHAR(100) NOT NULL,
  sla_days_ack     INT          NOT NULL DEFAULT 7,   -- acuse ≤ 7 días
  sla_days_response INT         NOT NULL DEFAULT 90,  -- respuesta ≤ 90 días
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_cat_org (org_id),
  CONSTRAINT fk_categories_org
    FOREIGN KEY (org_id) REFERENCES organizations(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- CASOS (DENUNCIAS) Y RELACIONADAS
-- ============================================================

-- REPORT_CASES (denuncias)
CREATE TABLE report_cases (
  id                 CHAR(36)     NOT NULL,
  org_id             CHAR(36)     NOT NULL,
  public_ref         VARCHAR(20)  NOT NULL,  -- código visible para seguimiento
  category_id        CHAR(36)     NULL,
  is_anonymous       TINYINT(1)   NOT NULL DEFAULT 1,
  reporter_email     VARCHAR(254) NULL,
  reporter_relation  VARCHAR(50)  NULL,      -- empleado, proveedor, etc.
  summary            VARCHAR(300) NOT NULL,
  details            TEXT         NOT NULL,
  location           VARCHAR(200) NULL,
  incident_date      DATE         NULL,
  state              ENUM('recibida','en_analisis','en_investigacion','pendiente_medidas','cerrada','archivada')
                   NOT NULL DEFAULT 'recibida',
  priority           ENUM('low','medium','high') NULL,
  ack_deadline       DATETIME     NULL,      -- fecha límite acuse (<= 7 días)
  response_deadline  DATETIME     NULL,      -- fecha límite respuesta (<= 3 meses)
  closed_at          DATETIME     NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cases_public_ref (public_ref),
  KEY idx_cases_org (org_id),
  KEY idx_cases_cat (category_id),
  KEY idx_cases_state (state),
  CONSTRAINT fk_cases_org
    FOREIGN KEY (org_id) REFERENCES organizations(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cases_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- CASE_ASSIGNMENTS (asignaciones de caso a usuarios)
CREATE TABLE case_assignments (
  id          CHAR(36)   NOT NULL,
  case_id     CHAR(36)   NOT NULL,
  assignee_id CHAR(36)   NOT NULL,
  role        ENUM('owner','viewer') NOT NULL DEFAULT 'owner',
  created_at  TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_assignee (case_id, assignee_id),
  KEY idx_ca_case (case_id),
  KEY idx_ca_assignee (assignee_id),
  CONSTRAINT fk_ca_case
    FOREIGN KEY (case_id) REFERENCES report_cases(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ca_user
    FOREIGN KEY (assignee_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- CASE_MESSAGES (mensajería y notas)
CREATE TABLE case_messages (
  id           CHAR(36)   NOT NULL,
  case_id      CHAR(36)   NOT NULL,
  author_type  ENUM('reporter','staff') NOT NULL,
  author_id    CHAR(36)   NULL,         -- si staff, referencia a users.id
  body         TEXT       NOT NULL,
  is_internal  TINYINT(1) NOT NULL DEFAULT 0, -- 1 = nota interna no visible al denunciante
  created_at   TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_msg_case (case_id),
  KEY idx_msg_author (author_id),
  CONSTRAINT fk_msg_case
    FOREIGN KEY (case_id) REFERENCES report_cases(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_msg_author_user
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ATTACHMENTS (evidencias)
CREATE TABLE attachments (
  id            CHAR(36)     NOT NULL,
  case_id       CHAR(36)     NOT NULL,
  uploader_type ENUM('reporter','staff') NOT NULL,
  file_key      VARCHAR(255) NOT NULL,  -- ruta/clave en el storage
  filename      VARCHAR(255) NOT NULL,
  mime          VARCHAR(100) NOT NULL,
  size_bytes    INT          NOT NULL,
  hash_sha256   CHAR(64)     NOT NULL,
  av_status     ENUM('pending','clean','infected') NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_att_case (case_id),
  KEY idx_att_hash (hash_sha256),
  CONSTRAINT fk_att_case
    FOREIGN KEY (case_id) REFERENCES report_cases(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- STATUS_HISTORY (historial de estados)
CREATE TABLE status_history (
  id          CHAR(36)   NOT NULL,
  case_id     CHAR(36)   NOT NULL,
  from_state  VARCHAR(30) NULL,
  to_state    VARCHAR(30) NOT NULL,
  changed_by  CHAR(36)   NULL,  -- users.id
  reason      TEXT       NULL,
  created_at  TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sh_case (case_id),
  KEY idx_sh_user (changed_by),
  CONSTRAINT fk_sh_case
    FOREIGN KEY (case_id) REFERENCES report_cases(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sh_user
    FOREIGN KEY (changed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- PEOPLE_INVOLVED (personas implicadas)
CREATE TABLE people_involved (
  id      CHAR(36)     NOT NULL,
  case_id CHAR(36)     NOT NULL,
  name    VARCHAR(200) NULL,
  role    VARCHAR(80)  NULL,
  notes   TEXT         NULL,
  PRIMARY KEY (id),
  KEY idx_pi_case (case_id),
  CONSTRAINT fk_pi_case
    FOREIGN KEY (case_id) REFERENCES report_cases(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- NOTIFICACIONES, AUDITORÍA Y CONFIGURACIÓN
-- ============================================================

-- NOTIFICATIONS
CREATE TABLE notifications (
  id         CHAR(36)    NOT NULL,
  org_id     CHAR(36)    NOT NULL,
  case_id    CHAR(36)    NULL,
  recipient  VARCHAR(254) NOT NULL, -- correo o destino webhook
  channel    ENUM('email','inapp','webhook') NOT NULL,
  template   VARCHAR(50) NOT NULL,
  payload    JSON        NULL,
  status     ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at    DATETIME    NULL,
  PRIMARY KEY (id),
  KEY idx_notif_org (org_id),
  KEY idx_notif_case (case_id),
  CONSTRAINT fk_notif_org
    FOREIGN KEY (org_id) REFERENCES organizations(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notif_case
    FOREIGN KEY (case_id) REFERENCES report_cases(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- AUDIT_LOG (bitácora inmutable)
CREATE TABLE audit_log (
  id          CHAR(36)    NOT NULL,
  org_id      CHAR(36)    NOT NULL,
  actor_id    CHAR(36)    NULL,  -- users.id
  actor_role  VARCHAR(50) NULL,
  action      VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id   CHAR(36)    NULL,
  metadata    JSON        NULL,
  ip_hash     VARCHAR(128) NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_org (org_id),
  KEY idx_audit_actor (actor_id),
  KEY idx_audit_target (target_id),
  CONSTRAINT fk_audit_org
    FOREIGN KEY (org_id) REFERENCES organizations(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_audit_actor
    FOREIGN KEY (actor_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- PORTAL_TOKENS (acceso denunciante)
CREATE TABLE portal_tokens (
  id          CHAR(36)   NOT NULL,
  case_id     CHAR(36)   NOT NULL,
  token_hash  VARCHAR(128) NOT NULL, -- almacenar sólo hash
  expires_at  DATETIME   NOT NULL,
  last_used_at DATETIME  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_token_hash (token_hash),
  KEY idx_pt_case (case_id),
  CONSTRAINT fk_pt_case
    FOREIGN KEY (case_id) REFERENCES report_cases(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ORG_SETTINGS (KV efectivo por organización)
CREATE TABLE org_settings (
  id         CHAR(36)    NOT NULL,
  org_id     CHAR(36)    NOT NULL,
  `key`      VARCHAR(100) NOT NULL,
  `value`    JSON         NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_org_key (org_id, `key`),
  KEY idx_os_org (org_id),
  CONSTRAINT fk_os_org
    FOREIGN KEY (org_id) REFERENCES organizations(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- VISTAS DE APOYO (opcionales)
-- ============================================================

-- Vista: KPIs simples por estado
CREATE OR REPLACE VIEW vw_cases_by_state AS
SELECT org_id, state, COUNT(*) AS total
FROM report_cases
GROUP BY org_id, state;

-- Vista: próximos vencimientos (7 días)
CREATE OR REPLACE VIEW vw_cases_due_7d AS
SELECT id, org_id, public_ref, state, response_deadline
FROM report_cases
WHERE response_deadline IS NOT NULL
  AND response_deadline <= (NOW() + INTERVAL 7 DAY)
  AND state NOT IN ('cerrada','archivada');

-- ============================================================
-- ÍNDICES ADICIONALES RECOMENDADOS
-- ============================================================
CREATE INDEX idx_cases_deadlines ON report_cases (response_deadline, ack_deadline);
CREATE INDEX idx_msg_created ON case_messages (created_at);
CREATE INDEX idx_att_created ON attachments (created_at);
CREATE INDEX idx_audit_created ON audit_log (created_at);

-- ============================================================
-- FIN DEL ESQUEMA
-- ============================================================
