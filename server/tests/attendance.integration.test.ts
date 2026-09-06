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
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  sessionId: "",
  classId: "",
  sectionId: "",
  adminPassword: "attendance-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Attendance API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const teacherAgent = request.agent(app)

  const studentA = { id: "", admissionNumber: "" }
  const studentB = { id: "", admissionNumber: "" }

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

    const school = await prisma.school.create({ data: { name: "Attendance School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Attendance Year",
        code: "AY2026",
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

    // Two enrolled students created directly (enrollment is the attendance anchor).
    const sA = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "ADM-2026-0001",
        firstName: "Ada",
        lastName: "Lovelace",
        dateOfBirth: new Date("2015-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        status: "ACTIVE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    })
    studentA.id = sA.id
    studentA.admissionNumber = sA.admissionNumber
    await prisma.studentEnrollment.create({
      data: {
        studentId: sA.id,
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
      },
    })

    const sB = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "ADM-2026-0002",
        firstName: "Bo",
        lastName: "Babbage",
        dateOfBirth: new Date("2015-06-01T00:00:00.000Z"),
        gender: "MALE",
        status: "ACTIVE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    })
    studentB.id = sB.id
    studentB.admissionNumber = sB.admissionNumber
    await prisma.studentEnrollment.create({
      data: {
        studentId: sB.id,
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
      },
    })

    await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })

    await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Attendance Admin",
        email: "attendance.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })

    await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Attendance Teacher",
        email: "attendance.teacher@example.com",
        passwordHash: hashPassword("teacher-secret-123"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: teacherRole.id } } }] },
      },
    })

    await login(adminAgent, "attendance.admin@example.com", fixtures.adminPassword)
    await login(teacherAgent, "attendance.teacher@example.com", "teacher-secret-123")
  })

  afterEach(async () => {
    await prisma.attendanceRecord.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  function markPayload(studentId: string, overrides: Record<string, unknown> = {}) {
    return {
      academicSessionId: fixtures.sessionId,
      classId: fixtures.classId,
      sectionId: fixtures.sectionId,
      date: "2026-05-01",
      studentId,
      status: "PRESENT",
      ...overrides,
    }
  }

  describe("index", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/attendance")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("returns an empty list before any records exist", async () => {
      const res = await adminAgent.get("/api/v1/attendance")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it("denies a role without the attendance:view permission", async () => {
      const res = await teacherAgent.get("/api/v1/attendance")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("mark", () => {
    it("marks a student present with snapshotted class/section", async () => {
      const res = await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id))
      expect(res.status).toBe(201)
      const data = res.body.data
      expect(data.status).toBe("PRESENT")
      expect(data.studentId).toBe(studentA.id)
      expect(data.className).toBe("6")
      expect(data.sectionName).toBe("A")
      expect(data.academicSessionId).toBe(fixtures.sessionId)
    })

    it("upserts an existing record for the same student+date instead of duplicating", async () => {
      await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id, { status: "PRESENT" }))
      await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id, { status: "ABSENT" }))
      const res = await adminAgent.get(`/api/v1/attendance?studentId=${studentA.id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(1)
      expect(res.body.data.items[0].status).toBe("ABSENT")
    })

    it("rejects a student that is not enrolled in this class", async () => {
      const otherStudent = await prisma.student.create({
        data: {
          schoolId: fixtures.schoolId,
          admissionNumber: "ADM-2026-0003",
          firstName: "Cara",
          lastName: "C",
          dateOfBirth: new Date("2015-07-01T00:00:00.000Z"),
          gender: "FEMALE",
          status: "ACTIVE",
          admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        },
      })
      // Enrolled in a different class (7, no section match).
      const otherClass = await prisma.class.create({
        data: { schoolId: fixtures.schoolId, name: "7", sortOrder: 7 },
      })
      await prisma.studentEnrollment.create({
        data: {
          studentId: otherStudent.id,
          academicSessionId: fixtures.sessionId,
          classId: otherClass.id,
          sectionId: null,
        },
      })
      const res = await adminAgent.post("/api/v1/attendance").send(markPayload(otherStudent.id))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects an unenrolled student", async () => {
      const unenrolled = await prisma.student.create({
        data: {
          schoolId: fixtures.schoolId,
          admissionNumber: "ADM-2026-0004",
          firstName: "Dana",
          lastName: "D",
          dateOfBirth: new Date("2015-08-01T00:00:00.000Z"),
          gender: "FEMALE",
          status: "ACTIVE",
          admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        },
      })
      const res = await adminAgent.post("/api/v1/attendance").send(markPayload(unenrolled.id))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })
  })

  describe("bulk", () => {
    it("marks multiple students in one request", async () => {
      const res = await adminAgent.post("/api/v1/attendance/bulk").send({
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        date: "2026-05-02",
        records: [
          { studentId: studentA.id, status: "PRESENT" },
          { studentId: studentB.id, status: "ABSENT", note: "field trip" },
        ],
      })
      expect(res.status).toBe(200)
      expect(res.body.data.marked).toBe(2)
      const list = await adminAgent.get("/api/v1/attendance?dateFrom=2026-05-02&dateTo=2026-05-02")
      expect(list.body.data.items).toHaveLength(2)
    })
  })

  describe("summary", () => {
    it("computes per-student totals and percentage over a date range", async () => {
      await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id, { date: "2026-05-01", status: "PRESENT" }))
      await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id, { date: "2026-05-02", status: "ABSENT" }))
      await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id, { date: "2026-05-03", status: "LATE" }))
      await adminAgent.post("/api/v1/attendance").send(markPayload(studentB.id, { date: "2026-05-01", status: "PRESENT" }))

      const res = await adminAgent.get("/api/v1/attendance/summary").query({
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        dateFrom: "2026-05-01",
        dateTo: "2026-05-03",
      })
      expect(res.status).toBe(200)
      console.log("SUMMARY RESPONSE", JSON.stringify(res.body.data))
      expect(res.body.data.totalDays).toBe(3)
      const items = res.body.data.items as Array<{
        studentId: string
        present: number
        absent: number
        late: number
        attendancePercent: number
      }>
      const a = items.find((i) => i.studentId === studentA.id)!
      expect(a.present).toBe(1)
      expect(a.absent).toBe(1)
      expect(a.late).toBe(1)
      expect(a.attendancePercent).toBe(66.67) // (1 present + 1 late) / 3
      const b = items.find((i) => i.studentId === studentB.id)!
      expect(b.present).toBe(1)
    })
  })

  describe("detail / update / delete", () => {
    it("gets a record by id", async () => {
      const created = await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id))
      const id = created.body.data.id
      const res = await adminAgent.get(`/api/v1/attendance/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(id)
    })

    it("updates a record's status", async () => {
      const created = await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id, { status: "PRESENT" }))
      const id = created.body.data.id
      const res = await adminAgent.patch(`/api/v1/attendance/${id}`).send({ status: "LATE" })
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("LATE")
    })

    it("deletes a record", async () => {
      const created = await adminAgent.post("/api/v1/attendance").send(markPayload(studentA.id))
      const id = created.body.data.id
      const res = await adminAgent.delete(`/api/v1/attendance/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const after = await adminAgent.get(`/api/v1/attendance/${id}`)
      expect(after.status).toBe(404)
    })

    it("returns 404 for an unknown record", async () => {
      const res = await adminAgent.get("/api/v1/attendance/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
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
