import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.js"
import { resetTestDatabase } from "./helpers/reset-test-database.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const adminPassword = "dashboard-admin-secret-123"

const TEST_ADMIN_A_EMAIL = "dashboard.admin@example.com"
const TEST_ADMIN_A_PASS = adminPassword
const TEST_ADMIN_B_EMAIL = "dashboard.admin.b@example.com"
const TEST_ADMIN_B_PASS = "dashboard-admin-b-secret"
const TEST_ADMIN_C_EMAIL = "dashboard.admin.c@example.com"
const TEST_ADMIN_C_PASS = "dashboard-admin-c-secret"

// Sessions created by per-test fee regression setups (never part of the shared
// beforeAll fixtures) are tracked here and removed after every test, once the
// fee tables that reference them have been truncated.
const extraSessionIds: string[] = []

interface Fixtures {
  schoolAId: string
  schoolBId: string
  schoolCId: string
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
  schoolCId: "",
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
  const adminAgentC = request.agent(app)
  const viewerAgent = request.agent(app)

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")


    prisma = new PrismaClient()
    await resetTestDatabase(prisma)

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
    const superAdminRole = await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Dashboard super admin" } })
    const viewerRole = await prisma.role.create({ data: { name: "DASHBOARD_VIEWER", description: "No dashboard:view" } })

