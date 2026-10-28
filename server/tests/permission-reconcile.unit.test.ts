import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  PERMISSION_CODES,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  describePermission,
  parsePermissionCode,
  type PermissionCode,
  type RoleName,
} from "../src/permissions/permissions.js"
import {
  buildReconcilePlan,
  formatReconcilePlan,
  type DatabaseSnapshot,
  type DbGrantRow,
  type DbPermissionRow,
  type DbRoleRow,
  type ReconcilePlan,
} from "../prisma/permission-reconcile.js"

// Unit coverage for the additive permission reconciliation planner.
//
// Every case is built from the real catalogue, so the assertions stay correct
// if the catalogue itself changes: expected inserts are derived from
// PERMISSION_CODES / ROLE_PERMISSIONS at runtime instead of being pinned to a
// count that a future catalogue edit would invalidate.

const ROLE_LIST = Object.keys(ROLE_NAMES) as RoleName[]

function reconciledSnapshot(): DatabaseSnapshot {
  const roles: DbRoleRow[] = ROLE_LIST.map((name) => ({ id: `role:${name}`, name }))
  const permissions: DbPermissionRow[] = PERMISSION_CODES.map((code) => {
    const { resource, action } = parsePermissionCode(code)
    return { id: `perm:${code}`, code, resource, action, description: describePermission(code) }
  })
  const grants: DbGrantRow[] = []
  for (const roleName of ROLE_LIST) {
    for (const code of ROLE_PERMISSIONS[roleName]) {
      grants.push({ id: `grant:${roleName}:${code}`, roleId: `role:${roleName}`, permissionId: `perm:${code}` })
    }
  }
  return { permissions, roles, grants }
}

function withoutPermission(snapshot: DatabaseSnapshot, code: string): DatabaseSnapshot {
  const permissionId = `perm:${code}`
  return {
    permissions: snapshot.permissions.filter((permission) => permission.id !== permissionId),
    roles: [...snapshot.roles],
    grants: snapshot.grants.filter((grant) => grant.permissionId !== permissionId),
  }
}

function withoutGrant(snapshot: DatabaseSnapshot, roleName: string, code: string): DatabaseSnapshot {
  const grantId = `grant:${roleName}:${code}`
  return {
    permissions: [...snapshot.permissions],
    roles: [...snapshot.roles],
    grants: snapshot.grants.filter((grant) => grant.id !== grantId),
  }
}

function withoutRole(snapshot: DatabaseSnapshot, roleName: string): DatabaseSnapshot {
  const roleId = `role:${roleName}`
  return {
    permissions: [...snapshot.permissions],
    roles: snapshot.roles.filter((role) => role.id !== roleId),
    grants: snapshot.grants.filter((grant) => grant.roleId !== roleId),
  }
}

/** Mirrors the apply step: insert exactly what the plan reports, change nothing else. */
function applyPlanInMemory(snapshot: DatabaseSnapshot, plan: ReconcilePlan): DatabaseSnapshot {
  const permissions: DbPermissionRow[] = snapshot.permissions.map((permission) => ({ ...permission }))
  const roles: DbRoleRow[] = snapshot.roles.map((role) => ({ ...role }))
  const grants: DbGrantRow[] = snapshot.grants.map((grant) => ({ ...grant }))
  for (const permission of plan.missingPermissions) {
    permissions.push({ id: `inserted:${permission.code}`, ...permission })
  }
  const roleIds = new Map(roles.map((role) => [role.name, role.id]))
  const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]))
  for (const grant of plan.missingGrants) {
    const roleId = roleIds.get(grant.roleName)
    const permissionId = permissionIds.get(grant.code)
    if (roleId === undefined || permissionId === undefined) continue
    grants.push({ id: `inserted:${grant.roleName}:${grant.code}`, roleId, permissionId })
  }
  return { permissions, roles, grants }
}

function grantsFor(codes: readonly string[]): Set<string> {
  const expected = new Set<string>()
  for (const code of codes) {
    for (const roleName of ROLE_LIST) {
      if ((ROLE_PERMISSIONS[roleName] as readonly string[]).includes(code)) expected.add(`${roleName} ${code}`)
    }
  }
  return expected
}

