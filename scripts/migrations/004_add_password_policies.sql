USE canal_denuncias;

CREATE TABLE IF NOT EXISTS password_policies (
  id CHAR(36) NOT NULL,
  org_id CHAR(36) NULL,
  min_length INT NOT NULL,
  require_upper TINYINT(1) NOT NULL DEFAULT 1,
  require_number TINYINT(1) NOT NULL DEFAULT 1,
  require_symbol TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_policy_org (org_id)
) ENGINE=InnoDB;

