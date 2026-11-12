import path from "node:path"
import { fileURLToPath } from "node:url"
import type { PrismaClient as PrismaClientType } from "@prisma/client"
import { hashPassword } from "../auth/password.js"
import {
  STAGING_PROJECT_LABEL,
  parseStagingTargetArgs,
  resolveStagingTarget,
  type StagingTarget,
  type StagingTargetArgs,
} from "../lib/staging-target.js"
import {
  conflictLines,
  inspectFixture,
  isComplete,
  loadPreflight,
  printPlan,
  type FixturePlan,
  type FixtureRole,
  type FixtureSpec,
  type PreflightCatalog,
} from "./staging-fixture-plan.js"

// Reserved staging fixture identities.
// Principal: 00000000-0000-4000-8000-000000000101 / principal@stg-sms-it.invalid
// Teacher:   00000000-0000-4000-8000-000000000102 / teacher@stg-sms-it.invalid
const PRINCIPAL_PASSWORD_ENV = "STAGING_FIXTURE_PRINCIPAL_PASSWORD"
const TEACHER_PASSWORD_ENV = "STAGING_FIXTURE_TEACHER_PASSWORD"

const FIXTURE_SPEC: FixtureSpec = {
  school: { code: "STG-SMS-IT", name: "Staging Integration School" },
  principal: {
    id: "00000000-0000-4000-8000-000000000101",
    email: "principal@stg-sms-it.invalid",
    name: "Staging Principal",
  },
  teacher: {
    id: "00000000-0000-4000-8000-000000000102",
    email: "teacher@stg-sms-it.invalid",
    name: "Staging Teacher",
  },
  teacherProfile: {
    employeeId: "STG-TCH-0001",
    firstName: "Staging",
    lastName: "Teacher",
    email: "teacher@stg-sms-it.invalid",
    gender: "FEMALE",
    designation: "Teacher",
    joiningDate: new Date(Date.UTC(2024, 0, 15)),
  },
  requiredRoles: ["PRINCIPAL", "TEACHER"],
  requiredPermissions: [
    "membership-permissions:view",
    "membership-permissions:grant",
    "notices:create",
    "events:create",
  ],
  teacherForbiddenPermissions: ["notices:create", "events:create"],
}

type Mode = "check" | "apply" | "verify"
const MODE_FLAGS = new Set(["--check", "--apply", "--verify"])

export interface StagingFixtureArgs {
  mode: Mode
  target: StagingTargetArgs
}

interface ApplyPasswords {
  principal: string | null
  teacher: string | null
}

interface ApplyCounts {
  school: number
  users: number
  userRoles: number
  memberships: number
  teacherProfiles: number
}

export function parseStagingFixtureArgs(argv: readonly string[]): StagingFixtureArgs {
  const modeFlags = argv.filter((arg) => MODE_FLAGS.has(arg))
  if (modeFlags.length !== 1) {
    throw new Error(
      "expected exactly one of --check (read-only), --apply (create-only), or --verify (read-only)",
    )
  }
  const mode: Mode =
    modeFlags[0] === "--apply" ? "apply" : modeFlags[0] === "--verify" ? "verify" : "check"
  const target = parseStagingTargetArgs(argv.filter((arg) => !MODE_FLAGS.has(arg)))
  return { mode, target }
}

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

