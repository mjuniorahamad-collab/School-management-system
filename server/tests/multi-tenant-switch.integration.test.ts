import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"

// Multi-tenant switching. One account, ACTIVE memberships in two schools with
// *different* roles (so permissions differ per active school). Verifies:
//   - login without a legacy User.schoolId no longer locks a multi-school user
//     out; it resolves a deterministic default (earliest ACTIVE membership)
//   - login honors a persisted X-School-Id (last-used tenant)
//   - a stale/foreign persisted tenant falls back to the default on login
//   - /auth/me reflects the active school, its role, and the full membership list
//   - per-school RBAC: the same request is 200 in one school and 403 in another
//   - fees/invoices/payments reads are tenant-isolated when switching
//   - a forged X-School-Id on an authenticated request is rejected (403)
// DB-gated like the other integration suites.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

// DB-free: the multi-tenant header must survive a cross-origin preflight so a
// separately-hosted SPA can send `X-School-Id`.
describe("CORS (multi-tenant header)", () => {
  it("allows the X-School-Id request header on preflight", async () => {
    const res = await request(app)
      .options("/api/v1/auth/me")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "x-school-id")
    expect(res.status).toBeLessThan(300)
    expect(String(res.headers["access-control-allow-headers"]).toLowerCase()).toContain("x-school-id")
  })
})

