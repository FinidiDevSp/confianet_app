USE canal_denuncias;

ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(128) NULL AFTER name;

