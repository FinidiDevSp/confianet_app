-- Migration 006: Create table app_settings to persist encrypted org-level settings (e.g., SMTP)
-- MySQL dialect

CREATE TABLE IF NOT EXISTS `app_settings` (
  `org_id` CHAR(36) NOT NULL,
  `key_name` VARCHAR(64) NOT NULL,
  `value_enc` TEXT NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`org_id`, `key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