describe("buildReconcilePlan", () => {
  it("reports a fully reconciled database as needing no inserts", () => {
    const plan = buildReconcilePlan(reconciledSnapshot())
    expect(plan.missingPermissions).toEqual([])
    expect(plan.missingGrants).toEqual([])
    expect(plan.blockers).toEqual([])
    expect(plan.canApply).toBe(true)
    expect(formatReconcilePlan(plan).join("\n")).toContain("ALREADY RECONCILED")
  })

  it("detects missing permission codes and derives their grants from the catalogue", () => {
    const removed: PermissionCode[] = ["calendar:manage", "report-cards:view"]
    let snapshot = reconciledSnapshot()
    for (const code of removed) snapshot = withoutPermission(snapshot, code)

    const plan = buildReconcilePlan(snapshot)
    expect(plan.missingPermissions.map((permission) => permission.code).sort()).toEqual([...removed].sort())
    expect(plan.metadataConflicts).toEqual([])
    expect(plan.canApply).toBe(true)

    const calendar = plan.missingPermissions.find((permission) => permission.code === "calendar:manage")
    expect(calendar).toEqual({
      code: "calendar:manage",
      resource: "calendar",
      action: "manage",
      description: describePermission("calendar:manage"),
    })

    const expected = grantsFor(removed)
    expect(expected.size).toBeGreaterThan(0)
    expect(new Set(plan.missingGrants.map((grant) => `${grant.roleName} ${grant.code}`))).toEqual(expected)
    expect(plan.missingGrants).toHaveLength(expected.size)
  })

  it("detects a single missing role grant without touching permissions", () => {
    const snapshot = withoutGrant(reconciledSnapshot(), "TEACHER", "report-cards:view")
    const plan = buildReconcilePlan(snapshot)
    expect(plan.missingPermissions).toEqual([])
    expect(plan.missingGrants).toEqual([{ roleName: "TEACHER", code: "report-cards:view" }])
    expect(plan.blockers).toEqual([])
    expect(plan.canApply).toBe(true)
    expect(formatReconcilePlan(plan).join("\n")).toContain("SAFE TO APPLY")
  })

  it("is additive and idempotent: applying the plan yields an empty follow-up plan", () => {
    const before = withoutGrant(withoutPermission(reconciledSnapshot(), "calendar:manage"), "PRINCIPAL", "results:view")
    const plan = buildReconcilePlan(before)
    expect(plan.canApply).toBe(true)

    const applied = applyPlanInMemory(before, plan)
    expect(applied.permissions.length).toBe(before.permissions.length + plan.missingPermissions.length)
    expect(applied.grants.length).toBe(before.grants.length + plan.missingGrants.length)
    for (const permission of before.permissions) {
      expect(applied.permissions.some((row) => row.id === permission.id)).toBe(true)
    }
    for (const grant of before.grants) {
      expect(applied.grants.some((row) => row.id === grant.id)).toBe(true)
    }

    const followUp = buildReconcilePlan(applied)
    expect(followUp.missingPermissions).toEqual([])
    expect(followUp.missingGrants).toEqual([])
    expect(followUp.blockers).toEqual([])
    expect(followUp.canApply).toBe(true)
  })

  it("preserves permissions and grants outside the catalogue", () => {
    const base = reconciledSnapshot()
    const snapshot: DatabaseSnapshot = {
      permissions: [
        ...base.permissions,
        { id: "perm:custom:alpha", code: "custom:alpha", resource: "custom", action: "alpha", description: "Custom capability" },
      ],
      roles: [...base.roles, { id: "role:GUEST", name: "GUEST" }],
      grants: [
        ...base.grants,
        { id: "grant:SUPER_ADMIN:custom:alpha", roleId: "role:SUPER_ADMIN", permissionId: "perm:custom:alpha" },
        { id: "grant:GUEST:dashboard:view", roleId: "role:GUEST", permissionId: "perm:dashboard:view" },
      ],
    }

    const plan = buildReconcilePlan(snapshot)
    expect(plan.canApply).toBe(true)
    expect(plan.missingRoles).toEqual([])
    expect(plan.extraPermissions).toEqual(["custom:alpha"])
    expect(plan.extraGrants).toEqual([
      { roleName: "GUEST", code: "dashboard:view" },
      { roleName: "SUPER_ADMIN", code: "custom:alpha" },
    ])

    const applied = applyPlanInMemory(snapshot, plan)
    expect(applied.permissions.some((row) => row.code === "custom:alpha")).toBe(true)
    expect(applied.grants.some((row) => row.id === "grant:SUPER_ADMIN:custom:alpha")).toBe(true)

    const followUp = buildReconcilePlan(applied)
    expect(followUp.missingPermissions).toEqual([])
    expect(followUp.extraPermissions).toEqual(["custom:alpha"])
    expect(followUp.extraGrants).toHaveLength(2)
  })

  it("fails closed when stored metadata conflicts with the catalogue", () => {
    const base = reconciledSnapshot()
    const snapshot: DatabaseSnapshot = {
      permissions: base.permissions.map((permission) =>
        permission.code === "students:view" ? { ...permission, resource: "pupils" } : permission,
      ),
      roles: [...base.roles],
      grants: [...base.grants],
    }

    const plan = buildReconcilePlan(snapshot)
    expect(plan.canApply).toBe(false)
    expect(plan.metadataConflicts).toEqual([
      { code: "students:view", dbResource: "pupils", dbAction: "view", expectedResource: "students", expectedAction: "view" },
    ])
    expect(plan.missingPermissions).toEqual([])
    expect(plan.blockers.join("\n")).toContain("students:view")
    expect(formatReconcilePlan(plan).join("\n")).toContain("BLOCKED")
  })

  it("fails closed when a catalogue role is missing", () => {
    const plan = buildReconcilePlan(withoutRole(reconciledSnapshot(), "STUDENT"))
    expect(plan.canApply).toBe(false)
    expect(plan.missingRoles).toEqual(["STUDENT"])
    expect(plan.blockers.join("\n")).toContain("missing roles: STUDENT")
  })

  it("fails closed when a grant references an unknown id", () => {
    const base = reconciledSnapshot()
    const snapshot: DatabaseSnapshot = {
      permissions: [...base.permissions],
      roles: [...base.roles],
      grants: [
        ...base.grants,
        { id: "grant:ghost-permission", roleId: "role:SUPER_ADMIN", permissionId: "perm:does-not-exist" },
        { id: "grant:ghost-role", roleId: "role:does-not-exist", permissionId: "perm:dashboard:view" },
      ],
    }

    const plan = buildReconcilePlan(snapshot)
    expect(plan.canApply).toBe(false)
    expect(plan.unknownGrantReferences).toEqual([
      {
        grantId: "grant:ghost-permission",
        roleId: "role:SUPER_ADMIN",
        permissionId: "perm:does-not-exist",
        reason: "unknown permission",
      },
      {
        grantId: "grant:ghost-role",
        roleId: "role:does-not-exist",
        permissionId: "perm:dashboard:view",
        reason: "unknown role",
      },
    ])
    expect(plan.blockers).toHaveLength(2)
  })

  it("reports description drift without blocking or rewriting it", () => {
    const base = reconciledSnapshot()
    const snapshot: DatabaseSnapshot = {
      permissions: base.permissions.map((permission) =>
        permission.code === "fees:view" ? { ...permission, description: null } : permission,
      ),
      roles: [...base.roles],
      grants: [...base.grants],
    }

    const plan = buildReconcilePlan(snapshot)
    expect(plan.canApply).toBe(true)
    expect(plan.descriptionDrift.map((drift) => drift.code)).toEqual(["fees:view"])
    expect(plan.missingPermissions.map((permission) => permission.code)).not.toContain("fees:view")

    const applied = applyPlanInMemory(snapshot, plan)
    expect(applied.permissions.find((permission) => permission.code === "fees:view")?.description).toBeNull()
  })
})

