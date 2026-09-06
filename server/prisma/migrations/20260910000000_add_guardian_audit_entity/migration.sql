-- Portal V1 - add the GUARDIAN AuditEntityType value so account-linking events on
-- guardian profiles can be audited through the existing AuditLog mechanism
-- (additive enum value only).

ALTER TYPE "AuditEntityType" ADD VALUE 'GUARDIAN';