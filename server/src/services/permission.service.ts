import { getPrisma } from "../lib/database.js"

export interface ResolvedPrincipal {
  roles: string[]
  permissions: Set<string>
}

/** Resolves a user's roles and flattened permission codes from the database. */
export async function resolveUserPermissions(userId: string): Promise<ResolvedPrincipal> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")

  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  })

  const roles = userRoles.map((userRole) => userRole.role.name)
  const permissions = new Set<string>()
  for (const userRole of userRoles) {
    for (const rolePermission of userRole.role.rolePermissions) {
      permissions.add(rolePermission.permission.code)
    }
  }

  return { roles, permissions }
}