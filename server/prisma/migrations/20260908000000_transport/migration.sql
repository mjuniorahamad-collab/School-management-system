-- CreateEnum
CREATE TYPE "TransportVehicleType" AS ENUM ('BUS', 'VAN', 'MINI_BUS', 'CAR', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportDirection" AS ENUM ('TO_SCHOOL', 'FROM_SCHOOL', 'BOTH');

-- CreateEnum
CREATE TYPE "TransportAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum (additive audit action for transport assignments)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ASSIGN';

-- AlterEnum (additive audit entity types; guarded per value)
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TRANSPORT_VEHICLE';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TRANSPORT_ROUTE';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TRANSPORT_STOP';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TRANSPORT_DRIVER';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TRANSPORT_ASSIGNMENT';

-- AlterTable (additive per-school transport vehicle code counter)
ALTER TABLE "School" ADD COLUMN     "transportVehicleCounter" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "TransportVehicle" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "vehicleCode" TEXT NOT NULL,
    "type" "TransportVehicleType" NOT NULL DEFAULT 'OTHER',
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRoute" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "vehicleId" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportStop" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriver" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "routeId" TEXT,
    "staffId" TEXT NOT NULL,
    "userId" TEXT,
    "roleLabel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "direction" "TransportDirection" NOT NULL,
    "status" "TransportAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportVehicle_schoolId_isActive_idx" ON "TransportVehicle"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TransportVehicle_schoolId_registrationNumber_key" ON "TransportVehicle"("schoolId", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TransportVehicle_schoolId_vehicleCode_key" ON "TransportVehicle"("schoolId", "vehicleCode");

-- CreateIndex
CREATE INDEX "TransportRoute_schoolId_isActive_idx" ON "TransportRoute"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRoute_schoolId_name_key" ON "TransportRoute"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TransportRoute_schoolId_vehicleId_key" ON "TransportRoute"("schoolId", "vehicleId");

-- CreateIndex
CREATE INDEX "TransportStop_schoolId_routeId_idx" ON "TransportStop"("schoolId", "routeId");

-- CreateIndex
CREATE INDEX "TransportStop_schoolId_isActive_idx" ON "TransportStop"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TransportStop_routeId_name_key" ON "TransportStop"("routeId", "name");

-- CreateIndex
CREATE INDEX "TransportDriver_schoolId_routeId_idx" ON "TransportDriver"("schoolId", "routeId");

-- CreateIndex
CREATE INDEX "TransportDriver_schoolId_isActive_idx" ON "TransportDriver"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriver_schoolId_staffId_key" ON "TransportDriver"("schoolId", "staffId");

-- CreateIndex
CREATE INDEX "TransportAssignment_schoolId_academicSessionId_routeId_stat_idx" ON "TransportAssignment"("schoolId", "academicSessionId", "routeId", "status");

-- CreateIndex
CREATE INDEX "TransportAssignment_schoolId_studentId_status_idx" ON "TransportAssignment"("schoolId", "studentId", "status");

-- CreateIndex
CREATE INDEX "TransportAssignment_studentId_academicSessionId_direction_s_idx" ON "TransportAssignment"("studentId", "academicSessionId", "direction", "status");

-- CreateIndex
CREATE INDEX "TransportAssignment_schoolId_routeId_idx" ON "TransportAssignment"("schoolId", "routeId");

-- AddForeignKey
ALTER TABLE "TransportVehicle" ADD CONSTRAINT "TransportVehicle_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRoute" ADD CONSTRAINT "TransportRoute_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriver" ADD CONSTRAINT "TransportDriver_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriver" ADD CONSTRAINT "TransportDriver_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriver" ADD CONSTRAINT "TransportDriver_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriver" ADD CONSTRAINT "TransportDriver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "TransportStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;