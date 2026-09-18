-- Portal provisioning: one-time parent account activation tokens.
-- Only the sha-256 HASH of a raw token is stored (mirrors Session); `usedAt`
-- marks a successfully activated token (single use) and `revokedAt` marks a
-- superseded/cancelled token. `purpose` is a string literal ("PARENT") so
-- future activation kinds never require a PG enum migration.

-- CreateTable
CREATE TABLE "PortalActivationToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'PARENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalActivationToken_tokenHash_key" ON "PortalActivationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalActivationToken_schoolId_idx" ON "PortalActivationToken"("schoolId");

-- CreateIndex
CREATE INDEX "PortalActivationToken_userId_idx" ON "PortalActivationToken"("userId");

-- AddForeignKey
ALTER TABLE "PortalActivationToken" ADD CONSTRAINT "PortalActivationToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalActivationToken" ADD CONSTRAINT "PortalActivationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;