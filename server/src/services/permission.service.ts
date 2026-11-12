import type { Prisma } from "@prisma/client"
import { getPrisma } from "../lib/database.js"
import { SUPER_ADMIN_ROLE } from "../permissions/permissions.js"

export interface ResolvedPrincipal {
  roles: string[]
  permissions: Set<string>
}

type PermissionDbClient = Pick<
  Prisma.TransactionClient,
  "role" | "tenantMembershipPermission"
>

/** Resolves a single role's name and flattened permission codes. */
export async function resolveRolePermissions(
  roleId: string,
  client?: PermissionDbClient,
): Promise<ResolvedPrincipal> {
  const prisma = client ?? (await getPrisma())
  if (!prisma) throw new Error("Database is not configured")

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { rolePermissions: { include: { permission: true } } },
  })
  if (!role) return { roles: [], permissions: new Set() }

  const permissions = new Set<string>()
  for (const rolePermission of role.rolePermissions) {
    permissions.add(rolePermission.permission.code)
  }
  return { roles: [role.name], permissions }
}

/** Resolves effective permissions for a specific membership: (role defaults union ALLOW) - DENY with DENY precedence. */
export async function resolveEffectivePermissions(
  membershipId: string,
  roleId: string,
  client?: PermissionDbClient,
): Promise<ResolvedPrincipal> {
  const prisma = client ?? (await getPrisma())
  if (!prisma) throw new Error("Database is not configured")

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { rolePermissions: { include: { permission: true } } },
  })
  if (!role) return { roles: [], permissions: new Set() }

  const permissions = new Set<string>()
  for (const rolePermission of role.rolePermissions) {
    permissions.add(rolePermission.permission.code)
  }

  // If role is SUPER_ADMIN, bypass remains unchanged - overrides do not apply
  if (role.name === SUPER_ADMIN_ROLE) {
    return { roles: [role.name], permissions }
  }

  const overrides = await prisma.tenantMembershipPermission.findMany({
    where: { membershipId, revokedAt: null },
    include: { permission: true },
  })

  for (const override of overrides) {
    if (override.revokedAt != null) continue
    if (override.effect === "ALLOW") {
      permissions.add(override.permission.code)
    }
  }
  for (const override of overrides) {
    if (override.revokedAt != null) continue
    if (override.effect === "DENY") {
      permissions.delete(override.permission.code)
    }
  }

  return { roles: [role.name], permissions }
}
