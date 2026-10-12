/**
 * Guarded scale-fixture provisioning for manual timetable scale testing.
 *
 * Seeds a disposable, *explicitly named* database — `school_management_scale_test`
 * on loopback port 5433 — with a real-school-sized timetable (≈1000 lessons) so the
 * Grid, List and Print surfaces can be exercised by hand in a browser against real
 * data. It never touches DATABASE_URL / TEST_DATABASE_URL and never creates or drops
 * a database; the target must already exist.
 *
 * It also provisions one fixture-owned login so the seeded timetable can actually
 * be reached in a browser: a bare SUPER_ADMIN role, an ACTIVE user whose password
 * is hashed with the real `hashPassword()`, a UserRole link, and an ACTIVE
 * TenantMembership for the fixture school. No password or hash is ever printed.
 *
 * Safety model (fail closed):
 *   - the connection string must come from TIMETABLE_SCALE_TEST_DATABASE_URL;
 *   - it must parse, be loopback-only, use port 5433, and name exactly
 *     `school_management_scale_test`;
 *   - it is re-validated by the shared test-database guard with an EMPTY env, so the
 *     ALLOW_REMOTE_TEST_DATABASE opt-in can never widen this script's reach;
 *   - the login email must come from TIMETABLE_SCALE_TEST_ADMIN_EMAIL and live under
 *     the reserved `.invalid` TLD; the password must come from
 *     TIMETABLE_SCALE_TEST_ADMIN_PASSWORD. There is no fallback to SEED_ADMIN_* or
 *     DATABASE_URL, and no value is ever read from `.env`;
 *   - every fixture row hangs off one school whose name is a fixed marker, and both
 *     seed and cleanup only ever delete schools with that exact marker. No TRUNCATE,
 *     no `deleteMany()` without the marker, no `DROP`;
 *   - the shared SUPER_ADMIN role is never deleted.
 *
 * Usage:
 *   npm run timetable:scale:seed
 *   npm run timetable:scale:cleanup
 */

import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../server/src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../server/src/permissions/permissions.js"
import {
  assertSafeTestDatabaseUrl,
  isLoopbackHost,
  redactDatabaseUrl,
} from "../server/tests/helpers/test-database-guard.js"
import {
  SCALE_ADMIN_EMAIL_ENV,
  validateScaleAdminCredentials,
  validateScaleAdminEmail,
} from "../server/tests/helpers/timetable-scale-credentials.js"
import {
  scaleClasses,
  scaleEntrySpecs,
  scalePeriodSlots,
  scaleSubjects,
} from "../server/tests/helpers/timetable-scale-plan.js"

const REQUIRED_DB_NAME = "school_management_scale_test"
const REQUIRED_PORT = "5433"
const FIXTURE_SCHOOL_NAME = "__TIMETABLE_SCALE_FIXTURE__"
const SESSION_CODE = "SCALE-2026"
const ADMIN_NAME = "Scale Test Administrator"

type Command = "seed" | "cleanup"

function fail(message: string): never {
  console.error(`[timetable-scale] ${message}`)
  process.exit(1)
}

function resolveTarget(): { url: string; display: string } {
  const raw = process.env.TIMETABLE_SCALE_TEST_DATABASE_URL
  if (raw === undefined || raw.trim() === "") {
    fail(
      "TIMETABLE_SCALE_TEST_DATABASE_URL is not set. Point it at a disposable " +
        `database named ${REQUIRED_DB_NAME} (see docs/timetable-scale-testing.md).`,
    )
  }

  // Empty env disables the ALLOW_REMOTE_TEST_DATABASE escape hatch entirely.
  try {
    assertSafeTestDatabaseUrl(raw, {})
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    fail("TIMETABLE_SCALE_TEST_DATABASE_URL is not a parseable connection string.")
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""))
  if (database !== REQUIRED_DB_NAME) {
    fail(
      `Refusing to run: this script only seeds a database named ${REQUIRED_DB_NAME} ` +
        `(got "${database}"). It must never run against another database.`,
    )
  }
  if (!isLoopbackHost(parsed.hostname)) {
    fail("Refusing to run: the scale database must be on a loopback host.")
  }
  if (parsed.port !== REQUIRED_PORT) {
    fail(`Refusing to run: the scale database must listen on port ${REQUIRED_PORT}.`)
  }

  return { url: raw, display: redactDatabaseUrl(raw) }
}

function resolveAdminCredentials(): { email: string; password: string } {
  try {
    return validateScaleAdminCredentials(process.env)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

function resolveCleanupEmail(): string {
  try {
    return validateScaleAdminEmail(process.env[SCALE_ADMIN_EMAIL_ENV]).email
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

function runMigrations(url: string): void {
  try {
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "server/prisma/schema.prisma",
      ],
      { env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "pipe", "pipe"] },
    )
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: Buffer }).stderr ?? "")
        : ""
    fail(`prisma migrate deploy failed for the scale database.\n${stderr.trim()}`)
  }
}

