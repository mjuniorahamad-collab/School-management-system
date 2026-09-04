-- AlterTable: allow students to be enrolled in classes that have no sections.
ALTER TABLE "StudentEnrollment" ALTER COLUMN "sectionId" DROP NOT NULL;
