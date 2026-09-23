-- Reconcile Fee Concessions permissions introduced by commit 6dc9355.
--
-- Additive + idempotent: inserts ONLY the 6 missing Permission codes and the
-- 17 matching RolePermission grants from ROLE_PERMISSIONS
-- (server/src/permissions/permissions.ts). Never updates or deletes existing
-- rows. Safe to re-run (ON CONFLICT ... DO NOTHING against the existing unique
-- constraints). Roles are resolved by exact Role.name; permissions by exact
-- Permission.code; ids via gen_random_uuid() (core PG >= 13 — same pattern as
-- the 20260903120000_phase0_tenant_identity_foundation backfill).

-- 1) Permission catalog — 6 codes
INSERT INTO "Permission" ("id", "code", "resource", "action", "description")
VALUES
  (gen_random_uuid(), 'concessions:view',     'concessions', 'view',     'View concessions'),
  (gen_random_uuid(), 'concessions:request',  'concessions', 'request',  'Request concessions'),
  (gen_random_uuid(), 'concessions:approve',  'concessions', 'approve',  'Approve concessions'),
  (gen_random_uuid(), 'concessions:reject',   'concessions', 'reject',   'Reject concessions'),
  (gen_random_uuid(), 'concessions:reverse',  'concessions', 'reverse',  'Reverse concessions'),
  (gen_random_uuid(), 'concessions:override', 'concessions', 'override', 'Override concessions')
ON CONFLICT ("code") DO NOTHING;

-- 2) RolePermission grants — 17 rows (SUPER_ADMIN 6, SCHOOL_ADMIN 5,
--    PRINCIPAL 4, ACCOUNTANT 2). concessions:override is granted to
--    SUPER_ADMIN only — never to a tenant role.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid(), r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE (r."name", p."code") IN (
  ('SUPER_ADMIN', 'concessions:view'),
  ('SUPER_ADMIN', 'concessions:request'),
  ('SUPER_ADMIN', 'concessions:approve'),
  ('SUPER_ADMIN', 'concessions:reject'),
  ('SUPER_ADMIN', 'concessions:reverse'),
  ('SUPER_ADMIN', 'concessions:override'),
  ('SCHOOL_ADMIN', 'concessions:view'),
  ('SCHOOL_ADMIN', 'concessions:request'),
  ('SCHOOL_ADMIN', 'concessions:approve'),
  ('SCHOOL_ADMIN', 'concessions:reject'),
  ('SCHOOL_ADMIN', 'concessions:reverse'),
  ('PRINCIPAL',    'concessions:view'),
  ('PRINCIPAL',    'concessions:approve'),
  ('PRINCIPAL',    'concessions:reject'),
  ('PRINCIPAL',    'concessions:reverse'),
  ('ACCOUNTANT',   'concessions:view'),
  ('ACCOUNTANT',   'concessions:request')
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;