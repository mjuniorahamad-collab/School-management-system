import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
}

describe("membership permission history migration - additive contract", () => {
  const schemaSource = readSource("../prisma/schema.prisma")
  const migrationSource = readSource(
    "../prisma/migrations/20261107000000_preserve_membership_permission_history/migration.sql",
  )

  it("adds revocation and soft-removal state without dropping existing data", () => {
    expect(schemaSource).toMatch(/model TenantMembershipPermission \{[\s\S]*revokedAt/)
    expect(schemaSource).toMatch(/model TenantMembership \{[\s\S]*removedAt/)
    expect(schemaSource).toContain("model MembershipPermissionHistory")
    expect(migrationSource).toContain('ADD COLUMN "revokedAt"')
    expect(migrationSource).toContain('ADD COLUMN "removedAt"')
    expect(migrationSource).toContain('CREATE TABLE "MembershipPermissionHistory"')
  })

  it("contains no destructive or backfill statements", () => {
    expect(migrationSource).not.toMatch(/^\s*(DROP|DELETE|TRUNCATE|UPDATE)\b/im)
  })

  it("keeps history rows free of cascading foreign keys", () => {
    const historyModel = schemaSource.slice(
      schemaSource.indexOf("model MembershipPermissionHistory"),
      schemaSource.indexOf("model ", schemaSource.indexOf("model MembershipPermissionHistory") + 1),
    )
    expect(historyModel).not.toContain("@relation")
    expect(historyModel).not.toContain("fields:")
  })
})
