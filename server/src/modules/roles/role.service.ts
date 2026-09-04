import { getPrisma } from "../../lib/database.js"
import { ASSIGNABLE_ROLE_NAMES } from "../../permissions/permissions.js"
import type { RoleListResult } from "./role.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

/**
 * Returns the roles a tenant administrator may assign to users within their
 * own tenant. Platform-level roles (SUPER_ADMIN) are deliberately excluded.
 */
export async function listAssignableRoles(): Promise<RoleListResult> {
  const prisma = await requirePrisma()
  const roles = await prisma.role.findMany({
    where: { name: { in: [...ASSIGNABLE_ROLE_NAMES] } },
    orderBy: { name: "asc" },
  })
  return roles.map((role) => ({ id: role.id, name: role.name, description: role.description }))
}