    const adminAUser = await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        name: "Dashboard Admin A",
        email: "dashboard.admin@example.com",
        passwordHash: hashPassword(adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({ data: { userId: adminAUser.id, schoolId: schoolA.id, roleId: superAdminRole.id, status: "ACTIVE" } })
    const adminBUser = await prisma.user.create({
      data: {
        schoolId: schoolB.id,
        name: "Dashboard Admin B",
        email: "dashboard.admin.b@example.com",
        passwordHash: hashPassword("dashboard-admin-b-secret"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({ data: { userId: adminBUser.id, schoolId: schoolB.id, roleId: superAdminRole.id, status: "ACTIVE" } })
    const viewerUser = await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        name: "Dashboard Viewer",
        email: "dashboard.viewer@example.com",
        passwordHash: hashPassword("dashboard-viewer-secret"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: viewerRole.id } } }] },
      },
    })
    await prisma.tenantMembership.create({ data: { userId: viewerUser.id, schoolId: schoolA.id, roleId: viewerRole.id, status: "ACTIVE" } })

    // ── School C (empty-data control: a school with NO academic sessions) ───
    const schoolC = await prisma.school.create({ data: { name: "Dashboard School C" } })
    fixtures.schoolCId = schoolC.id

    const adminCUser = await prisma.user.create({
      data: {
        schoolId: schoolC.id,
        name: "Dashboard Admin C",
        email: TEST_ADMIN_C_EMAIL,
        passwordHash: hashPassword(TEST_ADMIN_C_PASS),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({ data: { userId: adminCUser.id, schoolId: schoolC.id, roleId: superAdminRole.id, status: "ACTIVE" } })

    await login(adminAgent, TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
    await login(adminAgentB, TEST_ADMIN_B_EMAIL, TEST_ADMIN_B_PASS)
    await login(adminAgentC, TEST_ADMIN_C_EMAIL, TEST_ADMIN_C_PASS)
    await login(viewerAgent, "dashboard.viewer@example.com", "dashboard-viewer-secret")
  }, 120_000)

  afterEach(async () => {
    vi.useRealTimers()
    await prisma.attendanceRecord.deleteMany()
    await resetDashboardTransientTables(prisma)
    await prisma.notice.deleteMany()
    await prisma.event.deleteMany()
    await prisma.academicSession.deleteMany({ where: { id: { in: extraSessionIds } } })
    extraSessionIds.length = 0
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
          grossAmount: 10000,
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

  describe("fee analytics regression", () => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    let paymentSeq = 0
    let invoiceSeq = 0

    async function createInvoice(opts: {
      schoolId: string
      sessionId: string
      studentId: string
      enrollmentId: string
      totalAmount: number
    }) {
      invoiceSeq += 1
      return prisma.feeInvoice.create({
        data: {
          schoolId: opts.schoolId,
          studentId: opts.studentId,
          enrollmentId: opts.enrollmentId,
          sessionId: opts.sessionId,
          invoiceNumber: `INV-REGR-${invoiceSeq}-${opts.schoolId.slice(0, 4)}`,
          className: "6",
          sessionName: "2026-27",
          grossAmount: opts.totalAmount,
          totalAmount: opts.totalAmount,
          items: [],
        },
      })
    }

    async function createPayment(schoolId: string, invoiceId: string, amount: number, dateISO: string) {
      paymentSeq += 1
      return prisma.feePayment.create({
        data: {
          schoolId,
          invoiceId,
          paymentNumber: `PAY-REGR-${paymentSeq}-${schoolId.slice(0, 4)}`,
          amount,
          method: "CASH",
          paymentDate: new Date(dateISO),
        },
      })
    }

    async function createExtraSession(opts: {
      schoolId: string
      name: string
      code: string
      startDate: string
      endDate: string
      status: "ACTIVE" | "CLOSED"
    }) {
      const session = await prisma.academicSession.create({
        data: {
          schoolId: opts.schoolId,
          name: opts.name,
          code: opts.code,
          startDate: new Date(opts.startDate),
          endDate: new Date(opts.endDate),
          status: opts.status,
        },
      })
      extraSessionIds.push(session.id)
      return session
    }

    // Freezes the system clock at `iso` and returns a freshly-authenticated
    // agent whose session was created AT that frozen time. A dedicated agent
    // per frozen test is required because requireAuth rejects any session whose
    // accessExpiresAt is in the past relative to the (frozen) request time.
    async function agentAt(iso: string, email: string, password: string) {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(iso))
      const agent = request.agent(app)
      await login(agent, email, password)
      return agent
    }

    const zeroMonths = (labels: string[]) => labels.map((label) => ({ label, collected: 0 }))

    describe("session: exact total and bucket independence", () => {
      it("A. returns exactly 71,500 for the active session regardless of the current calendar month", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv1 = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 40000,
        })
        const inv2 = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA2.id,
          enrollmentId: fixtures.enrollmentA2Id,
          totalAmount: 40000,
        })
        // Nov (in window), Dec (current window month) and Aug (older). The Aug
        // payment proves the session total is NOT limited to the current month.
        await createPayment(fixtures.schoolAId, inv1.id, 30000, "2026-11-05T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv2.id, 30000, "2026-12-01T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv1.id, 11500, "2026-08-10T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(71500)

        // The session-scoped fee summary reports the same full-session metric.
        const statusRes = await agent.get("/api/v1/dashboard/fee-status")
        expect(statusRes.status).toBe(200)
        expect(statusRes.body.data.collected).toBe(71500)
        expect(statusRes.body.data.total).toBe(80000)
        expect(statusRes.body.data.pending).toBe(8500)
      })

      it("B. keeps the session total independent of the six-month display buckets", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 50000,
        })
        // Apr 2026 falls OUTSIDE the Jul–Dec 2026 display window.
        await createPayment(fixtures.schoolAId, inv.id, 10000, "2026-04-10T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 5000, "2026-11-05T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 2000, "2026-12-01T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(17000)
        expect(res.body.data.months).toEqual([
          { label: "Jul", collected: 0 },
          { label: "Aug", collected: 0 },
          { label: "Sep", collected: 0 },
          { label: "Oct", collected: 0 },
          { label: "Nov", collected: 5000 },
          { label: "Dec", collected: 2000 },
        ])
        const bucketSum = res.body.data.months.reduce((sum: number, m: { collected: number }) => sum + m.collected, 0)
        expect(bucketSum).toBe(7000)
        // The older payment contributes to the total but never renders a bar.
        expect(bucketSum).not.toBe(res.body.data.totalCollected)
      })

      it("B. equals the bucket sum when every payment lies inside the display window", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 10000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2026-07-01T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 2000, "2026-09-01T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 3000, "2026-11-01T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(6000)
        expect(res.body.data.months).toEqual([
          { label: "Jul", collected: 1000 },
          { label: "Aug", collected: 0 },
          { label: "Sep", collected: 2000 },
          { label: "Oct", collected: 0 },
          { label: "Nov", collected: 3000 },
          { label: "Dec", collected: 0 },
        ])
        const bucketSum = res.body.data.months.reduce((sum: number, m: { collected: number }) => sum + m.collected, 0)
        expect(bucketSum).toBe(res.body.data.totalCollected)
      })
    })

    describe("session: academic-session date boundaries", () => {
      it("C. attributes totals by invoice membership and buckets by payment date", async () => {
        // Frozen window is Jan–Jun 2027. The ACTIVE session A runs 2026-04-01
        // through 2027-03-31.
        const agent = await agentAt("2027-06-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 20000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2026-03-20T09:00:00.000Z") // before start
        await createPayment(fixtures.schoolAId, inv.id, 2000, "2026-04-01T09:00:00.000Z") // exactly start
        await createPayment(fixtures.schoolAId, inv.id, 4000, "2027-03-31T09:00:00.000Z") // exactly end
        await createPayment(fixtures.schoolAId, inv.id, 8000, "2027-04-05T09:00:00.000Z") // after end

        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        // All four payments are attributed to the session total: membership is
        // decided by invoice.sessionId, never by a payment-date range.
        expect(res.body.data.totalCollected).toBe(15000)
        // Buckets are decided solely by each payment's own date: only the
        // in-window Mar 2027 and Apr 2027 payments render bars.
        expect(res.body.data.months).toEqual([
          { label: "Jan", collected: 0 },
          { label: "Feb", collected: 0 },
          { label: "Mar", collected: 4000 },
          { label: "Apr", collected: 8000 },
          { label: "May", collected: 0 },
          { label: "Jun", collected: 0 },
        ])
      })
    })

    describe("year: buckets and equivalent previous-year comparison", () => {
      it("D. returns Jan–Dec buckets, exact placement, zeros, and correct YTD baseline", async () => {
        const agent = await agentAt("2026-03-31T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 100000,
        })
        // Current year-to-date (Jan 1 → Mar 31 2026).
        await createPayment(fixtures.schoolAId, inv.id, 2000, "2026-01-20T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 3000, "2026-03-31T09:00:00.000Z")
        // Future within the year: excluded from the bars and the total.
        await createPayment(fixtures.schoolAId, inv.id, 4000, "2026-06-01T09:00:00.000Z")
        // Previous-year equivalent range is Jan 1 → Mar 31 2025.
        await createPayment(fixtures.schoolAId, inv.id, 500, "2025-02-10T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2025-03-15T09:00:00.000Z")
        // Within 2025 but AFTER the equivalent date: must NOT feed the baseline.
        await createPayment(fixtures.schoolAId, inv.id, 50000, "2025-11-01T09:00:00.000Z")
        // Out of both years entirely.
        await createPayment(fixtures.schoolAId, inv.id, 90000, "2027-01-01T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=year")
        expect(res.status).toBe(200)
        const months = res.body.data.months
        expect(months).toHaveLength(12)
        expect(months.map((m: { label: string }) => m.label)).toEqual(monthNames)
        expect(months.map((m: { collected: number }) => m.collected)).toEqual([
          2000, 0, 3000, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ])
        expect(res.body.data.totalCollected).toBe(5000)
        // Baseline 1500 (500 + 1000). The Nov 2025 payment must be excluded.
        expect(res.body.data.trendPercent).toBe(233.3)
        expect(res.body.data.comparison).toBe("vs same period last year")
      })

      it("D. clamps leap-day YTD baseline to the last valid February day", async () => {
        // Frozen Feb 29 2028 (leap year) → current YTD Jan 1 → Feb 29 2028;
        // equivalent prior range Jan 1 → Feb 28 2027 (Feb 29 does not exist).
        const agent = await agentAt("2028-02-29T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 100000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2028-01-05T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 2000, "2028-02-28T09:00:00.000Z")
        // Clamped edge: Feb 28 2027 counts…
        await createPayment(fixtures.schoolAId, inv.id, 500, "2027-02-28T09:00:00.000Z")
        // …Mar 1 2027 does not.
        await createPayment(fixtures.schoolAId, inv.id, 80000, "2027-03-01T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=year")
        expect(res.status).toBe(200)
        const months = res.body.data.months
        expect(months.map((m: { collected: number }) => m.collected)).toEqual([
          1000, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ])
        expect(res.body.data.totalCollected).toBe(3000)
        expect(res.body.data.trendPercent).toBe(500)
        expect(res.body.data.comparison).toBe("vs same period last year")
      })
    })

    describe("month: day-of-month buckets and equivalent month-to-date comparison", () => {
      it("I. October 2026 renders exactly Wk 1–Wk 5 with day 29/30/31 in Wk 5", async () => {
        const agent = await agentAt("2026-10-31T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 100000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 100, "2026-10-01T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 200, "2026-10-08T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 300, "2026-10-15T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 400, "2026-10-22T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 500, "2026-10-29T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 600, "2026-10-30T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 700, "2026-10-31T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=month")
        expect(res.status).toBe(200)
        expect(res.body.data.months).toEqual([
          { label: "Wk 1", collected: 100 },
          { label: "Wk 2", collected: 200 },
          { label: "Wk 3", collected: 300 },
          { label: "Wk 4", collected: 400 },
          { label: "Wk 5", collected: 1800 },
        ])
        expect(res.body.data.totalCollected).toBe(2800)
        expect(res.body.data.comparison).toBe("vs last month")
      })

      it("I. a 28-day February renders four buckets; a leap February renders five", async () => {
        const feb2027 = await agentAt("2027-02-28T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const res28 = await feb2027.get("/api/v1/dashboard/fees?period=month")
        expect(res28.status).toBe(200)
        expect(res28.body.data.months.map((m: { label: string }) => m.label)).toEqual([
          "Wk 1", "Wk 2", "Wk 3", "Wk 4",
        ])

        const feb2028 = await agentAt("2028-02-29T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const res29 = await feb2028.get("/api/v1/dashboard/fees?period=month")
        expect(res29.status).toBe(200)
        expect(res29.body.data.months.map((m: { label: string }) => m.label)).toEqual([
          "Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5",
        ])
      })

      it("I. month-to-date excludes future payment dates", async () => {
        const agent = await agentAt("2027-02-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 100000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2027-02-10T09:00:00.000Z")
        // Future within the month: must not be counted.
        await createPayment(fixtures.schoolAId, inv.id, 9999, "2027-02-20T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=month")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(1000)
        // Feb 10 is in the days 8–14 block (Wk 2), not Wk 1.
        const w2 = res.body.data.months.find((m: { label: string }) => m.label === "Wk 2")
        expect(w2.collected).toBe(1000)
        expect(res.body.data.months.map((m: { label: string }) => m.label)).toEqual([
          "Wk 1", "Wk 2", "Wk 3", "Wk 4",
        ])
      })

      it("I. October 1–13 compares with September 1–13, not all of September", async () => {
        const agent = await agentAt("2026-10-13T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 200000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2026-10-05T09:00:00.000Z")
        // Inside the equivalent prior window (Sep 1–13).
        await createPayment(fixtures.schoolAId, inv.id, 400, "2026-09-10T09:00:00.000Z")
        // Outside the equivalent prior window but within September: must NOT feed the baseline.
        await createPayment(fixtures.schoolAId, inv.id, 100000, "2026-09-20T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=month")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(1000)
        // (1000 - 400) / 400 = 150%. The full-prior-month bug would read ≈ -99.2%.
        expect(res.body.data.trendPercent).toBe(150)

        // The Fees Collection KPI uses the same comparison window.
        const statsRes = await agent.get("/api/v1/dashboard/stats")
        expect(statsRes.status).toBe(200)
        const fees = new Map(statsRes.body.data.stats.map((s: { id: string }) => [s.id, s])).get("fees-collection")
        // Headline value stays the full active-session total (1000 + 400 + 100000).
        expect(fees.value).toBe("₹1,01,400")
        expect(fees.trendPercent).toBe(150)
        expect(fees.comparison).toBe("vs last month")
      })

      it("I. clamps the prior window at a short month end (no overflow into March)", async () => {
        const agent = await agentAt("2026-03-31T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 200000,
        })
        // Current March total = 6000; a clamp bug would fold Mar 1–3 into the baseline.
        await createPayment(fixtures.schoolAId, inv.id, 5000, "2026-03-01T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2026-03-15T09:00:00.000Z")
        // Prior February (28 days) total = 700.
        await createPayment(fixtures.schoolAId, inv.id, 500, "2026-02-28T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 200, "2026-02-25T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=month")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(6000)
        // (6000 - 700) / 700 = 757.1%. An unclamped Feb 31 → Mar 3 window would read ≈ 5.3%.
        expect(res.body.data.trendPercent).toBe(757.1)
      })

      it("I. includes Feb 29 in a leap-year prior-month window", async () => {
        const agent = await agentAt("2028-03-31T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 200000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 9000, "2028-03-01T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2028-03-31T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 800, "2028-02-29T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=month")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(10000)
        // (10000 - 800) / 800 = 1150%. A non-leap clamp (Feb 28) would drop the 800 → 100%.
        expect(res.body.data.trendPercent).toBe(1150)
      })
    })

    describe("session: previous-session trend selection", () => {
      it("E. treats an existing zero-collection previous session as 100% when current is positive", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        // The shared CLOSED 2025-26 predecessor has no payments (zero baseline).
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 20000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 5000, "2026-12-01T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(5000)
        expect(res.body.data.trendPercent).toBe(100)
        expect(res.body.data.comparison).toBe("vs last session")
      })

      it("E. reports a null trend (not 0) when no previous session exists", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_B_EMAIL, TEST_ADMIN_B_PASS)
        // School B has exactly one (ACTIVE) session: no predecessor at all.
        const inv = await createInvoice({
          schoolId: fixtures.schoolBId,
          sessionId: fixtures.activeSessionBId,
          studentId: fixtures.studentB1.id,
          enrollmentId: (await prisma.studentEnrollment.findFirstOrThrow({
            where: { studentId: fixtures.studentB1.id },
          })).id,
          totalAmount: 20000,
        })
        await createPayment(fixtures.schoolBId, inv.id, 7000, "2026-12-01T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(7000)
        expect(res.body.data.trendPercent).toBeNull()
        expect(res.body.data.comparison).toBe("No previous session")
      })

      it("E. selects the immediately preceding session ordered by startDate", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        // Insert an older 2024-25 session with a LARGE collection. The active
        // session's immediate predecessor is still the zero-collection 2025-26
        // closed session, so the trend must be 100, not the negative value that
        // an accidental 2024-25 baseline would produce.
        const old = await createExtraSession({
          schoolId: fixtures.schoolAId,
          name: "2024-25",
          code: "AY2024",
          startDate: "2024-04-01T00:00:00.000Z",
          endDate: "2025-03-31T00:00:00.000Z",
          status: "CLOSED",
        })
        const oldInvoice = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: old.id,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 50000,
        })
        await createPayment(fixtures.schoolAId, oldInvoice.id, 50000, "2024-08-01T09:00:00.000Z")

        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 20000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 5000, "2026-12-01T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(5000)
        expect(res.body.data.trendPercent).toBe(100)
        expect(res.body.data.comparison).toBe("vs last session")
      })
    })

    describe("session: tenant isolation", () => {
      it("F. never mixes another school's invoices, payments or baselines into the totals", async () => {
        const agentA = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const agentB = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_B_EMAIL, TEST_ADMIN_B_PASS)
        const invA = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 60000,
        })
        await createPayment(fixtures.schoolAId, invA.id, 25000, "2026-11-01T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, invA.id, 25000, "2026-12-01T09:00:00.000Z")

        const invB = await createInvoice({
          schoolId: fixtures.schoolBId,
          sessionId: fixtures.activeSessionBId,
          studentId: fixtures.studentB1.id,
          enrollmentId: (await prisma.studentEnrollment.findFirstOrThrow({
            where: { studentId: fixtures.studentB1.id },
          })).id,
          totalAmount: 150000,
        })
        await createPayment(fixtures.schoolBId, invB.id, 99999, "2026-12-02T09:00:00.000Z")

        const resA = await agentA.get("/api/v1/dashboard/fees?period=session")
        expect(resA.status).toBe(200)
        expect(resA.body.data.totalCollected).toBe(50000)
        const decA = resA.body.data.months.find((m: { label: string }) => m.label === "Dec")
        expect(decA.collected).toBe(25000)
        expect(resA.body.data.trendPercent).toBe(100)
        expect(resA.body.data.comparison).toBe("vs last session")

        const resB = await agentB.get("/api/v1/dashboard/fees?period=session")
        expect(resB.status).toBe(200)
        expect(resB.body.data.totalCollected).toBe(99999)
        const decB = resB.body.data.months.find((m: { label: string }) => m.label === "Dec")
        expect(decB.collected).toBe(99999)
        expect(resB.body.data.trendPercent).toBeNull()
        expect(resB.body.data.comparison).toBe("No previous session")
      })
    })

    describe("stats: fees collection KPI", () => {
      it("G. reports a session-wide value with a month-to-month trend and 'vs last month' label", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 50000,
        })
        // Both are session-linked; the older one is outside the current month.
        await createPayment(fixtures.schoolAId, inv.id, 1000, "2026-11-10T09:00:00.000Z")
        await createPayment(fixtures.schoolAId, inv.id, 3000, "2026-12-05T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/stats")
        expect(res.status).toBe(200)
        const byId = new Map(res.body.data.stats.map((s: { id: string }) => [s.id, s]))
        const fees = byId.get("fees-collection")
        expect(fees.value).toBe("₹4,000")
        expect(fees.trendPercent).toBe(200)
        expect(fees.comparison).toBe("vs last month")
      })
    })

    describe("additional edge cases", () => {
      it("H. returns six zero buckets and a null trend for a school with no sessions", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_C_EMAIL, TEST_ADMIN_C_PASS)
        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(0)
        expect(res.body.data.trendPercent).toBeNull()
        expect(res.body.data.comparison).toBe("No previous session")
        expect(res.body.data.months.map((m: { label: string }) => m.label)).toEqual([
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ])
        expect(res.body.data.months.every((m: { collected: number }) => m.collected === 0)).toBe(true)

        const yearRes = await agent.get("/api/v1/dashboard/fees?period=year")
        expect(yearRes.status).toBe(200)
        expect(yearRes.body.data.totalCollected).toBe(0)
        expect(yearRes.body.data.months.map((m: { label: string }) => m.label)).toEqual(monthNames)
        expect(yearRes.body.data.months.every((m: { collected: number }) => m.collected === 0)).toBe(true)

        const monthRes = await agent.get("/api/v1/dashboard/fees?period=month")
        expect(monthRes.status).toBe(200)
        expect(monthRes.body.data.totalCollected).toBe(0)
        expect(monthRes.body.data.months.every((m: { collected: number }) => m.collected === 0)).toBe(true)

        const statusRes = await agent.get("/api/v1/dashboard/fee-status")
        expect(statusRes.status).toBe(200)
        expect(statusRes.body.data).toEqual({ collected: 0, pending: 0, total: 0 })
      })

      it("H. zero-valued months remain 0 when the active session has a zero previous baseline", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        // No payments at all: current 0, previous (2025-26) 0 → 0, not null.
        const res = await agent.get("/api/v1/dashboard/fees?period=session")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(0)
        expect(res.body.data.trendPercent).toBe(0)
        expect(res.body.data.comparison).toBe("vs last session")
        expect(zeroMonths(["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])).toEqual(res.body.data.months)
      })

      it("H. treats missing previous-year history as a 100% trend instead of raw division failure", async () => {
        const agent = await agentAt("2026-12-15T09:00:00.000Z", TEST_ADMIN_A_EMAIL, TEST_ADMIN_A_PASS)
        const inv = await createInvoice({
          schoolId: fixtures.schoolAId,
          sessionId: fixtures.activeSessionAId,
          studentId: fixtures.studentA1.id,
          enrollmentId: fixtures.enrollmentA1Id,
          totalAmount: 50000,
        })
        await createPayment(fixtures.schoolAId, inv.id, 5000, "2026-11-05T09:00:00.000Z")

        const res = await agent.get("/api/v1/dashboard/fees?period=year")
        expect(res.status).toBe(200)
        expect(res.body.data.totalCollected).toBe(5000)
        const nov = res.body.data.months.find((m: { label: string }) => m.label === "Nov")
        expect(nov.collected).toBe(5000)
        expect(res.body.data.trendPercent).toBe(100)
        expect(res.body.data.comparison).toBe("vs same period last year")
      })
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


async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}