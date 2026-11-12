-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "TenantMembershipPermission" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembershipPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantMembershipPermission_membershipId_idx" ON "TenantMembershipPermission"("membershipId");

-- CreateIndex
CREATE INDEX "TenantMembershipPermission_permissionId_idx" ON "TenantMembershipPermission"("permissionId");

-- CreateIndex
CREATE INDEX "TenantMembershipPermission_grantedById_idx" ON "TenantMembershipPermission"("grantedById");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembershipPermission_membershipId_permissionId_key" ON "TenantMembershipPermission"("membershipId", "permissionId");

-- AddForeignKey
ALTER TABLE "TenantMembershipPermission" ADD CONSTRAINT "TenantMembershipPermission_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembershipPermission" ADD CONSTRAINT "TenantMembershipPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembershipPermission" ADD CONSTRAINT "TenantMembershipPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
