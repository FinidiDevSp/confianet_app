USE canal_denuncias;

-- Organización demo
INSERT INTO organizations (id, name, slug, settings, region, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Org Demo',
  'org-demo',
  NULL,
  'ES',
  NOW()
)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Usuario admin demo (sin password_hash en este esquema)
INSERT INTO users (id, org_id, email, name, role, status, mfa_enabled, created_at)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'admin@example.com',
  'Admin Demo',
  'admin',
  'active',
  0,
  NOW()
)
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);
