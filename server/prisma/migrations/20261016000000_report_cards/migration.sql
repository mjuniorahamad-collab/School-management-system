-- Report Cards: persistence foundation

-- Enums
CREATE TYPE "MarkStatus" AS ENUM ('SCORED','ABSENT','NOT_APPLICABLE','PENDING');
CREATE TYPE "ReportCardAggregationPolicy" AS ENUM ('RAW','PERCENTAGE_WEIGHTED');
CREATE TYPE "ReportCardAbsencePolicy" AS ENUM ('EXCLUDE_AND_REVIEW','TREAT_SUBJECT_AS_FAILED');
CREATE TYPE "ReportCardOverallPassMode" AS ENUM ('ALL_SUBJECTS','PERCENT_AND_MAX_FAILED','CORE_SUBJECTS_AND_PERCENT');
CREATE TYPE "ReportCardPublicationMode" AS ENUM ('REQUIRE_DECISION');
CREATE TYPE "ReportCardExamResolutionStatus" AS ENUM ('RESOLVED','NOT_FINAL','AMBIGUOUS','MISSING','OUT_OF_SCOPE');
CREATE TYPE "ReportCardExamResolutionReason" AS ENUM ('CROSS_SECTION_DUPLICATE','CLASS_CHANGE','NO_RESULT_ROW','NO_EXAM_INSTANCE','IMPLICIT');
CREATE TYPE "ReportCardSubjectOutcome" AS ENUM ('PASS','FAIL','NOT_APPLICABLE','REQUIRES_REVIEW');
CREATE TYPE "ReportCardAnnualResult" AS ENUM ('PASS','FAIL','UNRESOLVED','REQUIRES_REVIEW');
CREATE TYPE "ReportCardStatus" AS ENUM ('DRAFT','PENDING_ARCHIVE','ISSUED','SUPERSEDED','VOID');
CREATE TYPE "ReportCardSubjectOutcomeReason" AS ENUM ('PENDING_OR_MISSING_MARKS','ALL_NOT_APPLICABLE','ABSENT_FORCED_FAIL','ABSENT_EXCLUDED_REVIEW','WEIGHTS_UNAVAILABLE','SUBJECT_PASS_PERCENT_UNAVAILABLE');