async function cleanup(prisma: PrismaClient, email: string): Promise<number> {
  // AuditLog.schoolId is `onDelete: Restrict` (a school must not be deletable to
  // hide its audit trail), so the fixture school's audit rows go first.
  const schools = await prisma.school.findMany({
    where: { name: FIXTURE_SCHOOL_NAME },
    select: { id: true },
  })
  const schoolIds = schools.map((school) => school.id)
  if (schoolIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { schoolId: { in: schoolIds } } })
  }

  // Remove only the dedicated fixture identity; deleting it cascades to its
  // sessions, UserRole links and TenantMembership. The SUPER_ADMIN role is never
  // deleted — it is shared catalog data, and TenantMembership.roleId is
  // `onDelete: Restrict`.
  await prisma.user.deleteMany({ where: { email } })

  // Deleting the marked school cascades to every fixture row beneath it. Scoped to
  // the marker, so no unrelated row in the database can be affected.
  const result = await prisma.school.deleteMany({ where: { name: FIXTURE_SCHOOL_NAME } })
  return result.count
}

async function seed(prisma: PrismaClient, email: string, password: string): Promise<void> {
  const removed = await cleanup(prisma, email)

  const school = await prisma.school.create({ data: { name: FIXTURE_SCHOOL_NAME } })

  const session = await prisma.academicSession.create({
    data: {
      schoolId: school.id,
      name: "Scale Test Session",
      code: SESSION_CODE,
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2027-03-31T00:00:00.000Z"),
      status: "ACTIVE",
    },
  })

  const periodSlots = []
  for (const spec of scalePeriodSlots()) {
    periodSlots.push(
      await prisma.periodSlot.create({ data: { schoolId: school.id, ...spec } }),
    )
  }

  const subjects = []
  for (const spec of scaleSubjects()) {
    subjects.push(await prisma.subject.create({ data: { schoolId: school.id, ...spec } }))
  }

  const classes: { classId: string; sectionId: string; teacherId: string }[] = []
  for (const spec of scaleClasses()) {
    const created = await prisma.class.create({
      data: { schoolId: school.id, name: spec.name, sortOrder: spec.sortOrder },
    })
    const section = await prisma.section.create({
      data: { classId: created.id, name: spec.sectionName },
    })
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: spec.employeeId,
        firstName: spec.teacherFirstName,
        lastName: spec.teacherLastName,
        gender: "FEMALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    classes.push({ classId: created.id, sectionId: section.id, teacherId: teacher.id })
  }

  // Dedicated, fixture-owned login. A bare SUPER_ADMIN role is enough: the
  // role-name check bypasses permission lookups on both server and client, so no
  // RolePermission rows are needed (mirrors the scale integration suite). The role
  // is upserted so reseeding is idempotent and the canonical name is reused.
  const role = await prisma.role.upsert({
    where: { name: SUPER_ADMIN_ROLE },
    update: {},
    create: { name: SUPER_ADMIN_ROLE, description: "Scale-test administrator (fixture-owned)" },
  })

  const user = await prisma.user.create({
    data: {
      schoolId: school.id,
      name: ADMIN_NAME,
      email,
      passwordHash: hashPassword(password),
      status: "ACTIVE",
    },
  })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  await prisma.tenantMembership.create({
    data: { userId: user.id, schoolId: school.id, roleId: role.id, status: "ACTIVE" },
  })

  const entries = scaleEntrySpecs().map((spec) => ({
    schoolId: school.id,
    academicSessionId: session.id,
    dayOfWeek: spec.dayOfWeek,
    periodSlotId: periodSlots[spec.periodIndex].id,
    classId: classes[spec.classIndex].classId,
    sectionId: classes[spec.classIndex].sectionId,
    subjectId: subjects[spec.subjectIndex].id,
    teacherId: classes[spec.teacherIndex].teacherId,
  }))

  await prisma.timetableEntry.createMany({ data: entries })

  console.log(
    `[timetable-scale] seeded ${entries.length} lessons across ${classes.length} classes ` +
      `and ${periodSlots.length} periods in ${redactDatabaseUrl(process.env.TIMETABLE_SCALE_TEST_DATABASE_URL ?? "")}`,
  )
  console.log(`[timetable-scale] removed ${removed} pre-existing fixture school row(s) first`)
  console.log(`[timetable-scale] session id: ${session.id}`)
  console.log(`[timetable-scale] scale-test login identity ready (email from ${SCALE_ADMIN_EMAIL_ENV})`)
}

async function main(): Promise<void> {
  const command = (process.argv[2] ?? "seed") as Command
  if (command !== "seed" && command !== "cleanup") {
    fail(`Unknown command "${command}". Use "seed" or "cleanup".`)
  }

  const { url, display } = resolveTarget()
  console.log(`[timetable-scale] target ${display}`)

  const prisma = new PrismaClient({ datasourceUrl: url })
  try {
    if (command === "seed") {
      const credentials = resolveAdminCredentials()
      runMigrations(url)
      await seed(prisma, credentials.email, credentials.password)
    } else {
      const email = resolveCleanupEmail()
      const removed = await cleanup(prisma, email)
      console.log(`[timetable-scale] removed ${removed} fixture school row(s)`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
