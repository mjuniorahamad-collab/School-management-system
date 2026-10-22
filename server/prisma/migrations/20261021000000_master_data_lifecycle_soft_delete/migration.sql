-- Phase 1 master-data lifecycle: add a soft-delete marker to the four
-- master-data models that must be retired without losing history.
--
-- Each column is added as NOT NULL DEFAULT true, so every existing row stays
-- active and no historical data (grades, exams, fee structures, timetable
-- entries) is rewritten. The default is intentionally permanent: a retired
-- record is never silently reactivated by a later insert.

ALTER TABLE "GradingBand" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ExamType" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "FeeHead" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PeriodSlot" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Lookup indexes used by the active-only reads that now dominate master-data
-- and grading lookups.
CREATE INDEX "GradingBand_schoolId_isActive_idx" ON "GradingBand"("schoolId", "isActive");
CREATE INDEX "ExamType_schoolId_isActive_idx" ON "ExamType"("schoolId", "isActive");
CREATE INDEX "FeeHead_schoolId_isActive_idx" ON "FeeHead"("schoolId", "isActive");
CREATE INDEX "PeriodSlot_schoolId_isActive_idx" ON "PeriodSlot"("schoolId", "isActive");
