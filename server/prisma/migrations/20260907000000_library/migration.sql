-- CreateEnum
CREATE TYPE "LibraryCategory" AS ENUM ('FICTION', 'NON_FICTION', 'REFERENCE', 'TEXTBOOK', 'MAGAZINE', 'JOURNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LibraryCopyStatus" AS ENUM ('AVAILABLE', 'ISSUED', 'LOST', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "LibraryBorrowerType" AS ENUM ('STUDENT', 'TEACHER', 'STAFF');

-- AlterTable (additive per-school copy code counter)
ALTER TABLE "School" ADD COLUMN "libraryCopyCounter" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "LibraryBook" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isbn" TEXT,
    "publisher" TEXT,
    "edition" TEXT,
    "category" "LibraryCategory" NOT NULL DEFAULT 'OTHER',
    "language" TEXT,
    "description" TEXT,
    "coverUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryCopy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "copyCode" TEXT NOT NULL,
    "status" "LibraryCopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryLoan" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "borrowerType" "LibraryBorrowerType" NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "borrowerCode" TEXT,
    "issuedAt" DATE NOT NULL,
    "dueAt" DATE NOT NULL,
    "returnedAt" DATE,
    "issuedBy" TEXT,
    "returnedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBook_schoolId_isbn_key" ON "LibraryBook"("schoolId", "isbn");
CREATE INDEX "LibraryBook_schoolId_category_idx" ON "LibraryBook"("schoolId", "category");
CREATE INDEX "LibraryBook_schoolId_title_idx" ON "LibraryBook"("schoolId", "title");
CREATE INDEX "LibraryBook_schoolId_isActive_idx" ON "LibraryBook"("schoolId", "isActive");
CREATE UNIQUE INDEX "LibraryCopy_schoolId_copyCode_key" ON "LibraryCopy"("schoolId", "copyCode");
CREATE INDEX "LibraryCopy_schoolId_status_idx" ON "LibraryCopy"("schoolId", "status");
CREATE INDEX "LibraryCopy_bookId_idx" ON "LibraryCopy"("bookId");
CREATE INDEX "LibraryLoan_schoolId_returnedAt_idx" ON "LibraryLoan"("schoolId", "returnedAt");
CREATE INDEX "LibraryLoan_schoolId_dueAt_idx" ON "LibraryLoan"("schoolId", "dueAt");
CREATE INDEX "LibraryLoan_schoolId_borrowerType_borrowerId_idx" ON "LibraryLoan"("schoolId", "borrowerType", "borrowerId");
CREATE INDEX "LibraryLoan_schoolId_copyId_idx" ON "LibraryLoan"("schoolId", "copyId");

-- AddForeignKey
ALTER TABLE "LibraryBook" ADD CONSTRAINT "LibraryBook_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryCopy" ADD CONSTRAINT "LibraryCopy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryCopy" ADD CONSTRAINT "LibraryCopy_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "LibraryCopy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_returnedBy_fkey" FOREIGN KEY ("returnedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddValue (additive audit actions for circulation events)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ISSUE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RETURN';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'LIBRARY_BOOK';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'LIBRARY_COPY';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'LIBRARY_LOAN';