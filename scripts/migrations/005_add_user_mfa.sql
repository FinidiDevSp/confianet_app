-- Migration 005: Create table user_mfa to store encrypted TOTP secrets and recovery codes
-- MySQL dialect

CREATE TABLE IF NOT EXISTS `user_mfa` (
  `user_id` CHAR(36) NOT NULL,
  `secret_enc` VARCHAR(512) NOT NULL,
  `recovery_codes_enc` TEXT NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

