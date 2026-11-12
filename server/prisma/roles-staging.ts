import path from "node:path"
import { fileURLToPath } from "node:url"
import type { PrismaClient as PrismaClientType } from "@prisma/client"
import {
  ROLE_DESCRIPTIONS,
  ROLE_NAMES,
  type RoleName,
} from "../src/permissions/permissions.js"
import {
  STAGING_PROJECT_LABEL,
  parseStagingTargetArgs,
  resolveStagingTarget,
  type StagingTarget,
  type StagingTargetArgs,
} from "../src/lib/staging-target.js"

type Mode = "check" | "apply"

export interface StagingRoleArgs {
  mode: Mode
  target: StagingTargetArgs
}

const MODE_FLAGS = new Set(["--check", "--apply"])
const ROLE_LIST = Object.keys(ROLE_NAMES) as RoleName[]

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

export function parseStagingRoleArgs(argv: readonly string[]): StagingRoleArgs {
  const modeFlags = argv.filter((arg) => MODE_FLAGS.has(arg))
  if (modeFlags.length !== 1) {
    throw new Error("expected exactly one of --check (read-only report) or --apply (create missing roles)")
  }
  const mode: Mode = modeFlags[0] === "--apply" ? "apply" : "check"
  const targetArgs = parseStagingTargetArgs(argv.filter((arg) => !MODE_FLAGS.has(arg)))
  return { mode, target: targetArgs }
}

function sanitize(message: string): string {
  return message.replace(/:\/\/[^\s@"']*@/g, "://***:***@")
}

function printRoles(existing: readonly string[]): RoleName[] {
  const present = new Set(existing)
  const missing = ROLE_LIST.filter((name) => !present.has(name))
  for (const name of ROLE_LIST) {
    console.log(`${name}: ${present.has(name) ? "present" : "missing"}`)
  }
  console.log(
    `roles: ${ROLE_LIST.length} canonical, ${ROLE_LIST.length - missing.length} present, ` +
      `${missing.length} missing`,
  )
  return missing
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

async function readRoleNames(prisma: PrismaClientType): Promise<string[]> {
  const rows = await prisma.role.findMany({ select: { name: true } })
  return rows.map((role) => role.name)
}

async function applyMissingRoles(prisma: PrismaClientType): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const existing = new Set(
        (await tx.role.findMany({ select: { name: true } })).map((role) => role.name),
      )
      const missing = ROLE_LIST.filter((name) => !existing.has(name))
      for (const name of missing) {
        await tx.role.create({ data: { name, description: ROLE_DESCRIPTIONS[name] } })
      }
      return missing.length
    },
    { maxWait: 15_000, timeout: 60_000 },
  )
}

async function main(): Promise<void> {
  const args = parseStagingRoleArgs(process.argv.slice(2))
  const target = resolveStagingTarget(process.env, args.target)

  process.env.DATABASE_URL = target.raw

  console.log(`role creation — mode: ${args.mode}`)

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient({ datasourceUrl: target.raw })
  try {
    await assertTargetIdentity(prisma, target)
    console.log(`target: ${target.display} (project: ${STAGING_PROJECT_LABEL})`)

    if (args.mode === "check") {
      const missing = printRoles(await readRoleNames(prisma))
      process.exitCode = missing.length === 0 ? 0 : 1
      return
    }

    const created = await applyMissingRoles(prisma)
    console.log(`applied: created ${created} role(s) additively.`)

    console.log("re-check after apply:")
    const remaining = printRoles(await readRoleNames(prisma))
    if (remaining.length > 0) {
      console.log("verification FAILED — canonical roles remain missing.")
      process.exitCode = 1
      return
    }
    console.log("verified: all canonical roles are present.")
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
