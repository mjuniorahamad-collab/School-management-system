import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const adminPassword = "dashboard-admin-secret-123"

interface Fixtures {
  schoolAId: string
  schoolBId: string
  activeSessionAId: string
  closedSessionAId: string
  activeSessionBId: string
  class6Id: string
  class7Id: string
  class8Id: string
  sectionA6Id: string
  sectionA7Id: string
  sectionA8Id: string
  studentA1: { id: string; admissionNumber: string }
  studentA2: { id: string; admissionNumber: string }
  studentA3: { id: string; admissionNumber: string }
  studentB1: { id: string; admissionNumber: string }
  enrollmentA1Id: string
  enrollmentA2Id: string
  enrollmentA3Id: string
}

const fixtures: Fixtures = {
  schoolAId: "",
  schoolBId: "",
  activeSessionAId: "",
  closedSessionAId: "",
  activeSessionBId: "",
  class6Id: "",
  class7Id: "",
  class8Id: "",
  sectionA6Id: "",
  sectionA7Id: "",
  sectionA8Id: "",
  studentA1: { id: "", admissionNumber: "" },
  studentA2: { id: "", admissionNumber: "" },
  studentA3: { id: "", admissionNumber: "" },
  studentB1: { id: "", admissionNumber: "" },
  enrollmentA1Id: "",
  enrollmentA2Id: "",
  enrollmentA3Id: "",
}

