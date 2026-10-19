-- Phase 1A — academic-calendar / enrollment / attendance-register foundation.
--
-- Adds the data-model foundation for the Report Card milestone
-- (docs/academic-calendar.md):
--   * Student.leftAt — the school-exit fact only (never rewrites placement).
--   * StudentEnrollmentPeriod — append-only placement history with half-open
--     [effectiveFrom, effectiveTo) boundaries.
--   * AcademicCalendar + CalendarDay — authored instructional-day model.
--   * AttendanceRegister — register completeness + non-null scopeKey.
--
-- The generated Prisma DDL below is followed by raw SQL that Prisma cannot
-- express: the btree_gist extension, the placement-overlap exclusion
-- constraint, and three CHECK constraints. This migration has NOT been applied
-- to any database; it is authored for review (Phase 1A).

-- CreateEnum
CREATE TYPE "Provenance" AS ENUM ('SEEDED', 'AUTHORED');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "CalendarDayKind" AS ENUM ('INSTRUCTIONAL', 'NON_INSTRUCTIONAL');

-- CreateEnum
CREATE TYPE "AttendanceRegisterStatus" AS ENUM ('OPEN', 'SUBMITTED', 'VERIFIED');

-- AlterEnum — audit entity types for the new foundation models. PostgreSQL 12+
-- allows ADD VALUE inside a transaction, and these values are not used again in
-- this migration, so the running transaction is safe.
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'ACADEMIC_CALENDAR';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'CALENDAR_DAY';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'STUDENT_ENROLLMENT_PERIOD';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_REGISTER';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "leftAt" DATE;

-- CreateTable
CREATE TABLE "AcademicCalendar" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "workingWeekdays" "Weekday"[],
    "provenance" "Provenance" NOT NULL DEFAULT 'SEEDED',
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CalendarDayKind" NOT NULL,
    "instructionalValue" DECIMAL(3,2) NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "source" "Provenance" NOT NULL DEFAULT 'SEEDED',
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentEnrollmentPeriod" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "source" "Provenance" NOT NULL DEFAULT 'SEEDED',
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentEnrollmentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRegister" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "expectedCount" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRegister_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicCalendar_schoolId_idx" ON "AcademicCalendar"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicCalendar_schoolId_academicSessionId_key" ON "AcademicCalendar"("schoolId", "academicSessionId");

-- CreateIndex
CREATE INDEX "CalendarDay_schoolId_academicSessionId_idx" ON "CalendarDay"("schoolId", "academicSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarDay_schoolId_academicSessionId_date_key" ON "CalendarDay"("schoolId", "academicSessionId", "date");

-- CreateIndex
CREATE INDEX "StudentEnrollmentPeriod_schoolId_academicSessionId_classId__idx" ON "StudentEnrollmentPeriod"("schoolId", "academicSessionId", "classId", "sectionId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "StudentEnrollmentPeriod_enrollmentId_idx" ON "StudentEnrollmentPeriod"("enrollmentId");

-- CreateIndex
CREATE INDEX "AttendanceRegister_schoolId_date_idx" ON "AttendanceRegister"("schoolId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRegister_schoolId_academicSessionId_status_idx" ON "AttendanceRegister"("schoolId", "academicSessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRegister_schoolId_academicSessionId_classId_scope_key" ON "AttendanceRegister"("schoolId", "academicSessionId", "classId", "scopeKey", "date");

-- AddForeignKey
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicCalendar" ADD CONSTRAINT "AcademicCalendar_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollmentPeriod" ADD CONSTRAINT "StudentEnrollmentPeriod_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL constraints (not expressible in the Prisma schema).
-- ---------------------------------------------------------------------------

-- btree_gist provides the GiST equality operator class required by the
-- exclusion constraint below. Verified available and trusted on the target
-- environment (PostgreSQL 18.6, btree_gist 1.8) during read-only preflight.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping placement periods for the same (school, student, session)
-- natural key — scoped independently of enrollmentId, so an internally
-- inconsistent enrollmentId can never bypass the guard. The range is half-open
-- '[)': consecutive periods may meet at a shared boundary date without
-- overlapping, and a NULL effectiveTo yields an unbounded upper range (the
-- open/current period).
ALTER TABLE "StudentEnrollmentPeriod"
    ADD CONSTRAINT "student_enrollment_period_no_overlap"
    EXCLUDE USING gist (
        "schoolId"          WITH =,
        "studentId"         WITH =,
        "academicSessionId" WITH =,
        daterange("effectiveFrom", "effectiveTo", '[)') WITH &&
    );

-- A present effectiveTo must be strictly after effectiveFrom (a non-empty
-- half-open interval). NULL marks the open/current period.
ALTER TABLE "StudentEnrollmentPeriod"
    ADD CONSTRAINT "student_enrollment_period_range_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- scopeKey must match the register scope: the canonical '__CLASS__' constant
-- for class-level registers (sectionId IS NULL), and the section id for
-- section-level registers. The server always derives scopeKey; a client-supplied
-- value is never trusted. This CHECK is the enforcement point.
ALTER TABLE "AttendanceRegister"
    ADD CONSTRAINT "attendance_register_scope_key_check"
    CHECK (
        ("sectionId" IS NULL AND "scopeKey" = '__CLASS__')
        OR ("sectionId" IS NOT NULL AND "scopeKey" = "sectionId")
    );

-- instructionalValue is 0 for NON_INSTRUCTIONAL days and 0.5/1.0 for
-- INSTRUCTIONAL days.
ALTER TABLE "CalendarDay"
    ADD CONSTRAINT "calendar_day_instructional_value_check"
    CHECK (
        ("kind" = 'NON_INSTRUCTIONAL' AND "instructionalValue" = 0.00)
        OR ("kind" = 'INSTRUCTIONAL' AND "instructionalValue" IN (0.50, 1.00))
    );
