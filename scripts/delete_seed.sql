USE canal_denuncias;

-- Desactivar chequeo de claves foráneas temporalmente
SET FOREIGN_KEY_CHECKS = 0;

-- Limpiar tablas (orden inverso para evitar dependencias)
TRUNCATE TABLE portal_tokens;
TRUNCATE TABLE audit_log;
TRUNCATE TABLE notifications;
TRUNCATE TABLE people_involved;
TRUNCATE TABLE status_history;
TRUNCATE TABLE attachments;
TRUNCATE TABLE case_messages;
TRUNCATE TABLE case_assignments;
TRUNCATE TABLE report_cases;
TRUNCATE TABLE categories;
TRUNCATE TABLE users;
TRUNCATE TABLE org_settings;
TRUNCATE TABLE organizations;

-- Reactivar chequeo de claves foráneas
SET FOREIGN_KEY_CHECKS = 1;

-- Opcional: volver a crear seed demo
-- CALL seed_demo();  -- si defines un procedimiento almacenado de seed
