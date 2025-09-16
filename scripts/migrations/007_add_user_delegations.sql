-- Migration 007: Create table user_delegations for temporary delegated access
-- MySQL dialect

CREATE TABLE IF NOT EXISTS `user_delegations` (
  `id` CHAR(36) NOT NULL,
  `org_id` CHAR(36) NOT NULL,
  `granter_id` CHAR(36) NOT NULL,
  `grantee_id` CHAR(36) NOT NULL,
  `roles_csv` VARCHAR(255) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_delegate_grantee` (`grantee_id`),
  KEY `idx_delegate_org` (`org_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

