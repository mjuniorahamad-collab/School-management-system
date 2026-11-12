import type { Prisma, PrismaClient } from "@prisma/client"
import {
  buildReconcilePlan,
  type DatabaseSnapshot,
  type ReconcilePlan,
} from "./permission-reconcile.js"

export interface AdditiveReconcileResult {
  permissions: number
  grants: number
}

export async function loadReconcileSnapshot(
  client: Prisma.TransactionClient,
): Promise<DatabaseSnapshot> {
  const [permissions, roles, grants] = await Promise.all([
    client.permission.findMany({
      select: { id: true, code: true, resource: true, action: true, description: true },
    }),
    client.role.findMany({ select: { id: true, name: true } }),
    client.rolePermission.findMany({ select: { id: true, roleId: true, permissionId: true } }),
  ])
  return { permissions, roles, grants }
}

export async function applyAdditiveReconcile(
  prisma: PrismaClient,
  plan: ReconcilePlan,
): Promise<AdditiveReconcileResult> {
  if (!plan.canApply) {
    throw new Error(`refusing to apply a blocked reconciliation plan: ${plan.blockers.join("; ")}`)
  }
  if (plan.missingPermissions.length === 0 && plan.missingGrants.length === 0) {
    return { permissions: 0, grants: 0 }
  }

  return prisma.$transaction(
    async (tx) => {
      const snapshot = await loadReconcileSnapshot(tx)
      const inner = buildReconcilePlan(snapshot)
      if (!inner.canApply) {
        throw new Error(`target state changed while applying: ${inner.blockers.join("; ")}`)
      }
      const roleIds = new Map(snapshot.roles.map((role) => [role.name, role.id]))
      const permissionIds = new Map(
        snapshot.permissions.map((permission) => [permission.code, permission.id]),
      )

      for (const permission of inner.missingPermissions) {
        const created = await tx.permission.create({
          data: {
            code: permission.code,
            resource: permission.resource,
            action: permission.action,
            description: permission.description,
          },
        })
        permissionIds.set(created.code, created.id)
      }

      const grantRows: { roleId: string; permissionId: string }[] = []
      for (const grant of inner.missingGrants) {
        const roleId = roleIds.get(grant.roleName)
        const permissionId = permissionIds.get(grant.code)
        if (roleId === undefined || permissionId === undefined) {
          throw new Error(`cannot resolve catalogue entry for grant ${grant.roleName} ${grant.code}`)
        }
        grantRows.push({ roleId, permissionId })
      }
      if (grantRows.length > 0) {
        await tx.rolePermission.createMany({ data: grantRows, skipDuplicates: true })
      }
      return { permissions: inner.missingPermissions.length, grants: grantRows.length }
    },
    { maxWait: 15_000, timeout: 60_000 },
  )
}
