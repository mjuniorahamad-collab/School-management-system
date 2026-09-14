// One-time production bootstrap.
//
// Creates ONLY the structural/master records required for the first real
// school and super admin to sign in and use the application:
//   - School (BFIS) + one ACTIVE AcademicSession
//   - the full permission catalog (115), the 11 roles, and their role grants
//   - the initial Super Admin identity: User + UserRole + ACTIVE TenantMembership
//
// It NEVER creates demo/business records (no students, guardians, enrollments,
// classes, sections, teachers, staff, fees, exams, homework, library,
// transport, messages, notifications, ...) and NEVER modifies the schema.
//
// Idempotency: structural rows upsert by their unique keys; role grants are
// reconciled to the code catalog (mirrors seed.ts). The one non-idempotent case
// is deliberate: if SEED_ADMIN_EMAIL already exists the script ABORTS — it will
// never promote an existing account and never overwrites a password hash.
//
// Modes:
//   npm run bootstrap:production -- --check   read-only preflight
//   npm run bootstrap:production              transactional write
//   npm run bootstrap:production -- --verify  read-only post-run report

import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../src/auth/password.js"
import {
  PERMISSION_CODES,
  ROLE_DESCRIPTIONS,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  describePermission,
  type RoleName,
} from "../src/permissions/permissions.js"

const SCHOOL_CODE = "BFIS"
const SCHOOL_NAME = "Bright Future International School"
const SUPER_ADMIN_ROLE = ROLE_NAMES.SUPER_ADMIN
const ADMIN_NAME = "System Administrator"

const args = new Set(process.argv.slice(2))
const runCheck = args.has("--check")
const runVerify = args.has("--verify")

try {
  process.loadEnvFile()
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  if (code !== "ENOENT") throw error
}

const prisma = new PrismaClient()

function assertGrantsValid(): void {
  const known = new Set<string>(PERMISSION_CODES)
  for (const role of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
    for (const code of ROLE_PERMISSIONS[role]) {
      if (!known.has(code)) {
        throw new Error(
          `Bootstrap grant error: role ${role} references unknown permission "${code}"`,
        )
      }
    }
  }
}

function requireEnv(): { email: string; password: string } {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to bootstrap production",
    )
  }
  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters")
  }
  return { email, password }
}

function expectedGrantsCount(): number {
  return Object.values(ROLE_PERMISSIONS).reduce((sum, codes) => sum + codes.length, 0)
}

async function preflight(email: string): Promise<void> {
  const school = await prisma.school.findUnique({ where: { code: SCHOOL_CODE } })
  const activeSessions = school
    ? await prisma.academicSession.count({
        where: { schoolId: school.id, status: "ACTIVE" },
      })
    : 0
  const permissionCount = await prisma.permission.count()
  const roleCount = await prisma.role.count()
  const superRole = await prisma.role.findUnique({ where: { name: SUPER_ADMIN_ROLE } })
  const grantCount = await prisma.rolePermission.count()
  const user = await prisma.user.findUnique({ where: { email } })

  const line = (label: string, ok: boolean, detail: string): void =>
    console.log(`  ${ok ? "[ok ]" : "[bad]"} ${label}: ${detail}`)

  console.log(
    process.env.DATABASE_URL
      ? "PREFLIGHT (read-only)"
      : "PREFLIGHT (read-only): DATABASE_URL not set in environment",
  )
  line("School BFIS", Boolean(school), school ? `present (${school.status}) — will repair in place` : "MISSING — will create")
  line("ACTIVE AcademicSession", activeSessions > 0, activeSessions > 0 ? `present (${activeSessions}) — will reconcile` : "MISSING — will create current-year ACTIVE")
  line("Permission catalog", permissionCount === PERMISSION_CODES.length, `${permissionCount}/${PERMISSION_CODES.length} — will upsert to ${PERMISSION_CODES.length}`)
  line("Roles", roleCount === Object.keys(ROLE_NAMES).length, `${roleCount}/${Object.keys(ROLE_NAMES).length} — will upsert to ${Object.keys(ROLE_NAMES).length}`)
  line("SUPER_ADMIN role", Boolean(superRole), superRole ? "present" : "MISSING — will create")
  line("RolePermission grants", grantCount === expectedGrantsCount(), `${grantCount}/${expectedGrantsCount()} — will reconcile`)
  line("Admin email", !user, user ? `ALREADY EXISTS (status ${user.status}) — bootstrap will ABORT` : "absent — will create identity")
  console.log(user ? "RESULT: ABORT — admin email already exists" : "RESULT: OK to bootstrap")
}

