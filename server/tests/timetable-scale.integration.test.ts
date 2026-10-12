import { execFileSync } from "node:child_process"
import os from "node:os"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"
import {
  SCALE_DAYS,
  SCALE_TARGET_ENTRIES,
  scaleClasses,
  scaleEntrySpecs,
  scalePeriodSlots,
  scaleSubjects,
} from "./helpers/timetable-scale-plan.js"

// DB-backed scale + integrity suite.
//
// Proves the weekly timetable survives a real school's load (~1000 lessons in one
// session) through the real API, and that the database uniqueness constraints hold
// at that size. Unlike the older integration suites it never truncates tables: it
// creates uniquely-marked fixture schools and deletes only those in teardown, so it
// cannot disturb rows it did not create.
//
// Runs only when TEST_DATABASE_URL is set (guarded in vitest.config.ts). The
// performance mode is opt-in via TIMETABLE_SCALE_PERF=1 and reports measurements —
// it makes no pass/fail claim, because wall times depend on the machine.

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const PERF = process.env.TIMETABLE_SCALE_PERF === "1"
const app = createApp()

const PRIMARY_SCHOOL_NAME = "__TIMETABLE_SCALE_INTEGRATION_PRIMARY__"
const FOREIGN_SCHOOL_NAME = "__TIMETABLE_SCALE_INTEGRATION_FOREIGN__"
const ADMIN_EMAIL = "timetable.scale.admin@example.test"
const ADMIN_PASSWORD = "timetable-scale-secret-123"
const PRIMARY_SESSION_CODE = "SCALE-PRIMARY-2026"
const SECONDARY_SESSION_CODE = "SCALE-SECONDARY-2026"
const FOREIGN_SESSION_CODE = "SCALE-FOREIGN-2026"

interface ScaleFixtures {
  primarySchoolId: string
  primarySessionId: string
  secondarySessionId: string
  foreignSessionId: string
  periodSlots: { id: string; sortOrder: number }[]
  classes: { classId: string; sectionId: string; teacherId: string }[]
  subjectIds: string[]
}

let prisma: PrismaClient
const fixtures: ScaleFixtures = {
  primarySchoolId: "",
  primarySessionId: "",
  secondarySessionId: "",
  foreignSessionId: "",
  periodSlots: [],
  classes: [],
  subjectIds: [],
}

async function seedLessons(sessionId: string, count: number): Promise<void> {
  const periodSlots = fixtures.periodSlots
  const classes = fixtures.classes
  const subjects = fixtures.subjectIds
  const data = scaleEntrySpecs(count, periodSlots.length, classes.length).map((spec) => ({
    schoolId: fixtures.primarySchoolId,
    academicSessionId: sessionId,
    dayOfWeek: spec.dayOfWeek,
    periodSlotId: periodSlots[spec.periodIndex].id,
    classId: classes[spec.classIndex].classId,
    sectionId: classes[spec.classIndex].sectionId,
    subjectId: subjects[spec.subjectIndex % subjects.length],
    teacherId: classes[spec.teacherIndex].teacherId,
  }))
  await prisma.timetableEntry.createMany({ data })
}

async function cleanupOwnFixtures(): Promise<void> {
  if (!prisma) return
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } })

  const schools = await prisma.school.findMany({
    where: { name: { in: [PRIMARY_SCHOOL_NAME, FOREIGN_SCHOOL_NAME] } },
    select: { id: true },
  })
  const schoolIds = schools.map((school) => school.id)
  if (schoolIds.length === 0) return

  // AuditLog.schoolId is `onDelete: Restrict` (a school must not be deletable to
  // hide its audit trail), so the rows this suite produced are removed first.
  await prisma.auditLog.deleteMany({ where: { schoolId: { in: schoolIds } } })
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } })
}

