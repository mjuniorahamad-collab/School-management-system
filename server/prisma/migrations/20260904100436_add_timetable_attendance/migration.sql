-- CreateEnum
CREATE TYPE "TimetableDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HOLIDAY');

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "dayOfWeek" "TimetableDay" NOT NULL,
    "periodSlotId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT,
    "date" DATE NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,
    "markedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableEntry_schoolId_academicSessionId_idx" ON "TimetableEntry"("schoolId", "academicSessionId");

-- CreateIndex
CREATE INDEX "TimetableEntry_schoolId_classId_sectionId_idx" ON "TimetableEntry"("schoolId", "classId", "sectionId");

-- CreateIndex
CREATE INDEX "TimetableEntry_schoolId_teacherId_idx" ON "TimetableEntry"("schoolId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_class_slot_unique" ON "TimetableEntry"("schoolId", "academicSessionId", "dayOfWeek", "periodSlotId", "classId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_teacher_slot_unique" ON "TimetableEntry"("schoolId", "academicSessionId", "dayOfWeek", "periodSlotId", "teacherId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_schoolId_academicSessionId_idx" ON "AttendanceRecord"("schoolId", "academicSessionId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_schoolId_classId_sectionId_idx" ON "AttendanceRecord"("schoolId", "classId", "sectionId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_schoolId_studentId_idx" ON "AttendanceRecord"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_schoolId_date_idx" ON "AttendanceRecord"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_schoolId_enrollmentId_date_key" ON "AttendanceRecord"("schoolId", "enrollmentId", "date");

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodSlotId_fkey" FOREIGN KEY ("periodSlotId") REFERENCES "PeriodSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedBy_fkey" FOREIGN KEY ("markedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