-- Alter ExamMark
ALTER TABLE "ExamMark" ADD COLUMN "status" "MarkStatus" NOT NULL DEFAULT 'SCORED';
-- Tables
CREATE TABLE "ReportCardScheme" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "academicSessionId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "sectionId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "aggregationPolicy" "ReportCardAggregationPolicy" NOT NULL,
  "absencePolicy" "ReportCardAbsencePolicy" NOT NULL DEFAULT 'EXCLUDE_AND_REVIEW',
  "overallPassMode" "ReportCardOverallPassMode" NOT NULL,
  "annualSubjectPassPercent" DECIMAL(5,2) NOT NULL,
  "overallPassPercent" DECIMAL(5,2),
  "maxFailedSubjects" INTEGER,
  "coreSubjectIds" TEXT[] NOT NULL,
  "publicationMode" "ReportCardPublicationMode" NOT NULL DEFAULT 'REQUIRE_DECISION',
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportCardScheme_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardScheme_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardScheme_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardScheme_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReportCardScheme_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReportCardScheme_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ReportCardSchemeExam" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schemeId" TEXT NOT NULL,
  "examTypeId" TEXT NOT NULL,
  "weight" DECIMAL(6,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportCardSchemeExam_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "ReportCardScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardSchemeExam_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ReportCard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "academicSessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "sectionId" TEXT,
  "version" INTEGER NOT NULL,
  "status" "ReportCardStatus" NOT NULL DEFAULT 'DRAFT',
  "overallResult" "ReportCardAnnualResult",
  "overallPercentage" DECIMAL(5,2),
  "failedCount" INTEGER,
  "resolvedSubjectCount" INTEGER,
  "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  "snapshot" JSONB,
  "snapshotHash" TEXT,
  "publishedAt" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "supersedesReportCardId" TEXT,
  "reissueReason" TEXT,
  "createdByUserId" TEXT,
  "publishedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportCard_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_supersedesReportCardId_fkey" FOREIGN KEY ("supersedesReportCardId") REFERENCES "ReportCard"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReportCard_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ReportCardSubject" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportCardId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "isCore" BOOLEAN NOT NULL DEFAULT false,
  "outcome" "ReportCardSubjectOutcome" NOT NULL,
  "percentage" DECIMAL(5,2),
  "grade" TEXT,
  "reason" "ReportCardSubjectOutcomeReason",
  "includedExamIds" TEXT[] NOT NULL,
  "excludedExamIds" TEXT[] NOT NULL,
  "absentExamIds" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportCardSubject_reportCardId_fkey" FOREIGN KEY ("reportCardId") REFERENCES "ReportCard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ReportCardExamResolution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportCardId" TEXT NOT NULL,
  "examTypeId" TEXT NOT NULL,
  "examId" TEXT,
  "status" "ReportCardExamResolutionStatus" NOT NULL,
  "reason" "ReportCardExamResolutionReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportCardExamResolution_reportCardId_fkey" FOREIGN KEY ("reportCardId") REFERENCES "ReportCard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardExamResolution_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ReportCardArtifact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "reportCardId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "filename" TEXT,
  "uploadedByUserId" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportCardArtifact_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardArtifact_reportCardId_fkey" FOREIGN KEY ("reportCardId") REFERENCES "ReportCard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportCardArtifact_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReportCardArtifact_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Indices and unique constraints
CREATE UNIQUE INDEX "ReportCardScheme_schoolId_academicSessionId_classId_scopeKe_key" ON "ReportCardScheme"("schoolId","academicSessionId","classId","scopeKey");
CREATE INDEX "ReportCardScheme_schoolId_academicSessionId_idx" ON "ReportCardScheme"("schoolId","academicSessionId");
CREATE INDEX "ReportCardScheme_schoolId_classId_sectionId_idx" ON "ReportCardScheme"("schoolId","classId","sectionId");

CREATE UNIQUE INDEX "ReportCardSchemeExam_schemeId_examTypeId_key" ON "ReportCardSchemeExam"("schemeId","examTypeId");
CREATE INDEX "ReportCardSchemeExam_schemeId_idx" ON "ReportCardSchemeExam"("schemeId");
CREATE INDEX "ReportCardSchemeExam_examTypeId_idx" ON "ReportCardSchemeExam"("examTypeId");

CREATE UNIQUE INDEX "ReportCard_schoolId_academicSessionId_studentId_version_key" ON "ReportCard"("schoolId","academicSessionId","studentId","version");
CREATE INDEX "ReportCard_schoolId_academicSessionId_idx" ON "ReportCard"("schoolId","academicSessionId");
CREATE INDEX "ReportCard_schoolId_studentId_idx" ON "ReportCard"("schoolId","studentId");
CREATE INDEX "ReportCard_schoolId_status_idx" ON "ReportCard"("schoolId","status");

CREATE UNIQUE INDEX "ReportCardSubject_reportCardId_subjectId_key" ON "ReportCardSubject"("reportCardId","subjectId");
CREATE INDEX "ReportCardSubject_reportCardId_idx" ON "ReportCardSubject"("reportCardId");
CREATE INDEX "ReportCardSubject_subjectId_idx" ON "ReportCardSubject"("subjectId");

CREATE UNIQUE INDEX "ReportCardExamResolution_reportCardId_examTypeId_key" ON "ReportCardExamResolution"("reportCardId","examTypeId");
CREATE INDEX "ReportCardExamResolution_reportCardId_idx" ON "ReportCardExamResolution"("reportCardId");
CREATE INDEX "ReportCardExamResolution_examTypeId_idx" ON "ReportCardExamResolution"("examTypeId");

CREATE UNIQUE INDEX "ReportCardArtifact_reportCardId_version_key" ON "ReportCardArtifact"("reportCardId","version");
CREATE UNIQUE INDEX "ReportCardArtifact_reportCardId_key" ON "ReportCardArtifact"("reportCardId");
CREATE INDEX "ReportCardArtifact_reportCardId_idx" ON "ReportCardArtifact"("reportCardId");
CREATE INDEX "ReportCardArtifact_schoolId_idx" ON "ReportCardArtifact"("schoolId");
