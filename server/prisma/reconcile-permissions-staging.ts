import path from "node:path"
import { fileURLToPath } from "node:url"
import type { PrismaClient as PrismaClientType } from "@prisma/client"
import {
  CATALOG_COUNTS,
  buildReconcilePlan,
  formatReconcilePlan,
  type ReconcilePlan,
} from "./permission-reconcile.js"
import {
  applyAdditiveReconcile,
  loadReconcileSnapshot,
} from "./permission-reconcile-db.js"
import {
  STAGING_PROJECT_LABEL,
  parseStagingTargetArgs,
  resolveStagingTarget,
  type StagingTarget,
  type StagingTargetArgs,
} from "../src/lib/staging-target.js"

type ReconcileMode = "check" | "apply"

export interface StagingReconcileArgs {
  mode: ReconcileMode
  target: StagingTargetArgs
}

const MODE_FLAGS = new Set(["--check", "--apply"])

export function isDirectExecution(
  entryPath: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (entryPath === undefined || entryPath.trim() === "") return false
  try {
    const entry = path.resolve(entryPath)
    const current = fileURLToPath(moduleUrl)
    return process.platform === "win32"
      ? entry.toLowerCase() === current.toLowerCase()
      : entry === current
  } catch {
    return false
  }
}

export function parseStagingReconcileArgs(argv: readonly string[]): StagingReconcileArgs {
  const modeFlags = argv.filter((arg) => MODE_FLAGS.has(arg))
  if (modeFlags.length !== 1) {
    throw new Error("expected exactly one of --check (read-only report) or --apply (additive write)")
  }
  const mode: ReconcileMode = modeFlags[0] === "--apply" ? "apply" : "check"
  const targetArgs = parseStagingTargetArgs(argv.filter((arg) => !MODE_FLAGS.has(arg)))
  return { mode, target: targetArgs }
}

function sanitize(message: string): string {
  return message.replace(/:\/\/[^\s@"']*@/g, "://***:***@")
}

function hasOutstandingWork(plan: ReconcilePlan): boolean {
  return (
    !plan.canApply ||
    plan.missingRoles.length > 0 ||
    plan.missingPermissions.length > 0 ||
    plan.missingGrants.length > 0
  )
}

function printCheck(target: StagingTarget, plan: ReconcilePlan): void {
  console.log(`target: ${target.display} (project: ${STAGING_PROJECT_LABEL})`)
  console.log(
    `catalogue: ${CATALOG_COUNTS.permissions} permission(s), ${CATALOG_COUNTS.roles} role(s), ` +
      `${CATALOG_COUNTS.grants} grant(s)`,
  )
  console.log(`blockers: ${plan.blockers.length}`)
  for (const line of formatReconcilePlan(plan)) console.log(line)
}

function printMissingRequiredRoles(plan: ReconcilePlan): boolean {
  const missing = plan.missingRoles.filter((role) => role === "PRINCIPAL" || role === "TEACHER")
  if (missing.length === 0) return false
  console.error(
    `BLOCKED: required catalogue role(s) missing: ${missing.join(", ")}. ` +
      "This command never creates roles; a separate role-creation step is required first.",
  )
  return true
}

async function readPlan(prisma: PrismaClientType): Promise<ReconcilePlan> {
  return buildReconcilePlan(await loadReconcileSnapshot(prisma))
}

async function assertTargetIdentity(prisma: PrismaClientType, target: StagingTarget): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ database: string; port: number | null }>>`
    SELECT current_database() AS "database", inet_server_port() AS "port"
  `
  const identity = rows[0]
  if (identity === undefined) {
    throw new Error("identity check failed: the database returned no identity row.")
  }
  if (identity.database !== target.database) {
    throw new Error(
      `identity check failed: connected database is ${identity.database}; expected ${target.database}.`,
    )
  }
  if (identity.port === null || String(identity.port) !== target.port) {
    throw new Error(
      `identity check failed: connected port is ${identity.port ?? "unknown"}; expected ${target.port}.`,
    )
  }
}

async function main(): Promise<void> {
  const args = parseStagingReconcileArgs(process.argv.slice(2))
  const target = resolveStagingTarget(process.env, args.target)

  process.env.DATABASE_URL = target.raw

  console.log(`permission reconciliation — mode: ${args.mode}`)

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient({ datasourceUrl: target.raw })
  try {
    await assertTargetIdentity(prisma, target)
    const plan = await readPlan(prisma)
    printCheck(target, plan)

    if (printMissingRequiredRoles(plan)) {
      process.exitCode = 1
      return
    }

    if (args.mode === "check") {
      process.exitCode = hasOutstandingWork(plan) ? 1 : 0
      return
    }

    if (!plan.canApply) {
      process.exitCode = 1
      return
    }

    const applied = await applyAdditiveReconcile(prisma, plan)
    console.log(
      `applied: inserted ${applied.permissions} permission row(s) and ` +
        `${applied.grants} grant row(s) additively.`,
    )

    const verify = await readPlan(prisma)
    console.log("re-check after apply:")
    printCheck(target, verify)

    if (hasOutstandingWork(verify)) {
      printMissingRequiredRoles(verify)
      console.log("verification FAILED — differences remain after applying.")
      process.exitCode = 1
      return
    }
    console.log(
      "verified: the staging database now matches the catalogue " +
        "(0 missing permissions, 0 missing grants).",
    )
  } finally {
    await prisma.$disconnect()
  }
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    console.error(sanitize(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  })
}
