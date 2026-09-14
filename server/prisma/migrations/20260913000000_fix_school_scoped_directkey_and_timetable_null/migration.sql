-- School-scoped conversation uniqueness + timetable NULLS NOT DISTINCT.
--
-- 1) Conversation.directKey was globally unique: the same user pair could only
--    hold one direct conversation across the entire platform, so a second
--    school would hit P2002. Making it school-scoped (schoolId, directKey)
--    lets the same pair hold independent direct conversations per school.
--
-- 2) TimetableEntry's class-slot unique index treated NULL (sectionless)
--    rows as distinct, so a class with no sections could be double-booked
--    in the same period. Recreated with NULLS NOT DISTINCT.
--
-- Note: `NULLS NOT DISTINCT` cannot be expressed in the Prisma schema, so
-- this index is maintained in SQL only (like partial indexes Prisma does not
-- model). Keep the schema @@unique declaration in sync with this index.

-- DropIndex: remove the old global directKey unique index
DROP INDEX "Conversation_directKey_key";

-- CreateIndex: school-scoped composite unique on direct conversations
CREATE UNIQUE INDEX "Conversation_schoolId_directKey_key" ON "Conversation"("schoolId", "directKey");

-- DropIndex: remove the original class-slot unique index
DROP INDEX "timetable_class_slot_unique";

-- CreateIndex: recreate with NULLS NOT DISTINCT so sectionless (NULL) rows
-- count as equal and cannot double-book a class+period.
CREATE UNIQUE INDEX "timetable_class_slot_unique" ON "TimetableEntry"("schoolId", "academicSessionId", "dayOfWeek", "periodSlotId", "classId", "sectionId") NULLS NOT DISTINCT;