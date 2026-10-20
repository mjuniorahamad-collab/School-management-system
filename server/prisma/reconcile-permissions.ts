// Additive permission reconciliation command.
//
//   npm run permissions:reconcile -- --check   read-only report, never writes
//   npm run permissions:reconcile -- --apply   insert the missing rows additively
//
// Exactly one mode flag is required. --check exits 0 only when the database
// already matches the catalogue; pending differences or blockers exit 1.
//
// The command targets the production database on purpose, so it verifies the
// endpoint identity first (production-target-guard.ts) and refuses to run when
// the target, its TLS parameters or the environment are not exactly as
// expected. It only ever INSERTS Permission rows and RolePermission rows that
// the canonical catalogue declares and the database lacks: existing rows,
// custom permissions, custom grants and every other table are left untouched.
// Both modes fail closed on a metadata conflict, a missing role or a grant that
// references an unknown id.
//
// The Prisma client module loads .env as an import side effect, so it is
// imported dynamically *after* the guard has run. The guard must see the
// environment exactly as the shell left it, otherwise an .env merge would be
// indistinguishable from a shell-level DATABASE_URL override — and that check
// is what stops this command from being silently pointed at the wrong database.

import type { Prisma } from "@prisma/client"
import { CATALOG_COUNTS, buildReconcilePlan, formatReconcilePlan, type DatabaseSnapshot } from "./permission-reconcile.js"
import { assertProductionTarget } from "./production-target-guard.js"

type Mode = "check" | "apply"

const MODE_FLAGS = ["--check", "--apply"] as const

function parseMode(argv: readonly string[]): Mode {
  const positional = argv.filter((arg) => !arg.startsWith("--"))
  const flags = argv.filter((arg) => arg.startsWith("--"))
  const unknown = flags.filter((flag) => !MODE_FLAGS.some((mode) => mode === flag))
  const expected = "expected exactly one of --check (read-only report) or --apply (additive write)"
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(", ")}; ${expected}`)
  if (positional.length > 0) throw new Error(`unexpected value(s): ${positional.join(", ")}; ${expected}`)
  if (flags.length !== 1) throw new Error(`received ${flags.length} mode flags; ${expected}`)
  const flag = flags[0]
  if (flag === undefined) throw new Error(`no mode flag received; ${expected}`)
  return flag === "--apply" ? "apply" : "check"
}

async function loadSnapshot(client: Prisma.TransactionClient): Promise<DatabaseSnapshot> {
  const [permissions, roles, grants] = await Promise.all([
    client.permission.findMany({ select: { id: true, code: true, resource: true, action: true, description: true } }),
    client.role.findMany({ select: { id: true, name: true } }),
    client.rolePermission.findMany({ select: { id: true, roleId: true, permissionId: true } }),
  ])
  return { permissions, roles, grants }
}

function print(lines: readonly string[]): void {
  for (const line of lines) console.log(line)
}

function sanitize(message: string): string {
  return message.replace(/:\/\/[^\s@"']*@/g, "://***:***@")
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2))
  const shellEnv: Record<string, string | undefined> = { ...process.env }

  try {
    process.loadEnvFile()
  } catch {
    // A missing .env is reported by the target guard below, never silently ignored.
  }

  const target = assertProductionTarget({
    shellEnv,
    databaseUrl: process.env.DATABASE_URL,
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    productionDatabaseHost: process.env.PRODUCTION_DATABASE_HOST,
  })

  console.log(`permission reconciliation — mode: ${mode}`)
  console.log(`target: ${target.displayUrl}`)
  console.log("")

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  try {
    const plan = buildReconcilePlan(await loadSnapshot(prisma))
    console.log(`catalogue: ${CATALOG_COUNTS.permissions} permission(s), ${CATALOG_COUNTS.roles} role(s), ${CATALOG_COUNTS.grants} grant(s)`)
    print(formatReconcilePlan(plan))

    if (mode === "check") {
      const reconciled = plan.canApply && plan.missingPermissions.length === 0 && plan.missingGrants.length === 0
      process.exitCode = reconciled ? 0 : 1
      return
    }

    if (!plan.canApply) {
      process.exitCode = 1
      return
    }
    if (plan.missingPermissions.length === 0 && plan.missingGrants.length === 0) {
      console.log("nothing to apply.")
      return
    }

    const applied = await prisma.$transaction(
      async (tx) => {
        const snapshot = await loadSnapshot(tx)
        const inner = buildReconcilePlan(snapshot)
        if (!inner.canApply) {
          throw new Error(`target state changed while applying: ${inner.blockers.join("; ")}`)
        }
        const roleIds = new Map(snapshot.roles.map((role) => [role.name, role.id]))
        const permissionIds = new Map(snapshot.permissions.map((permission) => [permission.code, permission.id]))

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

    console.log(`applied: inserted ${applied.permissions} permission row(s) and ${applied.grants} grant row(s) additively.`)

    const verify = buildReconcilePlan(await loadSnapshot(prisma))
    if (verify.canApply && verify.missingPermissions.length === 0 && verify.missingGrants.length === 0) {
      console.log("verified: the database now matches the catalogue (0 missing permissions, 0 missing grants).")
      return
    }
    console.log("verification FAILED — differences remain after applying:")
    print(formatReconcilePlan(verify))
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(sanitize(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})
