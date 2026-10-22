// Concurrency coverage for the ACTIVE grading-band overlap rule.
//
// THE RULE: a school must never end up with two ACTIVE bands whose ranges
// overlap — otherwise the grade a percentage resolves to depends on row order.
//
// The check is a read-then-write sequence (read the active bands, then insert),
// so under PostgreSQL's default READ COMMITTED isolation two concurrent
// writes can both observe a free range and both commit. The service therefore
// takes a school-scoped transaction-level advisory lock BEFORE the overlap
// query, which serializes the check and the write per school.
//
// DB-backed: runs only when TEST_DATABASE_URL points at a disposable test
// database (the vitest global setup enforces that).

import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { gradingBandLockKey } from "../src/modules/grading-bands/grading-band.lock.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const fixtures = {
  schoolId: "",
  adminPassword: "grading-concurrency-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Grading band concurrency (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")

    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "server/prisma/schema.prisma",
      ],
      { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "pipe" },
    )

    prisma = new PrismaClient()
    await resetAllTables(prisma)

    const school = await prisma.school.create({ data: { name: "Grading Concurrency School" } })
    fixtures.schoolId = school.id

    const superAdminRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const adminUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Grading Admin",
        email: "grading.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: adminUser.id, schoolId: school.id, roleId: superAdminRole.id, status: "ACTIVE" },
    })

    const login = await adminAgent
      .post("/api/v1/auth/login")
      .send({ email: "grading.admin@example.com", password: fixtures.adminPassword })
    expect(login.status).toBe(200)
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it("takes the school-scoped advisory lock while it validates the overlap", async () => {
    const key = gradingBandLockKey(fixtures.schoolId)

    // Hold the school's lock in a separate transaction, exactly like the
    // service does, and keep it for a moment.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(${key}::int)) AS lock_call`
      await new Promise((resolve) => setTimeout(resolve, 1500))
    })

    // The create must wait for the lock instead of completing straight away.
    let settledBeforeRelease = false
    const started = Date.now()
    const pending = adminAgent
      .post("/api/v1/grading-bands")
      .send({ minPercent: 10, maxPercent: 29, grade: "LK" })
      .then((response) => {
        settledBeforeRelease = true
        return response
      })

    // Give the request time to reach the lock; it must still be waiting.
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(settledBeforeRelease).toBe(false)

    await holder
    const res = await pending
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    // It really waited for the lock instead of failing fast.
    expect(Date.now() - started).toBeGreaterThan(600)
  })

  it("never lets two concurrent overlapping bands become active", async () => {
    const [first, second] = await Promise.all([
      adminAgent
        .post("/api/v1/grading-bands")
        .send({ minPercent: 40, maxPercent: 59, grade: "C1" }),
      adminAgent
        .post("/api/v1/grading-bands")
        .send({ minPercent: 45, maxPercent: 65, grade: "C2" }),
    ])

    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([201, 400])

    const active = await prisma.gradingBand.findMany({
      where: { schoolId: fixtures.schoolId, isActive: true },
      orderBy: { minPercent: "asc" },
    })
    for (let index = 1; index < active.length; index += 1) {
      expect(active[index].minPercent).toBeGreaterThan(active[index - 1].maxPercent)
    }
  })

  it("never lets a concurrent reactivation overlap an active band", async () => {
    // A retired band that would overlap the active 40-59 band.
    const retired = await prisma.gradingBand.create({
      data: {
        schoolId: fixtures.schoolId,
        minPercent: 30,
        maxPercent: 45,
        grade: "OLD",
        isActive: false,
      },
    })

    const [reactivated, created] = await Promise.all([
      adminAgent.patch(`/api/v1/grading-bands/${retired.id}`).send({ isActive: true }),
      adminAgent
        .post("/api/v1/grading-bands")
        .send({ minPercent: 70, maxPercent: 79, grade: "D1" }),
    ])

    expect(reactivated.status).toBe(400)
    expect(created.status).toBe(201)
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  // One TRUNCATE ... CASCADE clears every school-scoped table AND the rows that
  // RESTRICT a delete (payments, receipts, adjustments, enrolments, ...). An
  // ordered list of DELETEs aborts as soon as a previously run suite left a
  // Restrict child behind: the DB-backed suites share ONE test database and
  // run one after another.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "School" CASCADE')
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
}
