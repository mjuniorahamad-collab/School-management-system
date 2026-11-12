import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
}

describe("membership permission routes - authorization contract", () => {
  const routeSource = readSource(
    "../src/modules/membership-permissions/membership-permission.route.ts",
  )

  it("guards GET with membership-permissions:view", () => {
    expect(routeSource).toMatch(
      /\.get\(\s*"\/:membershipId\/permissions",\s*requirePermission\("membership-permissions:view"\)/,
    )
  })

  it("guards POST with membership-permissions:grant", () => {
    expect(routeSource).toMatch(
      /\.post\(\s*"\/:membershipId\/permissions",\s*requirePermission\("membership-permissions:grant"\)/,
    )
  })

  it("does not reuse users:update for either endpoint", () => {
    expect(routeSource).not.toContain("users:update")
  })

  it("disables PUT with a 405 and never imports the replacement flow", () => {
    expect(routeSource).toMatch(/\.put\(\s*"\/:membershipId\/permissions"/)
    expect(routeSource).toContain("405")
    expect(routeSource).not.toContain("replaceMembershipPermissions")
  })
})

describe("membership permission grant - destructive-write contract", () => {
  const serviceSource = readSource(
    "../src/modules/membership-permissions/membership-permission.service.ts",
  )

  it("never deletes or replaces override rows", () => {
    expect(serviceSource).not.toMatch(/tenantMembershipPermission\.delete/)
    expect(serviceSource).not.toMatch(/tenantMembershipPermission\.createMany/)
  })

  it("only updates a revoked override to reactivate it as ALLOW", () => {
    expect(serviceSource).toContain("if (existing && existingIsRevoked)")
    expect(serviceSource).toMatch(
      /tenantMembershipPermission\.update\(\{[\s\S]*revokedAt: null/,
    )
  })
})

describe("membership lifecycle - preservation contract", () => {
  const userServiceSource = readSource("../src/modules/users/user.service.ts")

  it("never hard-deletes a membership or its override rows", () => {
    expect(userServiceSource).not.toMatch(/tenantMembership\.delete\b/)
    expect(userServiceSource).not.toMatch(/tenantMembershipPermission\.delete/)
    expect(userServiceSource).toContain("revokeActiveMembershipPermissions")
    expect(userServiceSource).toContain("removedAt: new Date()")
  })
})
