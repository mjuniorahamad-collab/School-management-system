// Pure planning logic for the additive permission reconciliation command
// (see reconcile-permissions.ts). No I/O, no Prisma, no side effects — it can be
// unit tested without a database or a network.
//
// It diffs a database snapshot against the canonical catalogue in
// server/src/permissions/permissions.ts and reports exactly what an additive
// reconciliation would insert. Existing rows are never rewritten: conflicting
// stored metadata, a missing catalogue role, or a grant referencing an unknown
// id fails the plan closed instead of being silently "repaired".

import {
  PERMISSION_CODES,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  describePermission,
  parsePermissionCode,
  type PermissionCode,
  type RoleName,
} from "../src/permissions/permissions.js"

export interface DbPermissionRow {
  id: string
  code: string
  resource: string
  action: string
  description: string | null
}

export interface DbRoleRow {
  id: string
  name: string
}

export interface DbGrantRow {
  id: string
  roleId: string
  permissionId: string
}

export interface DatabaseSnapshot {
  permissions: readonly DbPermissionRow[]
  roles: readonly DbRoleRow[]
  grants: readonly DbGrantRow[]
}

export interface PermissionInsert {
  code: PermissionCode
  resource: string
  action: string
  description: string
}

export interface GrantInsert {
  roleName: RoleName
  code: string
}

export interface MetadataConflict {
  code: PermissionCode
  dbResource: string
  dbAction: string
  expectedResource: string
  expectedAction: string
}

export interface DescriptionDrift {
  code: PermissionCode
  dbDescription: string | null
  expectedDescription: string
}

export interface UnknownGrantReference {
  grantId: string
  roleId: string
  permissionId: string
  reason: "unknown role" | "unknown permission"
}

export interface ReconcilePlan {
  missingPermissions: PermissionInsert[]
  missingGrants: GrantInsert[]
  metadataConflicts: MetadataConflict[]
  descriptionDrift: DescriptionDrift[]
  missingRoles: RoleName[]
  extraPermissions: string[]
  extraGrants: { roleName: string; code: string }[]
  unknownGrantReferences: UnknownGrantReference[]
  catalogErrors: string[]
  blockers: string[]
  canApply: boolean
}

const CATALOG_CODES = new Set<string>(PERMISSION_CODES)

const ROLE_LIST = Object.keys(ROLE_NAMES) as RoleName[]

export const CATALOG_COUNTS = {
  permissions: PERMISSION_CODES.length,
  roles: ROLE_LIST.length,
  grants: ROLE_LIST.reduce((total, roleName) => total + ROLE_PERMISSIONS[roleName].length, 0),
} as const

function isCatalogRole(name: string): name is RoleName {
  return (ROLE_LIST as readonly string[]).includes(name)
}