describe("reconciliation source contract", () => {
  const readSource = (relative: string) => readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8")
  const script = readSource("prisma/reconcile-permissions.ts")
  const planner = readSource("prisma/permission-reconcile.ts")

  it("the apply path performs insert operations only", () => {
    expect(script).not.toMatch(/\.(deleteMany|deleteManyAndReturn|delete|updateMany|update|upsert|executeRaw)\s*\(/)
    expect(script).toMatch(/permission\.create\(/)
    expect(script).toMatch(/rolePermission\.createMany\(/)
  })

  it("the command requires an explicit mode and a verified target", () => {
    expect(script).toMatch(/parseMode\(/)
    expect(script).toMatch(/assertProductionTarget\(/)
    expect(script).toContain("productionDatabaseName: process.env.PRODUCTION_DATABASE_NAME")
    expect(script).toMatch(/--check/)
    expect(script).toMatch(/--apply/)
  })

  // The Prisma client module merges .env into process.env as an import side
  // effect. Loading it before the guard would make an .env merge look like a
  // shell-level DATABASE_URL override (permanently refusing every run) and
  // would also mean the client exists before the target has been proven.
  it("the database client is loaded only after the target guard has run", () => {
    const guard = readSource("prisma/production-target-guard.ts")
    expect(script).not.toMatch(/^import \{ PrismaClient \}/m)
    const guardCall = script.indexOf("assertProductionTarget({")
    const clientImport = script.indexOf('await import("@prisma/client")')
    expect(guardCall).toBeGreaterThan(-1)
    expect(clientImport).toBeGreaterThan(guardCall)
    expect(planner).not.toContain("loadEnvFile")
    expect(guard).not.toContain("loadEnvFile")
    expect(guard).not.toContain("@prisma/client")
  })

  it("the planner stays database-free", () => {
    expect(planner).not.toContain("@prisma/client")
    expect(planner).not.toMatch(/\.(deleteMany|delete|updateMany|update|upsert)\s*\(/)
  })
})


describe("parseReconcileArgs", () => {
  it("requires exactly one mode flag", async () => {
    const { parseReconcileArgs } = await import("../prisma/reconcile-permissions.js")
    expect(() => parseReconcileArgs([])).toThrow(/expected exactly one of --check/)
    expect(() => parseReconcileArgs(["--check", "--apply"])).toThrow(/received 2 mode flags/)
    expect(() => parseReconcileArgs(["--force"])).toThrow(/unknown argument/)
  })

  it("accepts confirmations with mode", async () => {
    const { parseReconcileArgs } = await import("../prisma/reconcile-permissions.js")
    expect(parseReconcileArgs(["--check", "--confirm-host", "example.com", "--confirm-port", "5432", "--confirm-database", "db"])).toMatchObject({
      mode: "check",
      confirmHost: "example.com",
      confirmPort: "5432",
      confirmDatabase: "db",
    })
    expect(parseReconcileArgs(["--apply"])).toMatchObject({ mode: "apply" })
  })
})