function sanitize(message: string, env: Record<string, string | undefined>): string {
  let result = message.replace(/:\/\/[^\s@"']*@/g, "://***:***@")
  for (const name of [PRINCIPAL_PASSWORD_ENV, TEACHER_PASSWORD_ENV]) {
    const value = env[name]
    if (value !== undefined && value !== "") result = result.replaceAll(value, "<redacted>")
  }
  return result
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

function requirePassword(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set; --apply requires it when creating the fixture user.`)
  }
  return value
}

function passwordsFor(
  plan: FixturePlan,
  env: Record<string, string | undefined>,
): ApplyPasswords {
  return {
    principal:
      plan.items.principalUser.state === "missing"
        ? requirePassword(env, PRINCIPAL_PASSWORD_ENV)
        : null,
    teacher:
      plan.items.teacherUser.state === "missing"
        ? requirePassword(env, TEACHER_PASSWORD_ENV)
        : null,
  }
}

function requireRoleId(preflight: PreflightCatalog, role: FixtureRole): string {
  const roleId = preflight.roleIds[role]
  if (roleId === null) throw new Error(`required role ${role} is missing`)
  return roleId
}

async function applyMissingRecords(
  prisma: PrismaClientType,
  spec: FixtureSpec,
  passwords: ApplyPasswords,
): Promise<ApplyCounts> {
  return prisma.$transaction(
    async (tx) => {
      const preflight = await loadPreflight(tx, spec)
      if (preflight.blockers.length > 0) {
        throw new Error(`preflight failed: ${preflight.blockers.join("; ")}`)
      }
      const plan = await inspectFixture(tx, spec, preflight)
      const conflicts = conflictLines(plan)
      if (conflicts.length > 0) {
        throw new Error(`fixture conflict: ${conflicts.join("; ")}`)
      }

      const counts: ApplyCounts = {
        school: 0,
        users: 0,
        userRoles: 0,
        memberships: 0,
        teacherProfiles: 0,
      }

      let schoolId = plan.schoolId
      if (plan.items.school.state === "missing") {
        const school = await tx.school.create({
          data: { name: spec.school.name, code: spec.school.code, status: "ACTIVE" },
          select: { id: true },
        })
        schoolId = school.id
        counts.school += 1
      }
      if (schoolId === null) throw new Error("fixture school could not be resolved")

      if (plan.items.principalUser.state === "missing") {
        if (passwords.principal === null) {
          throw new Error(`${PRINCIPAL_PASSWORD_ENV} is required to create the fixture principal.`)
        }
        await tx.user.create({
          data: {
            id: spec.principal.id,
            name: spec.principal.name,
            email: spec.principal.email,
            passwordHash: hashPassword(passwords.principal),
            schoolId,
            status: "ACTIVE",
          },
        })
        counts.users += 1
      }

      if (plan.items.teacherUser.state === "missing") {
        if (passwords.teacher === null) {
          throw new Error(`${TEACHER_PASSWORD_ENV} is required to create the fixture teacher.`)
        }
        await tx.user.create({
          data: {
            id: spec.teacher.id,
            name: spec.teacher.name,
            email: spec.teacher.email,
            passwordHash: hashPassword(passwords.teacher),
            schoolId,
            status: "ACTIVE",
          },
        })
        counts.users += 1
      }

      const principalRoleId = requireRoleId(preflight, "PRINCIPAL")
      const teacherRoleId = requireRoleId(preflight, "TEACHER")

      if (plan.items.principalUserRole.state === "missing") {
        await tx.userRole.create({
          data: { userId: spec.principal.id, roleId: principalRoleId },
        })
        counts.userRoles += 1
      }
      if (plan.items.teacherUserRole.state === "missing") {
        await tx.userRole.create({
          data: { userId: spec.teacher.id, roleId: teacherRoleId },
        })
        counts.userRoles += 1
      }

      if (plan.items.principalMembership.state === "missing") {
        await tx.tenantMembership.create({
          data: {
            userId: spec.principal.id,
            schoolId,
            roleId: principalRoleId,
            status: "ACTIVE",
          },
        })
        counts.memberships += 1
      }
      if (plan.items.teacherMembership.state === "missing") {
        await tx.tenantMembership.create({
          data: {
            userId: spec.teacher.id,
            schoolId,
            roleId: teacherRoleId,
            status: "ACTIVE",
          },
        })
        counts.memberships += 1
      }

      if (plan.items.teacherProfile.state === "missing") {
        await tx.teacher.create({
          data: {
            schoolId,
            userId: spec.teacher.id,
            employeeId: spec.teacherProfile.employeeId,
            firstName: spec.teacherProfile.firstName,
            lastName: spec.teacherProfile.lastName,
            email: spec.teacherProfile.email,
            gender: spec.teacherProfile.gender,
            designation: spec.teacherProfile.designation,
            joiningDate: spec.teacherProfile.joiningDate,
            status: "ACTIVE",
          },
        })
        counts.teacherProfiles += 1
      }

      return counts
    },
    { maxWait: 15_000, timeout: 60_000 },
  )
}

async function main(): Promise<void> {
  const args = parseStagingFixtureArgs(process.argv.slice(2))
  const target = resolveStagingTarget(process.env, args.target)

  process.env.DATABASE_URL = target.raw

  console.log(`staging fixture — mode: ${args.mode}`)

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient({ datasourceUrl: target.raw })
  try {
    await assertTargetIdentity(prisma, target)
    console.log(`target: ${target.display} (project: ${STAGING_PROJECT_LABEL})`)

    const plan = await inspectFixture(prisma, FIXTURE_SPEC, await loadPreflight(prisma, FIXTURE_SPEC))
    printPlan(plan)

    const conflicts = conflictLines(plan)
    if (plan.preflight.blockers.length > 0 || conflicts.length > 0) {
      process.exitCode = 1
      return
    }

    if (args.mode !== "apply") {
      process.exitCode = isComplete(plan) ? 0 : 1
      return
    }

    if (isComplete(plan)) {
      console.log("fixture: already present; no writes")
      return
    }

    const counts = await applyMissingRecords(prisma, FIXTURE_SPEC, passwordsFor(plan, process.env))
    const created =
      counts.school +
      counts.users +
      counts.userRoles +
      counts.memberships +
      counts.teacherProfiles
    console.log(`applied: created ${created} fixture record(s) in one transaction.`)

    const after = await inspectFixture(
      prisma,
      FIXTURE_SPEC,
      await loadPreflight(prisma, FIXTURE_SPEC),
    )
    console.log("re-check after apply:")
    printPlan(after)
    if (!isComplete(after)) {
      console.log("verification FAILED — the staging fixture is incomplete.")
      process.exitCode = 1
      return
    }
    console.log("verified: staging fixture is complete.")
  } finally {
    await prisma.$disconnect()
  }
}

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    console.error(sanitize(error instanceof Error ? error.message : String(error), process.env))
    process.exitCode = 1
  })
}