describe.skipIf(!TEST_DATABASE_URL)("Timetable scale & integrity (integration)", () => {
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
    await cleanupOwnFixtures()

    const school = await prisma.school.create({ data: { name: PRIMARY_SCHOOL_NAME } })
    fixtures.primarySchoolId = school.id

    const primarySession = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Scale Primary Session",
        code: PRIMARY_SESSION_CODE,
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.primarySessionId = primarySession.id

    const secondarySession = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Scale Secondary Session",
        code: SECONDARY_SESSION_CODE,
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.secondarySessionId = secondarySession.id

    fixtures.periodSlots = []
    for (const spec of scalePeriodSlots()) {
      const created = await prisma.periodSlot.create({
        data: { schoolId: school.id, ...spec },
      })
      fixtures.periodSlots.push({ id: created.id, sortOrder: created.sortOrder })
    }

    fixtures.subjectIds = []
    for (const spec of scaleSubjects()) {
      const created = await prisma.subject.create({ data: { schoolId: school.id, ...spec } })
      fixtures.subjectIds.push(created.id)
    }

    fixtures.classes = []
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
      fixtures.classes.push({
        classId: created.id,
        sectionId: section.id,
        teacherId: teacher.id,
      })
    }

    await seedLessons(fixtures.primarySessionId, SCALE_TARGET_ENTRIES)
    await seedLessons(fixtures.secondarySessionId, 5)

    // A foreign tenant with its own session, to prove cross-tenant isolation.
    const foreignSchool = await prisma.school.create({ data: { name: FOREIGN_SCHOOL_NAME } })
    const foreignSession = await prisma.academicSession.create({
      data: {
        schoolId: foreignSchool.id,
        name: "Foreign Session",
        code: FOREIGN_SESSION_CODE,
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.foreignSessionId = foreignSession.id
    const foreignClass = await prisma.class.create({
      data: { schoolId: foreignSchool.id, name: "1", sortOrder: 1 },
    })
    const foreignSection = await prisma.section.create({
      data: { classId: foreignClass.id, name: "A" },
    })
    const foreignSubject = await prisma.subject.create({
      data: { schoolId: foreignSchool.id, code: "FOR", name: "Foreign" },
    })
    const foreignTeacher = await prisma.teacher.create({
      data: {
        schoolId: foreignSchool.id,
        employeeId: "T-FOREIGN-0001",
        firstName: "Foreign",
        lastName: "Teacher",
        gender: "MALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    await prisma.timetableEntry.createMany({
      data: fixtures.periodSlots.slice(0, 3).map((slot) => ({
        schoolId: foreignSchool.id,
        academicSessionId: foreignSession.id,
        dayOfWeek: "MONDAY",
        periodSlotId: slot.id,
        classId: foreignClass.id,
        sectionId: foreignSection.id,
        subjectId: foreignSubject.id,
        teacherId: foreignTeacher.id,
      })),
    })

    const superAdminRole = await prisma.role.upsert({
      where: { name: SUPER_ADMIN_ROLE },
      update: {},
      create: { name: SUPER_ADMIN_ROLE, description: "Scale test super admin" },
    })
    const adminUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Scale Admin",
        email: ADMIN_EMAIL,
        passwordHash: hashPassword(ADMIN_PASSWORD),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: superAdminRole.id } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: {
        userId: adminUser.id,
        schoolId: school.id,
        roleId: superAdminRole.id,
        status: "ACTIVE",
      },
    })

    const login = await adminAgent
      .post("/api/v1/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    expect(login.status).toBe(200)
  })

  afterAll(async () => {
    await cleanupOwnFixtures()
    await prisma?.$disconnect()
  })

  describe("completeness at scale", () => {
    it("returns every one of the session's lessons", async () => {
      const res = await adminAgent.get(
        `/api/v1/timetable?academicSessionId=${fixtures.primarySessionId}`,
      )

      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(SCALE_TARGET_ENTRIES)
      expect(res.body.data.items).toHaveLength(SCALE_TARGET_ENTRIES)

      const ids = new Set(res.body.data.items.map((item: { id: string }) => item.id))
      expect(ids.size).toBe(SCALE_TARGET_ENTRIES)
    })

    it("orders by weekday and then by the period slots' configured order", async () => {
      const res = await adminAgent.get(
        `/api/v1/timetable?academicSessionId=${fixtures.primarySessionId}`,
      )
      const sortOrderBySlot = new Map(fixtures.periodSlots.map((slot) => [slot.id, slot.sortOrder]))
      const dayRank = new Map(SCALE_DAYS.map((day, index) => [day as string, index]))

      let previousDay = -1
      let previousOrder = -1
      for (const item of res.body.data.items as { dayOfWeek: string; periodSlotId: string }[]) {
        const day = dayRank.get(item.dayOfWeek)
        const order = sortOrderBySlot.get(item.periodSlotId)
        expect(day).toBeDefined()
        expect(order).toBeDefined()
        if (day !== previousDay) {
          expect(day as number).toBeGreaterThan(previousDay)
          previousDay = day as number
          previousOrder = -1
        }
        expect(order as number).toBeGreaterThanOrEqual(previousOrder)
        previousOrder = order as number
      }
    })
  })

  describe("uniqueness constraints at scale", () => {
    it("rejects a second entry for the same class and period on the same day", async () => {
      const first = fixtures.classes[0]
      const otherTeacher = fixtures.classes[1].teacherId
      await expect(
        prisma.timetableEntry.create({
          data: {
            schoolId: fixtures.primarySchoolId,
            academicSessionId: fixtures.primarySessionId,
            dayOfWeek: "MONDAY",
            periodSlotId: fixtures.periodSlots[0].id,
            classId: first.classId,
            sectionId: first.sectionId,
            subjectId: fixtures.subjectIds[0],
            teacherId: otherTeacher,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" })
    })

    it("rejects double-booking the same teacher in one period", async () => {
      const first = fixtures.classes[0]
      const otherClass = fixtures.classes[5]
      await expect(
        prisma.timetableEntry.create({
          data: {
            schoolId: fixtures.primarySchoolId,
            academicSessionId: fixtures.primarySessionId,
            dayOfWeek: "MONDAY",
            periodSlotId: fixtures.periodSlots[0].id,
            classId: otherClass.classId,
            sectionId: otherClass.sectionId,
            subjectId: fixtures.subjectIds[0],
            teacherId: first.teacherId,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" })
    })
  })

  describe("session and tenant isolation", () => {
    it("scopes a session query to that session only", async () => {
      const res = await adminAgent.get(
        `/api/v1/timetable?academicSessionId=${fixtures.secondarySessionId}`,
      )
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(5)
      for (const item of res.body.data.items as { academicSessionId: string }[]) {
        expect(item.academicSessionId).toBe(fixtures.secondarySessionId)
      }
    })

    it("unions sessions only when no session filter is supplied", async () => {
      const res = await adminAgent.get("/api/v1/timetable")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(SCALE_TARGET_ENTRIES + 5)
    })

    it("never returns another tenant's entries", async () => {
      const res = await adminAgent.get(
        `/api/v1/timetable?academicSessionId=${fixtures.foreignSessionId}`,
      )
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)
      expect(res.body.data.items).toEqual([])
    })
  })

  describe.runIf(PERF)("performance (report-only)", () => {
    it("reports wall time and payload bytes for 36 / 500 / 1000 lessons", async () => {
      const createSession = (name: string, code: string) =>
        prisma.academicSession.create({
          data: {
            schoolId: fixtures.primarySchoolId,
            name,
            code,
            startDate: new Date("2026-04-01T00:00:00.000Z"),
            endDate: new Date("2027-03-31T00:00:00.000Z"),
            status: "ACTIVE",
          },
        })

      const smallSession = await createSession("Scale Small Session", "SCALE-SMALL-2026")
      await seedLessons(smallSession.id, 36)
      const mediumSession = await createSession("Scale Medium Session", "SCALE-MEDIUM-2026")
      await seedLessons(mediumSession.id, 500)

      const sizes: { label: string; sessionId: string }[] = [
        { label: "36", sessionId: smallSession.id },
        { label: "500", sessionId: mediumSession.id },
        { label: "1000", sessionId: fixtures.primarySessionId },
      ]

      console.log(
        `[timetable-scale][perf] env node=${process.version} platform=${process.platform} ` +
          `cpus=${os.cpus().length}`,
      )

      for (const { label, sessionId } of sizes) {
        const url = `/api/v1/timetable?academicSessionId=${sessionId}`
        for (let warm = 0; warm < 5; warm += 1) await adminAgent.get(url)

        const times: number[] = []
        let bytes = 0
        for (let i = 0; i < 100; i += 1) {
          const started = performance.now()
          const res = await adminAgent.get(url)
          times.push(performance.now() - started)
          if (i === 0) bytes = Buffer.byteLength(JSON.stringify(res.body))
        }
        times.sort((a, b) => a - b)
        const median = times[Math.floor(times.length / 2)]
        const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))]
        console.log(
          `[timetable-scale][perf] ${label.padStart(4)} lessons: median ${median.toFixed(1)}ms ` +
            `p95 ${p95.toFixed(1)}ms payload ${(bytes / 1024).toFixed(1)} KiB`,
        )
      }
    }, 120_000)
  })
})