export function buildReconcilePlan(db: DatabaseSnapshot): ReconcilePlan {
  const roleIdsByName = new Map<RoleName, string>()
  const roleIdToName = new Map<string, string>()
  for (const role of db.roles) {
    roleIdToName.set(role.id, role.name)
    if (isCatalogRole(role.name) && !roleIdsByName.has(role.name)) roleIdsByName.set(role.name, role.id)
  }
  const missingRoles = ROLE_LIST.filter((name) => !roleIdsByName.has(name))

  const permissionByCode = new Map<string, DbPermissionRow>()
  const permissionById = new Map<string, DbPermissionRow>()
  for (const permission of db.permissions) {
    if (!permissionByCode.has(permission.code)) permissionByCode.set(permission.code, permission)
    permissionById.set(permission.id, permission)
  }

  const missingPermissions: PermissionInsert[] = []
  const metadataConflicts: MetadataConflict[] = []
  const descriptionDrift: DescriptionDrift[] = []
  for (const code of PERMISSION_CODES) {
    const row = permissionByCode.get(code)
    if (row === undefined) {
      const { resource, action } = parsePermissionCode(code)
      missingPermissions.push({ code, resource, action, description: describePermission(code) })
      continue
    }
    const expected = parsePermissionCode(code)
    if (row.resource !== expected.resource || row.action !== expected.action) {
      metadataConflicts.push({
        code,
        dbResource: row.resource,
        dbAction: row.action,
        expectedResource: expected.resource,
        expectedAction: expected.action,
      })
    }
    const expectedDescription = describePermission(code)
    if ((row.description ?? "") !== expectedDescription) {
      descriptionDrift.push({ code, dbDescription: row.description, expectedDescription })
    }
  }

  const extraPermissions = db.permissions
    .filter((permission) => !CATALOG_CODES.has(permission.code))
    .map((permission) => permission.code)
    .sort()

  const existingPairs = new Set<string>()
  const unknownGrantReferences: UnknownGrantReference[] = []
  for (const grant of db.grants) {
    if (!roleIdToName.has(grant.roleId)) {
      unknownGrantReferences.push({
        grantId: grant.id,
        roleId: grant.roleId,
        permissionId: grant.permissionId,
        reason: "unknown role",
      })
      continue
    }
    if (!permissionById.has(grant.permissionId)) {
      unknownGrantReferences.push({
        grantId: grant.id,
        roleId: grant.roleId,
        permissionId: grant.permissionId,
        reason: "unknown permission",
      })
      continue
    }
    existingPairs.add(`${grant.roleId}:${grant.permissionId}`)
  }

  const catalogErrors: string[] = []
  const missingGrants: GrantInsert[] = []
  const plannedPairs = new Set<string>()
  for (const roleName of ROLE_LIST) {
    for (const code of ROLE_PERMISSIONS[roleName]) {
      if (!CATALOG_CODES.has(code)) {
        catalogErrors.push(`${roleName} references a code that is not in PERMISSION_CODES: ${code}`)
        continue
      }
      const pair = `${roleName}:${code}`
      if (plannedPairs.has(pair)) continue
      const roleId = roleIdsByName.get(roleName)
      const permission = permissionByCode.get(code)
      if (roleId !== undefined && permission !== undefined && existingPairs.has(`${roleId}:${permission.id}`)) continue
      plannedPairs.add(pair)
      missingGrants.push({ roleName, code })
    }
  }

  const extraGrants: { roleName: string; code: string }[] = []
  for (const grant of db.grants) {
    const roleName = roleIdToName.get(grant.roleId)
    const permission = permissionById.get(grant.permissionId)
    if (roleName === undefined || permission === undefined) continue
    const catalogGrant =
      isCatalogRole(roleName) &&
      CATALOG_CODES.has(permission.code) &&
      (ROLE_PERMISSIONS[roleName] as readonly string[]).includes(permission.code)
    if (catalogGrant) continue
    extraGrants.push({ roleName, code: permission.code })
  }
  extraGrants.sort((a, b) => a.roleName.localeCompare(b.roleName) || a.code.localeCompare(b.code))

  const blockers: string[] = []
  for (const conflict of metadataConflicts) {
    blockers.push(
      `${conflict.code} is stored as resource=${conflict.dbResource} action=${conflict.dbAction} but the ` +
        `catalogue requires resource=${conflict.expectedResource} action=${conflict.expectedAction} — ` +
        "existing metadata is never overwritten",
    )
  }
  if (missingRoles.length > 0) {
    blockers.push(`missing roles: ${missingRoles.join(", ")} — every catalogue role must exist before applying`)
  }
  for (const reference of unknownGrantReferences) {
    blockers.push(
      `grant ${reference.grantId} references an unknown ${reference.reason} ` +
        `(roleId=${reference.roleId}, permissionId=${reference.permissionId}) — grants are never repaired or deleted`,
    )
  }
  for (const error of catalogErrors) blockers.push(error)

  return {
    missingPermissions,
    missingGrants,
    metadataConflicts,
    descriptionDrift,
    missingRoles,
    extraPermissions,
    extraGrants,
    unknownGrantReferences,
    catalogErrors,
    blockers,
    canApply: blockers.length === 0,
  }
}

function listOrNone(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ")
}

export function formatReconcilePlan(plan: ReconcilePlan): string[] {
  const lines: string[] = []
  lines.push(`  missing permissions (${plan.missingPermissions.length}): ${listOrNone(plan.missingPermissions.map((p) => p.code))}`)
  if (plan.missingGrants.length === 0) {
    lines.push("  missing role grants (0): none")
  } else {
    lines.push(`  missing role grants (${plan.missingGrants.length}):`)
    for (const grant of plan.missingGrants) lines.push(`    - ${grant.roleName} ${grant.code}`)
  }
  lines.push(`  metadata conflicts (${plan.metadataConflicts.length}): ${listOrNone(plan.metadataConflicts.map((c) => c.code))}`)
  lines.push(`  description drift (${plan.descriptionDrift.length}): ${listOrNone(plan.descriptionDrift.map((d) => d.code))}`)
  lines.push(`  missing catalogue roles (${plan.missingRoles.length}): ${listOrNone(plan.missingRoles)}`)
  lines.push(`  permissions outside the catalogue (${plan.extraPermissions.length}): preserved — ${listOrNone(plan.extraPermissions)}`)
  lines.push(
    `  grants outside the catalogue (${plan.extraGrants.length}): preserved — ${listOrNone(plan.extraGrants.map((g) => `${g.roleName} ${g.code}`))}`,
  )
  lines.push(`  unknown grant references (${plan.unknownGrantReferences.length}): ${listOrNone(plan.unknownGrantReferences.map((r) => r.grantId))}`)
  if (plan.catalogErrors.length > 0) lines.push(`  catalogue errors (${plan.catalogErrors.length}): ${listOrNone(plan.catalogErrors)}`)

  lines.push("")
  if (!plan.canApply) {
    lines.push(`RESULT: BLOCKED — --apply would be refused; ${plan.blockers.length} blocker(s):`)
    for (const blocker of plan.blockers) lines.push(`    - ${blocker}`)
    return lines
  }
  if (plan.missingPermissions.length === 0 && plan.missingGrants.length === 0) {
    lines.push("RESULT: ALREADY RECONCILED — the database matches the catalogue; nothing to insert.")
    return lines
  }
  lines.push(
    `RESULT: SAFE TO APPLY — ${plan.missingPermissions.length} permission row(s) and ` +
      `${plan.missingGrants.length} grant row(s) would be inserted additively.`,
  )
  return lines
}
