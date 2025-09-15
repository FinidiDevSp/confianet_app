USE canal_denuncias;

CREATE TABLE IF NOT EXISTS user_invitations (
  id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  email VARCHAR(254) NOT NULL,
  name VARCHAR(200) NULL,
  role ENUM('admin','responsable','investigador','auditor') NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  invited_by CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_invitation_token (token_hash),
  KEY idx_inv_email (email)
) ENGINE=InnoDB;

