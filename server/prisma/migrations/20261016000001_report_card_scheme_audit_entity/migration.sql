-- Report Cards M6a - add the REPORT_CARD_SCHEME AuditEntityType value so report
-- card scheme configuration changes (create/update) can be audited through the
-- existing AuditLog mechanism (additive enum value only).

ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'REPORT_CARD_SCHEME';
