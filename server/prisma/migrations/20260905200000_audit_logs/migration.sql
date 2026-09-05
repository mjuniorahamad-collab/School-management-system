-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PUBLISH', 'ARCHIVE', 'REVIEW', 'CONVERT', 'GENERATE', 'RECORD_PAYMENT', 'ISSUE_RECEIPT', 'LOGIN', 'FAILED_LOGIN', 'LOGOUT', 'PERMISSION_CHANGE', 'MEMBER_ROLE_CHANGE', 'MEMBER_STATUS_CHANGE', 'MEMBER_REMOVED', 'SETTING_CHANGE', 'EXPORT', 'CORRECT');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('STUDENT', 'TEACHER', 'STAFF', 'ADMISSION', 'USER', 'ROLE', 'TENANT_MEMBERSHIP', 'ACADEMIC_SESSION', 'CLASS', 'SECTION', 'SUBJECT', 'FEE_HEAD', 'FEE_STRUCTURE', 'FEE_INVOICE', 'FEE_INSTALLMENT', 'FEE_PAYMENT', 'FEE_RECEIPT', 'PERIOD_SLOT', 'TIMETABLE_ENTRY', 'ATTENDANCE_RECORD', 'HOMEWORK', 'ASSIGNMENT', 'EXAM', 'EXAM_RESULT', 'EXAM_MARK', 'EXAM_TYPE', 'GRADING_BAND', 'NOTICE', 'EVENT', 'SCHOOL_SETTING', 'AUTH');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_actorId_createdAt_idx" ON "AuditLog"("schoolId", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_entityType_createdAt_idx" ON "AuditLog"("schoolId", "entityType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_entityId_createdAt_idx" ON "AuditLog"("schoolId", "entityId", "createdAt");