async function verify(email: string): Promise<void> {
  const school = await prisma.school.findUnique({ where: { code: SCHOOL_CODE } })
  const activeSessions = school
    ? await prisma.academicSession.count({
        where: { schoolId: school.id, status: "ACTIVE" },
      })
    : 0
  const permissionCount = await prisma.permission.count()
  const roleCount = await prisma.role.count()
  const grantCount = await prisma.rolePermission.count()
  const user = await prisma.user.findUnique({ where: { email } })
  const userRoleCount = user
    ? await prisma.userRole.count({ where: { userId: user.id } })
    : 0
  const membership = user && school
    ? await prisma.tenantMembership.findUnique({
        where: { userId_schoolId: { userId: user.id, schoolId: school.id } },
      })
    : null

  const line = (label: string, ok: boolean, detail: string): void =>
    console.log(`  ${ok ? "[ok ]" : "[bad]"} ${label}: ${detail}`)

  console.log("VERIFY (read-only):")
  line("School BFIS", Boolean(school && school.status === "ACTIVE"), school ? `present (${school.status})` : "missing")
  line("Active AcademicSession", activeSessions > 0, `count=${activeSessions}`)
  line("Permission catalog", permissionCount === PERMISSION_CODES.length, `${permissionCount}/${PERMISSION_CODES.length}`)
  line("Roles", roleCount === Object.keys(ROLE_NAMES).length, `${roleCount}/${Object.keys(ROLE_NAMES).length}`)
  line("RolePermission grants", grantCount === expectedGrantsCount(), `${grantCount}/${expectedGrantsCount()}`)
  line("Admin user", Boolean(user && user.status === "ACTIVE"), user ? `present (${user.status})` : "missing")
  line("Admin SUPER_ADMIN UserRole", userRoleCount >= 1, `count=${userRoleCount}`)
  line("Admin ACTIVE TenantMembership", Boolean(membership && membership.status === "ACTIVE"), membership ? `present (${membership.status})` : "missing")
}

async function bootstrap(): Promise<void> {
  const { email, password } = requireEnv()
  assertGrantsValid()

  await prisma.$transaction(async (tx) => {
    const school = await tx.school.upsert({
      where: { code: SCHOOL_CODE },
      update: { name: SCHOOL_NAME, status: "ACTIVE" },
      create: { name: SCHOOL_NAME, code: SCHOOL_CODE, status: "ACTIVE" },
    })

    const year = new Date().getFullYear()
    await tx.academicSession.upsert({
      where: { schoolId_code: { schoolId: school.id, code: `AY${year}-${year + 1}` } },
      update: {
        name: `Academic Year ${year}-${year + 1}`,
        startDate: new Date(Date.UTC(year, 7, 1)),
        endDate: new Date(Date.UTC(year + 1, 5, 30)),
        status: "ACTIVE",
      },
      create: {
        schoolId: school.id,
        name: `Academic Year ${year}-${year + 1}`,
        code: `AY${year}-${year + 1}`,
        startDate: new Date(Date.UTC(year, 7, 1)),
        endDate: new Date(Date.UTC(year + 1, 5, 30)),
        status: "ACTIVE",
      },
    })

    for (const code of PERMISSION_CODES) {
      const [resource, action] = code.split(":")
      const description = describePermission(code)
      await tx.permission.upsert({
        where: { code },
        update: { resource, action, description },
        create: { code, resource, action, description },
      })
    }

    const roleIds = new Map<RoleName, string>()
    for (const name of Object.keys(ROLE_NAMES) as RoleName[]) {
      const role = await tx.role.upsert({
        where: { name },
        update: { description: ROLE_DESCRIPTIONS[name] },
        create: { name, description: ROLE_DESCRIPTIONS[name] },
      })
      roleIds.set(name, role.id)
    }

    let grantCount = 0
    for (const role of Object.keys(ROLE_NAMES) as RoleName[]) {
      const permissions = await tx.permission.findMany({
        where: { code: { in: [...ROLE_PERMISSIONS[role]] } },
      })
      await tx.rolePermission.deleteMany({ where: { roleId: roleIds.get(role)! } })
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: roleIds.get(role)!,
            permissionId: permission.id,
          })),
        })
      }
      grantCount += permissions.length
    }

    const existing = await tx.user.findUnique({ where: { email } })
    if (existing) {
      throw new Error(
        `SEED_ADMIN_EMAIL already has an account — refusing to modify it. ` +
          `Resolve the existing identity manually; the bootstrap made no changes.`,
      )
    }

    const admin = await tx.user.create({
      data: {
        email,
        name: ADMIN_NAME,
        passwordHash: hashPassword(password),
        schoolId: school.id,
        status: "ACTIVE",
      },
    })

    await tx.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: roleIds.get(SUPER_ADMIN_ROLE)! } },
      update: {},
      create: { userId: admin.id, roleId: roleIds.get(SUPER_ADMIN_ROLE)! },
    })

    await tx.tenantMembership.upsert({
      where: { userId_schoolId: { userId: admin.id, schoolId: school.id } },
      update: { roleId: roleIds.get(SUPER_ADMIN_ROLE)!, status: "ACTIVE" },
      create: {
        userId: admin.id,
        schoolId: school.id,
        roleId: roleIds.get(SUPER_ADMIN_ROLE)!,
        status: "ACTIVE",
      },
    })

    console.log(
      `Bootstrap complete: school="${school.name}" permissions=${PERMISSION_CODES.length} ` +
        `roles=${Object.keys(ROLE_NAMES).length} grants=${grantCount} admin=${email}`,
    )
  }, { maxWait: 15_000, timeout: 120_000 })
}

async function main(): Promise<void> {
  const { email } = requireEnv()
  if (runCheck) {
    await preflight(email)
    return
  }
  if (runVerify) {
    await verify(email)
    return
  }
  await bootstrap()
}

main()
  .catch((error: unknown) => {
    console.error("Bootstrap failed:", error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })