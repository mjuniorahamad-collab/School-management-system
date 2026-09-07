import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

interface Fixtures {
  schoolId: string
  sessionId: string
  classId: string
  sectionId: string
  subjectId: string
  teacherId: string
  periodSlotId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  sessionId: "",
  classId: "",
  sectionId: "",
  subjectId: "",
  teacherId: "",
  periodSlotId: "",
  adminPassword: "timetable-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Timetable API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const teacherAgent = request.agent(app)

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

    const school = await prisma.school.create({ data: { name: "Timetable School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Timetable Year",
        code: "TY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    const cls = await prisma.class.create({
      data: { schoolId: school.id, name: "6", sortOrder: 6 },
    })
    fixtures.classId = cls.id
    const section = await prisma.section.create({ data: { classId: cls.id, name: "A" } })
    fixtures.sectionId = section.id

    const subject = await prisma.subject.create({
      data: { schoolId: school.id, code: "MAT", name: "Mathematics" },
    })
    fixtures.subjectId = subject.id

    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "T-TT-0001",
        firstName: "Tim",
        lastName: "Timetable",
        gender: "MALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.teacherId = teacher.id

    const slot = await prisma.periodSlot.create({
      data: {
        schoolId: school.id,
        name: "Period 1",
        startTime: "08:00",
        endTime: "08:45",
        sortOrder: 1,
      },
    })
    fixtures.periodSlotId = slot.id

    await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })

    await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Timetable Admin",
        email: "timetable.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })

    await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Timetable Teacher",
        email: "timetable.teacher@example.com",
        passwordHash: hashPassword("teacher-secret-123"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: teacherRole.id } } }] },
      },
    })

    await login(adminAgent, "timetable.admin@example.com", fixtures.adminPassword)
    await login(teacherAgent, "timetable.teacher@example.com", "teacher-secret-123")
  })

  afterEach(async () => {
    await prisma.timetableEntry.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  function entryPayload(overrides: Record<string, unknown> = {}) {
    return {
      academicSessionId: fixtures.sessionId,
      dayOfWeek: "MONDAY",
      periodSlotId: fixtures.periodSlotId,
      classId: fixtures.classId,
      sectionId: fixtures.sectionId,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      ...overrides,
    }
  }

  describe("index", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/timetable")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("returns an empty list before any entries exist", async () => {
      const res = await adminAgent.get("/api/v1/timetable")
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it("denies a role without the timetable:view permission", async () => {
      const res = await teacherAgent.get("/api/v1/timetable")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("create", () => {
    it("creates a timetable entry with nested names", async () => {
      const res = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.dayOfWeek).toBe("MONDAY")
      expect(data.periodSlotName).toBe("Period 1")
      expect(data.className).toBe("6")
      expect(data.sectionName).toBe("A")
      expect(data.subjectName).toBe("Mathematics")
      expect(data.teacherName).toBe("Tim Timetable")
    })

    it("allows a whole-class entry with sectionId null", async () => {
      const res = await adminAgent.post("/api/v1/timetable").send(entryPayload({ sectionId: null }))
      expect(res.status).toBe(201)
      expect(res.body.data.sectionName).toBeNull()
    })

    it("rejects a section that does not belong to the class", async () => {
      const foreignSection = await prisma.section.create({
        data: {
          classId: (
            await prisma.class.create({ data: { schoolId: fixtures.schoolId, name: "7", sortOrder: 7 } })
          ).id,
          name: "B",
        },
      })
      const res = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ sectionId: foreignSection.id }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects a foreign-key reference (unknown subject)", async () => {
      const res = await adminAgent
        .post("/api/v1/timetable")
        .send(
          entryPayload({ subjectId: "ffffffff-ffff-ffff-ffff-ffffffffffff" }),
        )
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects a duplicate class+period on the same day with a conflict message", async () => {
      await adminAgent.post("/api/v1/timetable").send(
        entryPayload({ subjectId: (
          await prisma.subject.create({ data: { schoolId: fixtures.schoolId, code: "ENG", name: "English" } })
        ).id }),
      )
      const res = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/class/i)
    })

    it("rejects a duplicate teacher+period on the same day", async () => {
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const otherClass = await prisma.class.create({
        data: { schoolId: fixtures.schoolId, name: "8", sortOrder: 8 },
      })
      const res = await adminAgent.post("/api/v1/timetable").send(
        entryPayload({ classId: otherClass.id, sectionId: null }),
      )
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/teacher/i)
    })
  })

  describe("detail / get", () => {
    it("gets an entry by id with nested names", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      const res = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(id)
      expect(res.body.data.teacherName).toBe("Tim Timetable")
    })

    it("returns 404 for an unknown id", async () => {
      const res = await adminAgent.get("/api/v1/timetable/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("update", () => {
    it("moves an entry to another day", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      const res = await adminAgent.patch(`/api/v1/timetable/${id}`).send({ dayOfWeek: "FRIDAY" })
      expect(res.status).toBe(200)
      expect(res.body.data.dayOfWeek).toBe("FRIDAY")
    })

    it("returns 404 when updating an unknown entry", async () => {
      const res = await adminAgent
        .patch("/api/v1/timetable/ffffffff-ffff-ffff-ffff-ffffffffffff")
        .send({ dayOfWeek: "FRIDAY" })
      expect(res.status).toBe(404)
    })
  })

  describe("delete", () => {
    it("deletes an entry", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      const res = await adminAgent.delete(`/api/v1/timetable/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const after = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(after.status).toBe(404)
    })

    it("returns 204 idempotently only when the entry exists", async () => {
      const res = await adminAgent.delete("/api/v1/timetable/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
    })
  })

  describe("copy-day", () => {
    it("copies entries from one day to another and reports the count", async () => {
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const res = await adminAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "TUESDAY",
      })
      expect(res.status).toBe(200)
      expect(res.body.data.copied).toBe(1)
      const tuesday = await adminAgent.get("/api/v1/timetable?dayOfWeek=TUESDAY")
      expect(tuesday.body.data.total).toBe(1)
    })

    it("rejects copying a day onto itself", async () => {
      const res = await adminAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "MONDAY",
      })
      expect(res.status).toBe(400)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.teacher.deleteMany()
  await prisma.subject.deleteMany()
  await prisma.section.deleteMany()
  await prisma.class.deleteMany()
  await prisma.session.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.tenantMembership.deleteMany()
  await prisma.academicSession.deleteMany()
  await prisma.user.deleteMany()
  await prisma.rolePermission.deleteMany()
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
  await prisma.school.deleteMany()
}

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}