describe.skipIf(!TEST_DATABASE_URL)("Multi-tenant switching (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }
  const schoolC = { id: "" }

  let readerRoleId = ""
  let feesRoleId = ""

  const dataA = { studentId: "", invoiceId: "", paymentId: "" }
  const dataB = { studentId: "", invoiceId: "", paymentId: "" }

  const EMAIL = "switch.user@example.com"
  const PASSWORD = "switch-secret-123456"

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

    // Permission catalog subset used by this suite.
    const permissionIds: Record<string, string> = {}
    for (const code of ["students:view", "fees:view", "payments:view"]) {
      const [resource, action] = code.split(":")
      const row = await prisma.permission.create({ data: { code, resource, action, description: code } })
      permissionIds[code] = row.id
    }

    // Two distinct roles so permissions differ between the user's two schools.
    const readerRole = await prisma.role.create({
      data: { name: "SWITCH_READER", description: "Students + fees + payments" },
    })
    readerRoleId = readerRole.id
    const feesRole = await prisma.role.create({
      data: { name: "SWITCH_FEES", description: "Fees + payments only (no students:view)" },
    })
    feesRoleId = feesRole.id

    await prisma.rolePermission.createMany({
      data: ["students:view", "fees:view", "payments:view"].map((code) => ({
        roleId: readerRoleId,
        permissionId: permissionIds[code],
      })),
    })
    await prisma.rolePermission.createMany({
      data: ["fees:view", "payments:view"].map((code) => ({
        roleId: feesRoleId,
        permissionId: permissionIds[code],
      })),
    })

    const a = await prisma.school.create({ data: { name: "Switch School A" } })
    schoolA.id = a.id
    const b = await prisma.school.create({ data: { name: "Switch School B" } })
    schoolB.id = b.id
    const c = await prisma.school.create({ data: { name: "Switch School C (foreign)" } })
    schoolC.id = c.id

    // A single account in both A and B — and deliberately NO legacy User.schoolId
    // / UserRole. This is the multi-school account that previously could not log
    // in at all.
    const user = await prisma.user.create({
      data: {
        name: "Switch User",
        email: EMAIL,
        passwordHash: hashPassword(PASSWORD),
        status: "ACTIVE",
      },
    })
    // Explicit createdAt makes the deterministic default (earliest) unambiguous.
    await prisma.tenantMembership.create({
      data: {
        userId: user.id,
        schoolId: schoolA.id,
        roleId: readerRoleId,
        status: "ACTIVE",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    })
    await prisma.tenantMembership.create({
      data: {
        userId: user.id,
        schoolId: schoolB.id,
        roleId: feesRoleId,
        status: "ACTIVE",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    })

    await seedSchoolData(schoolA.id, "A", dataA)
    await seedSchoolData(schoolB.id, "B", dataB)
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  describe("login default resolution", () => {
    it("logs a multi-membership user in without a legacy User.schoolId and defaults to the earliest membership", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({ email: EMAIL, password: PASSWORD })
      expect(res.status).toBe(200)
      const user = res.body.data.user as {
        school: { id: string; name: string }
        roles: string[]
        memberships: { id: string; name: string; role: string }[]
      }
      expect(user.school.id).toBe(schoolA.id)
      expect(user.roles).toEqual(["SWITCH_READER"])
      expect(user.memberships).toHaveLength(2)
      expect(user.memberships.map((m) => m.id).sort()).toEqual([schoolA.id, schoolB.id].sort())
      expect(user.memberships.find((m) => m.id === schoolB.id)?.role).toBe("SWITCH_FEES")
    })

    it("honors a persisted X-School-Id at login (last-used tenant)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("x-school-id", schoolB.id)
        .send({ email: EMAIL, password: PASSWORD })
      expect(res.status).toBe(200)
      const user = res.body.data.user as { school: { id: string }; roles: string[] }
      expect(user.school.id).toBe(schoolB.id)
      expect(user.roles).toEqual(["SWITCH_FEES"])
    })

    it("falls back to the default when the persisted tenant is no longer valid", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("x-school-id", schoolC.id)
        .send({ email: EMAIL, password: PASSWORD })
      expect(res.status).toBe(200)
      expect((res.body.data.user as { school: { id: string } }).school.id).toBe(schoolA.id)
    })
  })

  describe("/auth/me reflects the active tenant", () => {
    let agent: ReturnType<typeof request.agent>

    beforeAll(async () => {
      agent = request.agent(app)
      const res = await agent.post("/api/v1/auth/login").send({ email: EMAIL, password: PASSWORD })
      expect(res.status).toBe(200)
    })

    it("reports the requested school, its role, and the full membership list", async () => {
      const res = await agent.get("/api/v1/auth/me").set("x-school-id", schoolB.id)
      expect(res.status).toBe(200)
      const user = res.body.data.user as {
        school: { id: string }
        roles: string[]
        permissions: string[]
        memberships: { id: string }[]
      }
      expect(user.school.id).toBe(schoolB.id)
      expect(user.roles).toEqual(["SWITCH_FEES"])
      expect(user.permissions).toContain("fees:view")
      expect(user.permissions).not.toContain("students:view")
      expect(user.memberships).toHaveLength(2)
    })

    it("switches back to the other school and recomputes its role", async () => {
      const res = await agent.get("/api/v1/auth/me").set("x-school-id", schoolA.id)
      expect(res.status).toBe(200)
      const user = res.body.data.user as { school: { id: string }; roles: string[] }
      expect(user.school.id).toBe(schoolA.id)
      expect(user.roles).toEqual(["SWITCH_READER"])
    })

    it("rejects a forged tenant the user is not a member of (403)", async () => {
      const res = await agent.get("/api/v1/auth/me").set("x-school-id", schoolC.id)
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("per-school RBAC", () => {
    let agent: ReturnType<typeof request.agent>

    beforeAll(async () => {
      agent = request.agent(app)
      const res = await agent.post("/api/v1/auth/login").send({ email: EMAIL, password: PASSWORD })
      expect(res.status).toBe(200)
    })

    it("allows students:view in school A (role carries it)", async () => {
      const res = await agent.get("/api/v1/students").set("x-school-id", schoolA.id)
      expect(res.status).toBe(200)
    })

    it("denies students:view in school B (role lacks it) — same user, same route", async () => {
      const res = await agent.get("/api/v1/students").set("x-school-id", schoolB.id)
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("fee data isolation across a switch", () => {
    let agent: ReturnType<typeof request.agent>

    beforeAll(async () => {
      agent = request.agent(app)
      const res = await agent.post("/api/v1/auth/login").send({ email: EMAIL, password: PASSWORD })
      expect(res.status).toBe(200)
    })

    it("lists only the active school's invoices", async () => {
      const inA = await agent.get("/api/v1/fees/invoices").set("x-school-id", schoolA.id)
      expect(inA.status).toBe(200)
      expect(inA.body.data.pagination.total).toBe(1)
      expect(inA.body.data.items[0].id).toBe(dataA.invoiceId)

      const inB = await agent.get("/api/v1/fees/invoices").set("x-school-id", schoolB.id)
      expect(inB.status).toBe(200)
      expect(inB.body.data.pagination.total).toBe(1)
      expect(inB.body.data.items[0].id).toBe(dataB.invoiceId)
    })

    it("lists only the active school's payments", async () => {
      const inA = await agent.get("/api/v1/payments").set("x-school-id", schoolA.id)
      expect(inA.status).toBe(200)
      expect(inA.body.data.pagination.total).toBe(1)
      expect(inA.body.data.items[0].id).toBe(dataA.paymentId)

      const inB = await agent.get("/api/v1/payments").set("x-school-id", schoolB.id)
      expect(inB.status).toBe(200)
      expect(inB.body.data.pagination.total).toBe(1)
      expect(inB.body.data.items[0].id).toBe(dataB.paymentId)
    })
  })
})

interface SeededSchoolData {
  studentId: string
  invoiceId: string
  paymentId: string
}

async function seedSchoolData(
  schoolId: string,
  suffix: string,
  target: SeededSchoolData,
): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const session = await prisma.academicSession.create({
      data: {
        schoolId,
        name: `Year ${suffix}`,
        code: `Y${suffix}2026`,
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    const klass = await prisma.class.create({ data: { schoolId, name: `6${suffix}`, sortOrder: 6 } })
    const section = await prisma.section.create({ data: { classId: klass.id, name: "A" } })

    const student = await prisma.student.create({
      data: {
        schoolId,
        admissionNumber: `ADM-${suffix}-0001`,
        firstName: `Student${suffix}`,
        lastName: "Switch",
        dateOfBirth: new Date("2015-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        status: "ACTIVE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    })
    target.studentId = student.id

    const enrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        academicSessionId: session.id,
        classId: klass.id,
        sectionId: section.id,
      },
    })

    const invoice = await prisma.feeInvoice.create({
      data: {
        schoolId,
        studentId: student.id,
        enrollmentId: enrollment.id,
        sessionId: session.id,
        invoiceNumber: `INV-${suffix}-0001`,
        className: klass.name,
        sectionName: section.name,
        sessionName: session.name,
        grossAmount: 1000,
        totalAmount: 1000,
        balance: 1000,
        status: "UNPAID",
        items: [],
      },
    })
    target.invoiceId = invoice.id

    const payment = await prisma.feePayment.create({
      data: {
        schoolId,
        invoiceId: invoice.id,
        paymentNumber: `PAY-${suffix}-0001`,
        amount: 250,
        method: "CASH",
        paymentDate: new Date("2026-05-01T00:00:00.000Z"),
      },
    })
    target.paymentId = payment.id
  } finally {
    await prisma.$disconnect()
  }
}

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
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
