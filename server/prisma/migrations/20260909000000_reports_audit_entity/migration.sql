-- Reports V1 — add the REPORT AuditEntityType value so report exports can be
-- audited through the existing AuditLog mechanism (additive enum value only).

ALTER TYPE "AuditEntityType" ADD VALUE 'REPORT';