describe.skipIf(!TEST_DATABASE_URL)("Dashboard API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const adminAgentB = request.agent(app)
  const viewerAgent = request.agent(app)

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

    // ── School A ────────────────────────────────────────────────────────────
    const schoolA = await prisma.school.create({ data: { name: "Dashboard School A" } })
    fixtures.schoolAId = schoolA.id

    const sessionClosedA = await prisma.academicSession.create({
      data: {
        schoolId: schoolA.id,
        name: "2025-26",
        code: "AY2025",
        startDate: new Date("2025-04-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        status: "CLOSED",
      },
    })
    fixtures.closedSessionAId = sessionClosedA.id
    const sessionActiveA = await prisma.academicSession.create({
      data: {
        schoolId: schoolA.id,
        name: "2026-27",
        code: "AY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.activeSessionAId = sessionActiveA.id

    const [class6, class7, class8] = await Promise.all([
      prisma.class.create({ data: { schoolId: schoolA.id, name: "6", sortOrder: 6 } }),
      prisma.class.create({ data: { schoolId: schoolA.id, name: "7", sortOrder: 7 } }),
      prisma.class.create({ data: { schoolId: schoolA.id, name: "8", sortOrder: 8 } }),
    ])
    fixtures.class6Id = class6.id
    fixtures.class7Id = class7.id
    fixtures.class8Id = class8.id

    const section6 = await prisma.section.create({ data: { classId: class6.id, name: "A" } })
    const section7 = await prisma.section.create({ data: { classId: class7.id, name: "A" } })
    const section8 = await prisma.section.create({ data: { classId: class8.id, name: "A" } })
    fixtures.sectionA6Id = section6.id
    fixtures.sectionA7Id = section7.id
    fixtures.sectionA8Id = section8.id

    await prisma.examType.create({ data: { schoolId: schoolA.id, code: "TERM1", name: "Term 1" } })

    // Six ACTIVE students for school A (two per class 6/7/8).
    const studentSeeds: { first: string; last: string; gender: "MALE" | "FEMALE"; dob: string }[] = [
      { first: "Ada", last: "Lovelace", gender: "FEMALE", dob: "2015-04-01" },
      { first: "Bo", last: "Babbage", gender: "MALE", dob: "2015-05-01" },
      { first: "Ada", last: "Byron", gender: "FEMALE", dob: "2014-06-01" },
      { first: "Bo", last: "Dijkstra", gender: "MALE", dob: "2014-07-01" },
      { first: "Cyra", last: "Hopper", gender: "FEMALE", dob: "2013-08-01" },
      { first: "Don", last: "Knuth", gender: "MALE", dob: "2013-09-01" },
    ]
    const studentsA = await Promise.all(
      studentSeeds.map((seed, i) =>
        prisma.student.create({
          data: {
            schoolId: schoolA.id,
            admissionNumber: `ADM-A-${String(i + 1).padStart(4, "0")}`,
            firstName: seed.first,
            lastName: seed.last,
            dateOfBirth: new Date(`${seed.dob}T00:00:00.000Z`),
            gender: seed.gender,
            status: "ACTIVE",
            admissionDate: new Date("2026-04-01T00:00:00.000Z"),
          },
        }),
      ),
    )
    fixtures.studentA1 = { id: studentsA[0].id, admissionNumber: studentsA[0].admissionNumber }
    fixtures.studentA2 = { id: studentsA[1].id, admissionNumber: studentsA[1].admissionNumber }
    fixtures.studentA3 = { id: studentsA[2].id, admissionNumber: studentsA[2].admissionNumber }

    const enrollmentsA = await Promise.all([
      prisma.studentEnrollment.create({
        data: {
          studentId: studentsA[0].id,
          academicSessionId: sessionActiveA.id,
          classId: class6.id,
          sectionId: section6.id,
        },
      }),
      prisma.studentEnrollment.create({
        data: {
          studentId: studentsA[1].id,
          academicSessionId: sessionActiveA.id,
          classId: class6.id,
          sectionId: section6.id,
        },
      }),
      prisma.studentEnrollment.create({
        data: {
          studentId: studentsA[2].id,
          academicSessionId: sessionActiveA.id,
          classId: class7.id,
          sectionId: section7.id,
        },
      }),
      prisma.studentEnrollment.create({
        data: {
          studentId: studentsA[3].id,
          academicSessionId: sessionActiveA.id,
          classId: class7.id,
          sectionId: section7.id,
        },
      }),
      prisma.studentEnrollment.create({
        data: {
          studentId: studentsA[4].id,
          academicSessionId: sessionActiveA.id,
          classId: class8.id,
          sectionId: section8.id,
        },
      }),
      prisma.studentEnrollment.create({
        data: {
          studentId: studentsA[5].id,
          academicSessionId: sessionActiveA.id,
          classId: class8.id,
          sectionId: section8.id,
        },
      }),
    ])
    fixtures.enrollmentA1Id = enrollmentsA[0].id
    fixtures.enrollmentA2Id = enrollmentsA[1].id
    fixtures.enrollmentA3Id = enrollmentsA[2].id

    // ── School B (tenant-isolation control) ─────────────────────────────────
    const schoolB = await prisma.school.create({ data: { name: "Dashboard School B" } })
    fixtures.schoolBId = schoolB.id

    const sessionActiveB = await prisma.academicSession.create({
      data: {
        schoolId: schoolB.id,
        name: "2026-27",
        code: "AY2026-B",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.activeSessionBId = sessionActiveB.id

    const class9 = await prisma.class.create({ data: { schoolId: schoolB.id, name: "9", sortOrder: 9 } })
    const studentB = await prisma.student.create({
      data: {
        schoolId: schoolB.id,
        admissionNumber: "ADM-B-0001",
        firstName: "Rival",
        lastName: "School",
        dateOfBirth: new Date("2013-01-01T00:00:00.000Z"),
        gender: "OTHER",
        status: "ACTIVE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    })
    fixtures.studentB1 = { id: studentB.id, admissionNumber: studentB.admissionNumber }
    await prisma.studentEnrollment.create({
      data: {
        studentId: studentB.id,
        academicSessionId: sessionActiveB.id,
        classId: class9.id,
      },
    })

    // ── Auth principals ─────────────────────────────────────────────────────
    await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Dashboard super admin" } })
    const viewerRole = await prisma.role.create({ data: { name: "DASHBOARD_VIEWER", description: "No dashboard:view" } })

    await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        name: "Dashboard Admin A",
        email: "dashboard.admin@example.com",
        passwordHash: hashPassword(adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.user.create({
      data: {
        schoolId: schoolB.id,
        name: "Dashboard Admin B",
        email: "dashboard.admin.b@example.com",
        passwordHash: hashPassword("dashboard-admin-b-secret"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        name: "Dashboard Viewer",
        email: "dashboard.viewer@example.com",
        passwordHash: hashPassword("dashboard-viewer-secret"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: viewerRole.id } } }] },
      },
    })

    await login(adminAgent, "dashboard.admin@example.com", adminPassword)
    await login(adminAgentB, "dashboard.admin.b@example.com", "dashboard-admin-b-secret")
    await login(viewerAgent, "dashboard.viewer@example.com", "dashboard-viewer-secret")
  }, 120_000)

  afterEach(async () => {
    await prisma.attendanceRecord.deleteMany()
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeReceipt" CASCADE')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeePayment" CASCADE')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInstallment" CASCADE')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamMark" CASCADE')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamResult" CASCADE')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamSubject" CASCADE')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Exam" CASCADE')
    await prisma.notice.deleteMany()
    await prisma.event.deleteMany()
  }, 60_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  describe("auth & RBAC guard", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get("/api/v1/dashboard/stats")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("rejects a role without the dashboard:view permission", async () => {
      const res = await viewerAgent.get("/api/v1/dashboard/stats")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("stats", () => {
    it("returns the four headline stats scoped to the current school", async () => {
      const res = await adminAgent.get("/api/v1/dashboard/stats")
      expect(res.status).toBe(200)
      const stats = res.body.data.stats
      expect(stats).toHaveLength(4)

      const byId = new Map(stats.map((s: { id: string }) => [s.id, s]))
      expect(byId.get("total-students").value).toBe("6")
      expect(byId.get("total-classes").value).toBe("3")
      expect(byId.get("total-teachers").value).toBe("0")
      expect(byId.get("fees-collection").value).toBe("₹0")
      expect(typeof byId.get("total-students").trendPercent).toBe("number")
    })
  })

  describe("attendance", () => {
    it("aggregates attendance for the requested period", async () => {
      await createAttendance(
        {
          enrollmentId: fixtures.enrollmentA1Id,
          studentId: fixtures.studentA1.id,
          status: "PRESENT",
        },
        {
          enrollmentId: fixtures.enrollmentA2Id,
          studentId: fixtures.studentA2.id,
          status: "LATE",
        },
        {
          enrollmentId: fixtures.enrollmentA3Id,
          studentId: fixtures.studentA3.id,
          status: "ABSENT",
        },
      )

      const res = await adminAgent.get("/api/v1/dashboard/attendance?period=today")
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        total: 3,
        present: 2,
        late: 1,
        absent: 1,
        average: 67,
      })
    })

    it("defaults the period to today", async () => {
      await createAttendance({
        enrollmentId: fixtures.enrollmentA1Id,
        studentId: fixtures.studentA1.id,
        status: "PRESENT",
      })
      const res = await adminAgent.get("/api/v1/dashboard/attendance")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(1)
    })

    it("rejects an unknown period", async () => {
      const res = await adminAgent.get("/api/v1/dashboard/attendance?period=all-time")
      expect(res.status).toBe(400)
    })
  })

  describe("fee collection status", () => {
    it("returns zeros when the school has no invoices in the active session", async () => {
      const res = await adminAgentB.get("/api/v1/dashboard/fee-status")
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ collected: 0, pending: 0, total: 0 })
    })

    it("computes collected and pending against active-session invoices", async () => {
      const invoice = await prisma.feeInvoice.create({
        data: {
          schoolId: fixtures.schoolAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          sessionId: fixtures.activeSessionAId,
          invoiceNumber: "INV-DSH-0001",
          className: "6",
          sectionName: "A",
          sessionName: "2026-27",
          totalAmount: 10000,
          items: [],
        },
      })
      await prisma.feePayment.create({
        data: {
          schoolId: fixtures.schoolAId,
          invoiceId: invoice.id,
          paymentNumber: "PAY-DSH-0001",
          amount: 2500,
          method: "CASH",
          paymentDate: new Date(),
        },
      })

      const res = await adminAgent.get("/api/v1/dashboard/fee-status")
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ collected: 2500, pending: 7500, total: 10000 })
    })
  })

  describe("top classes", () => {
    it("ranks classes within one comparable finalized exam context", async () => {
      await createFinalExamContext(fixtures.activeSessionAId, [
        { className: "6", classId: fixtures.class6Id, sectionId: fixtures.sectionA6Id, students: [85, 90] },
        { className: "7", classId: fixtures.class7Id, sectionId: fixtures.sectionA7Id, students: [70, 60] },
      ])

      const res = await adminAgent.get("/api/v1/dashboard/top-classes")
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.classes).toEqual([
        { rank: 1, name: "6", performance: 87.5, students: 2 },
        { rank: 2, name: "7", performance: 65, students: 2 },
      ])
      expect(data.context).toEqual({
        examName: "Term 1",
        academicSessionName: "2026-27",
        from: expect.any(String),
        to: expect.any(String),
      })
    })

    it("prefers the context with the most participating classes", async () => {
      // Older context (closed session) with two classes.
      await createFinalExamContext(fixtures.closedSessionAId, [
        { className: "6", classId: fixtures.class6Id, sectionId: fixtures.sectionA6Id, students: [95, 95] },
        { className: "7", classId: fixtures.class7Id, sectionId: fixtures.sectionA7Id, students: [95, 95] },
      ])
      // Newer context (active session) with three classes — must win.
      await createFinalExamContext(fixtures.activeSessionAId, [
        { className: "6", classId: fixtures.class6Id, sectionId: fixtures.sectionA6Id, students: [80, 90] },
        { className: "7", classId: fixtures.class7Id, sectionId: fixtures.sectionA7Id, students: [70, 60] },
        { className: "8", classId: fixtures.class8Id, sectionId: fixtures.sectionA8Id, students: [50, 55] },
      ])

      const res = await adminAgent.get("/api/v1/dashboard/top-classes")
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.context.academicSessionName).toBe("2026-27")
      expect(data.classes).toEqual([
        { rank: 1, name: "6", performance: 85, students: 2 },
        { rank: 2, name: "7", performance: 65, students: 2 },
        { rank: 3, name: "8", performance: 52.5, students: 2 },
      ])
    })

    it("returns an empty result when no comparable context exists", async () => {
      await createFinalExam("solo-class", fixtures.closedSessionAId, fixtures.class6Id, fixtures.sectionA6Id)

      const res = await adminAgent.get("/api/v1/dashboard/top-classes")
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ context: null, classes: [] })
    })
  })

  describe("events & notices", () => {
    it("exposes only future scheduled events", async () => {
      await prisma.event.createMany({
        data: [
          {
            schoolId: fixtures.schoolAId,
            title: "Sports Day",
            category: "SPORTS",
            status: "SCHEDULED",
            startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          },
          {
            schoolId: fixtures.schoolAId,
            title: "Past Meet",
            category: "ACADEMIC",
            status: "SCHEDULED",
            startAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
          },
          {
            schoolId: fixtures.schoolAId,
            title: "Live Fair",
            category: "CULTURAL",
            status: "ONGOING",
            startAt: new Date(Date.now() + 60 * 60 * 1000),
            endAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
          },
        ],
      })

      const res = await adminAgent.get("/api/v1/dashboard/events")
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([
        { id: expect.any(String), title: "Sports Day", date: expect.any(String), time: expect.any(String), category: "sports" },
      ])
    })

    it("exposes only published notices with lowercased priority", async () => {
      await prisma.notice.createMany({
        data: [
          {
            schoolId: fixtures.schoolAId,
            title: "Fee Reminder",
            body: "Second installment due.",
            priority: "HIGH",
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
          {
            schoolId: fixtures.schoolAId,
            title: "Draft Note",
            body: "Not ready.",
            priority: "HIGH",
            status: "DRAFT",
          },
          {
            schoolId: fixtures.schoolAId,
            title: "Picnic",
            body: "Annual picnic postponed.",
            priority: "LOW",
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        ],
      })

      const res = await adminAgent.get("/api/v1/dashboard/notices")
      expect(res.status).toBe(200)
      const notices = res.body.data
      expect(notices).toHaveLength(2)
      expect(notices.map((n: { title: string }) => n.title).sort()).toEqual(["Fee Reminder", "Picnic"])
      expect(notices.every((n: { priority: string }) => ["high", "medium", "low"].includes(n.priority))).toBe(true)
    })
  })

  describe("tenant isolation", () => {
    it("never blends another school's attendance into the aggregates", async () => {
      const schoolBClass = await prisma.class.findFirst({ where: { schoolId: fixtures.schoolBId } })
      const enrollmentB = await prisma.studentEnrollment.findFirst({
        where: { studentId: fixtures.studentB1.id },
      })
      await prisma.attendanceRecord.create({
        data: {
          schoolId: fixtures.schoolBId,
          academicSessionId: fixtures.activeSessionBId,
          classId: schoolBClass!.id,
          studentId: fixtures.studentB1.id,
          enrollmentId: enrollmentB!.id,
          date: new Date(),
          status: "PRESENT",
        },
      })

      // School A sees its own (empty) attendance totals, not school B's record.
      const res = await adminAgent.get("/api/v1/dashboard/attendance?period=today")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)

      // School B sees exactly its single record.
      const resB = await adminAgentB.get("/api/v1/dashboard/attendance?period=today")
      expect(resB.status).toBe(200)
      expect(resB.body.data.total).toBe(1)
    })

    it("scopes stats to the authenticated school", async () => {
      const resB = await adminAgentB.get("/api/v1/dashboard/stats")
      expect(resB.status).toBe(200)
      const byIdB = new Map(resB.body.data.stats.map((s: { id: string }) => [s.id, s]))
      expect(byIdB.get("total-students").value).toBe("1")
      expect(byIdB.get("total-classes").value).toBe("1")

      const resA = await adminAgent.get("/api/v1/dashboard/stats")
      const byIdA = new Map(resA.body.data.stats.map((s: { id: string }) => [s.id, s]))
      expect(byIdA.get("total-students").value).toBe("6")
    })
  })

  async function createAttendance(...records: { enrollmentId: string; studentId: string; status: "PRESENT" | "LATE" | "ABSENT" }[]) {
    await prisma.attendanceRecord.createMany({
      data: records.map((r, i) => ({
        schoolId: fixtures.schoolAId,
        academicSessionId: fixtures.activeSessionAId,
        classId: fixtures.class6Id,
        date: new Date(Date.now() - i * 1000),
        ...r,
      })),
    })
  }

  async function createFinalExamContext(
    sessionId: string,
    classes: { className: string; classId: string; sectionId: string; students: number[] }[],
  ) {
    for (const cls of classes) {
      const exam = await createFinalExam("Term 1", sessionId, cls.classId, cls.sectionId)
      const students = await prisma.studentEnrollment.findMany({
        where: { academicSessionId: sessionId, classId: cls.classId },
        select: { id: true, studentId: true },
      })
      for (let i = 0; i < students.length; i++) {
        await prisma.examResult.create({
          data: {
            schoolId: fixtures.schoolAId,
            examId: exam.id,
            studentId: students[i].studentId,
            enrollmentId: students[i].id,
            totalObtained: 50,
            totalMaxMarks: 50,
            totalPercentage: cls.students[i],
            isPass: true,
            isComplete: true,
          },
        })
      }
    }
  }

  async function createFinalExam(examName: string, sessionId: string, classId: string, sectionId: string) {
    const examType = await prisma.examType.findFirst({ where: { schoolId: fixtures.schoolAId } })
    return prisma.exam.create({
      data: {
        schoolId: fixtures.schoolAId,
        academicSessionId: sessionId,
        examTypeId: examType!.id,
        name: examName,
        classId,
        sectionId,
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: new Date("2026-06-05T00:00:00.000Z"),
        status: "FINAL",
        finalizedAt: new Date(),
      },
    })
  }
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeReceipt" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeePayment" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInstallment" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeStructureItem" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeStructure" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeHead" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamMark" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamResult" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamSubject" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Exam" CASCADE')
  await prisma.homeworkSubmission.deleteMany()
  await prisma.assignmentSubmission.deleteMany()
  await prisma.homework.deleteMany()
  await prisma.assignment.deleteMany()
  await prisma.notice.deleteMany()
  await prisma.event.deleteMany()
  await prisma.admissionApplication.deleteMany()
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
  await prisma.examType.deleteMany()
  await prisma.gradingBand.deleteMany()
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