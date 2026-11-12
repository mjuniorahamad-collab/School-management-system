-- CreateEnum
CREATE TYPE "MembershipPermissionEventType" AS ENUM ('GRANTED', 'REVOKED');

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN "removedAt" TIMESTAMP(3),
ADD COLUMN "removedById" TEXT;

-- AlterTable
ALTER TABLE "TenantMembershipPermission" ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revokedById" TEXT,
ADD COLUMN "revocationReason" TEXT;

-- CreateTable
CREATE TABLE "MembershipPermissionHistory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "eventType" "MembershipPermissionEventType" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPermissionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipPermissionHistory_schoolId_createdAt_idx" ON "MembershipPermissionHistory"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "MembershipPermissionHistory_membershipId_createdAt_idx" ON "MembershipPermissionHistory"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "MembershipPermissionHistory_targetUserId_idx" ON "MembershipPermissionHistory"("targetUserId");

-- CreateIndex
CREATE INDEX "MembershipPermissionHistory_permissionCode_idx" ON "MembershipPermissionHistory"("permissionCode");

-- CreateIndex
CREATE INDEX "TenantMembership_removedById_idx" ON "TenantMembership"("removedById");

-- CreateIndex
CREATE INDEX "TenantMembershipPermission_membershipId_revokedAt_idx" ON "TenantMembershipPermission"("membershipId", "revokedAt");

-- CreateIndex
CREATE INDEX "TenantMembershipPermission_revokedById_idx" ON "TenantMembershipPermission"("revokedById");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembershipPermission" ADD CONSTRAINT "TenantMembershipPermission_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
