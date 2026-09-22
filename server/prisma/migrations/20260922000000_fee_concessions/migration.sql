-- FeeConcessions — student-specific fee adjustments/discounts/waivers ledger.
--
-- Pattern in this repo (see add_guardian_audit_entity): additive enum values
-- are appended one ALTER TYPE per value, and populated-table backfills are
-- authored manually because Prisma's naive ADD COLUMN NOT NULL would fail on
-- existing rows.

-- AlterEnum (AuditAction — concession lifecycle events)
ALTER TYPE "AuditAction" ADD VALUE 'CONCESSION_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'CONCESSION_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'CONCESSION_OVERRIDE';
ALTER TYPE "AuditAction" ADD VALUE 'CONCESSION_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'CONCESSION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'CONCESSION_REVERSED';

-- AlterEnum (AuditEntityType)
ALTER TYPE "AuditEntityType" ADD VALUE 'FEE_ADJUSTMENT';

-- CreateEnum
CREATE TYPE "FeeAdjustmentKind" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "FeeAdjustmentStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVERSED');

-- AlterTable (FeeInvoice): add the frozen historical GROSS snapshot.
-- Existing invoices have no concession history, so gross == total for all of
-- them — backfill before enforcing NOT NULL. No existing financial totals are
-- rewritten.
ALTER TABLE "FeeInvoice" ADD COLUMN     "grossAmount" DECIMAL(12,2);

-- Backfill
UPDATE "FeeInvoice"
SET    "grossAmount" = "totalAmount"
WHERE  "grossAmount" IS NULL;

-- Enforce the invariant
ALTER TABLE "FeeInvoice" ALTER COLUMN "grossAmount" SET NOT NULL;

-- CreateTable
CREATE TABLE "FeeAdjustment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "kind" "FeeAdjustmentKind" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "computedAmount" DECIMAL(12,2) NOT NULL,
    "status" "FeeAdjustmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "installmentApplication" JSONB,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overriddenById" TEXT,
    "overrideReason" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "reversedById" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeAdjustment_schoolId_studentId_idx" ON "FeeAdjustment"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "FeeAdjustment_schoolId_invoiceId_idx" ON "FeeAdjustment"("schoolId", "invoiceId");

-- CreateIndex
CREATE INDEX "FeeAdjustment_schoolId_status_idx" ON "FeeAdjustment"("schoolId", "status");

-- CreateIndex
CREATE INDEX "FeeAdjustment_schoolId_status_createdAt_idx" ON "FeeAdjustment"("schoolId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FeeAdjustment_invoiceId_idx" ON "FeeAdjustment"("invoiceId");

-- CreateIndex
CREATE INDEX "FeeAdjustment_reversalOfId_idx" ON "FeeAdjustment"("reversalOfId");

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FeeAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;