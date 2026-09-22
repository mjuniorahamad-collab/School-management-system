import { execFileSync } from "node:child_process"
import { FeeAdjustmentKind, FeeAdjustmentStatus, Prisma, PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

interface Fixtures {
  schoolId: string
  otherSchoolId: string
  invoiceAId: string
  invoiceBId: string
  otherSessionInvoiceId: string
  otherInvoiceId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  otherSchoolId: "",
  invoiceAId: "",
  invoiceBId: "",
  otherSessionInvoiceId: "",
  otherInvoiceId: "",
  adminPassword: "adjust-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Fees concessions (FeeAdjustment) API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const principalAgent = request.agent(app)
  const accountantAgent = request.agent(app)
  const bursarAgent = request.agent(app)
  const viewerAgent = request.agent(app)
  const otherAgent = request.agent(app)

  const permissionIds = new Map<string, string>()

  async function createRoleWithPermissions(prisma: PrismaClient, name: string, codes: string[]) {
    const role = await prisma.role.create({ data: { name, description: `Test ${name}` } })
    for (const code of codes) {
      let permissionId = permissionIds.get(code)
      if (!permissionId) {
        const [resource, action] = code.split(":")
        const permission = await prisma.permission.create({
          data: { code, resource, action, description: `Test ${code}` },
        })
        permissionId = permission.id
        permissionIds.set(code, permissionId)
      }
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId } })
    }
    return role
  }

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

    const school = await prisma.school.create({ data: { name: "Adjust School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Adjust Year",
        code: "ADJ2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    const classSix = await prisma.class.create({ data: { schoolId: school.id, name: "Six", sortOrder: 6 } })
    const sectionA = await prisma.section.create({ data: { classId: classSix.id, name: "A" } })

    const tuition = await prisma.feeHead.create({
      data: { schoolId: school.id, code: "TUITION", name: "Tuition", isRecurring: true },
    })
    const transport = await prisma.feeHead.create({
      data: { schoolId: school.id, code: "TRANSPORT", name: "Transport", isRecurring: false },
    })

    const studentA = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "STU-2026-0001",
        firstName: "Amina",
        lastName: "Adamu",
        dateOfBirth: new Date("2014-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    const studentB = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "STU-2026-0002",
        firstName: "Bello",
        lastName: "Bala",
        dateOfBirth: new Date("2014-06-01T00:00:00.000Z"),
        gender: "MALE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })

    async function enrollment(studentId: string) {
      return prisma.studentEnrollment.create({
        data: { studentId, academicSessionId: session.id, classId: classSix.id, sectionId: sectionA.id },
      })
    }
    const enrollmentAId = (await enrollment(studentA.id)).id
    const enrollmentBId = (await enrollment(studentB.id)).id

    async function createInvoice(input: {
      studentId: string
      enrollmentId: string
      invoiceNumber: string
      gross: number
      installments: { no: number; amount: number }[]
    }) {
      const itemBase = Math.round(input.gross * 0.7)
      return (
        await prisma.feeInvoice.create({
          data: {
            schoolId: school.id,
            studentId: input.studentId,
            enrollmentId: input.enrollmentId,
            sessionId: session.id,
            invoiceNumber: input.invoiceNumber,
            className: "Six",
            sectionName: "A",
            sessionName: "Adjust Year",
            grossAmount: input.gross,
            totalAmount: input.gross,
            amountPaid: 0,
            balance: input.gross,
            status: "UNPAID",
            items: [
              { feeHeadCode: tuition.code, feeHeadName: tuition.name, amount: itemBase },
              { feeHeadCode: transport.code, feeHeadName: transport.name, amount: input.gross - itemBase },
            ],
            installments: {
              create: input.installments.map((part, index) => ({
                schoolId: school.id,
                installmentNo: part.no,
                label: `Term ${part.no}`,
                amount: part.amount,
                dueDate: index === 0 ? new Date("2027-01-15T00:00:00.000Z") : new Date("2027-02-15T00:00:00.000Z"),
                amountPaid: 0,
                balance: part.amount,
                sortOrder: index + 1,
              })),
            },
          },
        })
      ).id
    }

    fixtures.invoiceAId = await createInvoice({
      studentId: studentA.id,
      enrollmentId: enrollmentAId,
      invoiceNumber: "INV-2026-1001",
      gross: 40000,
      installments: [
        { no: 1, amount: 20000 },
        { no: 2, amount: 20000 },
      ],
    })
    fixtures.invoiceBId = await createInvoice({
      studentId: studentB.id,
      enrollmentId: enrollmentBId,
      invoiceNumber: "INV-2026-1002",
      gross: 6000,
      installments: [
        { no: 1, amount: 3000 },
        { no: 2, amount: 3000 },
      ],
    })

    const upcomingSession = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Adjust Year Next",
        code: "ADJ2027",
        startDate: new Date("2027-04-01T00:00:00.000Z"),
        endDate: new Date("2028-03-31T00:00:00.000Z"),
        status: "UPCOMING",
      },
    })
    const upcomingEnrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: studentA.id,
        academicSessionId: upcomingSession.id,
        classId: classSix.id,
        sectionId: sectionA.id,
      },
    })
    fixtures.otherSessionInvoiceId = (
      await prisma.feeInvoice.create({
        data: {
          schoolId: school.id,
          studentId: studentA.id,
          enrollmentId: upcomingEnrollment.id,
          sessionId: upcomingSession.id,
          invoiceNumber: "INV-2026-1003",
          className: "Six",
          sectionName: "A",
          sessionName: "Adjust Year Next",
          grossAmount: 10000,
          totalAmount: 10000,
          amountPaid: 0,
          balance: 10000,
          status: "UNPAID",
          items: [
            { feeHeadCode: tuition.code, feeHeadName: tuition.name, amount: 7000 },
            { feeHeadCode: transport.code, feeHeadName: transport.name, amount: 3000 },
          ],
          installments: {
            create: [
              {
                schoolId: school.id,
                installmentNo: 1,
                label: "Term 1",
                amount: 10000,
                dueDate: new Date("2027-01-15T00:00:00.000Z"),
                amountPaid: 0,
                balance: 10000,
                sortOrder: 1,
              },
            ],
          },
        },
      })
    ).id

    const superRole = await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Super admin" } })
    const accountantRole = await createRoleWithPermissions(prisma, "ACCOUNTANT", [
      "concessions:view",
      "concessions:request",
    ])
    const principalRole = await createRoleWithPermissions(prisma, "PRINCIPAL", [
      "concessions:view",
      "concessions:approve",
      "concessions:reject",
      "concessions:reverse",
    ])
    const bursarRole = await createRoleWithPermissions(prisma, "BURSAR", [
      "concessions:view",
      "concessions:request",
      "concessions:approve",
    ])
    const viewerRole = await createRoleWithPermissions(prisma, "VIEWER", ["concessions:view"])

    async function createUser(name: string, email: string, password: string, roleId: string, schoolId: string) {
      const user = await prisma.user.create({
        data: { name, email, passwordHash: hashPassword(password), status: "ACTIVE" },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
      })
      return user
    }

    await createUser("Adjust Admin", "adjust.admin@example.com", fixtures.adminPassword, superRole.id, school.id)
    await createUser("Adjust Accountant", "adjust.accountant@example.com", "adjust-accountant-123", accountantRole.id, school.id)
    await createUser("Adjust Principal", "adjust.principal@example.com", "adjust-principal-123", principalRole.id, school.id)
    await createUser("Adjust Bursar", "adjust.bursar@example.com", "adjust-bursar-123", bursarRole.id, school.id)
    await createUser("Adjust Viewer", "adjust.viewer@example.com", "adjust-viewer-123", viewerRole.id, school.id)

    const otherSchool = await prisma.school.create({ data: { name: "Other Adjust School" } })
    fixtures.otherSchoolId = otherSchool.id
    const otherSession = await prisma.academicSession.create({
      data: {
        schoolId: otherSchool.id,
        name: "Other Adjust Year",
        code: "OADJ2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    const otherClass = await prisma.class.create({ data: { schoolId: otherSchool.id, name: "Six", sortOrder: 6 } })
    const otherSection = await prisma.section.create({ data: { classId: otherClass.id, name: "A" } })
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: otherSchool.id,
        admissionNumber: "STU-2026-9001",
        firstName: "Other",
        lastName: "Tenant",
        dateOfBirth: new Date("2014-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    const otherEnrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: otherStudent.id,
        academicSessionId: otherSession.id,
        classId: otherClass.id,
        sectionId: otherSection.id,
      },
    })
    fixtures.otherInvoiceId = (
      await prisma.feeInvoice.create({
        data: {
          schoolId: otherSchool.id,
          studentId: otherStudent.id,
          enrollmentId: otherEnrollment.id,
          sessionId: otherSession.id,
          invoiceNumber: "INV-2026-9001",
          className: "Six",
          sectionName: "A",
          sessionName: "Other Adjust Year",
          grossAmount: 250,
          totalAmount: 250,
          amountPaid: 0,
          balance: 250,
          status: "UNPAID",
          items: [{ feeHeadCode: "TUITION", feeHeadName: "Tuition", amount: 250 }],
          installments: {
            create: [
              {
                schoolId: otherSchool.id,
                installmentNo: 1,
                label: "Term 1",
                amount: 250,
                dueDate: new Date("2027-01-15T00:00:00.000Z"),
                amountPaid: 0,
                balance: 250,
                sortOrder: 1,
              },
            ],
          },
        },
      })
    ).id
    await createUser("Other Adjust Admin", "adjust.other@example.com", "adjust-other-123", superRole.id, otherSchool.id)

    await login(adminAgent, "adjust.admin@example.com", fixtures.adminPassword)
    await login(accountantAgent, "adjust.accountant@example.com", "adjust-accountant-123")
    await login(principalAgent, "adjust.principal@example.com", "adjust-principal-123")
    await login(bursarAgent, "adjust.bursar@example.com", "adjust-bursar-123")
    await login(viewerAgent, "adjust.viewer@example.com", "adjust-viewer-123")
    await login(otherAgent, "adjust.other@example.com", "adjust-other-123")
  })

  beforeEach(async () => {
    await prisma.feeReceipt.deleteMany()
    await prisma.feePayment.deleteMany()
    await prisma.feeAdjustment.deleteMany()
    await resetInvoice(prisma, fixtures.invoiceAId, 40000, [20000, 20000])
    await resetInvoice(prisma, fixtures.invoiceBId, 6000, [3000, 3000])
    await prisma.school.update({
      where: { id: fixtures.schoolId },
      data: { feePaymentCounter: 0, feeReceiptCounter: 0 },
    })
  })

  afterAll(async () => {
    if (prisma) {
      await resetAllTables(prisma)
      await prisma.$disconnect()
    }
  })

  function concessionPayload(invoiceId: string, overrides: Record<string, unknown> = {}) {
    return {
      invoiceId,
      kind: "FIXED_AMOUNT",
      value: 5000,
      reason: "Sibling discount",
      ...overrides,
    }
  }

  describe("index & rbac", () => {
    it("requires an authenticated session", async () => {
      const list = await request(app).get("/api/v1/fees/adjustments")
      expect(list.status).toBe(401)
      const create = await request(app).post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      expect(create.status).toBe(401)
    })

    it("denies concession requests to a viewer without concessions:request", async () => {
      const res = await viewerAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("denies approval to an accountant without concessions:approve", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      expect(created.status).toBe(201)
      const res = await accountantAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("denies requesting to a principal who only holds workflow permissions", async () => {
      const res = await principalAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      expect(res.status).toBe(403)
    })

    it("allows a viewer to list adjustments", async () => {
      await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await viewerAgent.get("/api/v1/fees/adjustments")
      expect(res.status).toBe(200)
      expect(res.body.data.pagination.total).toBe(1)
    })

    it("returns an empty list before any adjustment exists", async () => {
      const res = await adminAgent.get("/api/v1/fees/adjustments")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.pagination.total).toBe(0)
    })
  })

  describe("request", () => {
    it("creates a REQUESTED FIXED_AMOUNT concession without touching the invoice", async () => {
      const res = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      expect(res.status).toBe(201)
      const adjustment = res.body.data
      expect(adjustment.status).toBe("REQUESTED")
      expect(adjustment.kind).toBe("FIXED_AMOUNT")
      expect(adjustment.value).toBe(5000)
      expect(adjustment.computedAmount).toBe(5000)
      expect(adjustment.reason).toBe("Sibling discount")
      expect(adjustment.requestedBy.name).toBe("Adjust Accountant")
      expect(adjustment.invoice.invoiceNumber).toBe("INV-2026-1001")
      expect(adjustment.invoice.grossAmount).toBe(40000)
      expect(adjustment.invoice.totalAmount).toBe(40000)
      expect(adjustment.invoice.balance).toBe(40000)
      expect(adjustment.invoice.student.fullName).toBe("Amina Adamu")
      expect(adjustment.installmentApplication).toEqual([])
    })

    it("computes the frozen PERCENTAGE amount against gross", async () => {
      const res = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceAId, { kind: "PERCENTAGE", value: 10 }))
      expect(res.status).toBe(201)
      expect(res.body.data.computedAmount).toBe(4000)
    })

    it("rejects a percentage above 100 at the boundary", async () => {
      const res = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceAId, { kind: "PERCENTAGE", value: 101 }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("rejects a zero or negative value", async () => {
      const zero = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceAId, { value: 0 }))
      expect(zero.status).toBe(400)
      expect(zero.body.error.code).toBe("VALIDATION_ERROR")
      const negative = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceAId, { value: -5 }))
      expect(negative.status).toBe(400)
    })

    it("requires an invoiceId", async () => {
      const res = await accountantAgent.post("/api/v1/fees/adjustments").send({ kind: "FIXED_AMOUNT", value: 5000 })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("returns 404 for an unknown or cross-tenant invoice", async () => {
      const missing = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload("00000000-0000-4000-8000-000000000099"))
      expect(missing.status).toBe(404)
      const foreign = await adminAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.otherInvoiceId))
      expect(foreign.status).toBe(404)
    })

    it("rejects a request against an invoice in a non-active session", async () => {
      const res = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.otherSessionInvoiceId))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/active academic session/i)
      const list = await viewerAgent.get("/api/v1/fees/adjustments")
      expect(list.body.data.items).toEqual([])
    })

    it("rejects every request when no academic session is ACTIVE", async () => {
      await prisma.academicSession.updateMany({
        where: { schoolId: fixtures.schoolId, status: "ACTIVE" },
        data: { status: "CLOSED" },
      })
      try {
        const res = await accountantAgent
          .post("/api/v1/fees/adjustments")
          .send(concessionPayload(fixtures.invoiceAId))
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe("BAD_REQUEST")
        expect(res.body.error.message).toMatch(/no active academic session/i)
      } finally {
        await prisma.academicSession.updateMany({
          where: { schoolId: fixtures.schoolId, status: "CLOSED" },
          data: { status: "ACTIVE" },
        })
      }
    })
  })

  describe("approve", () => {
    it("approves a FIXED_AMOUNT concession and applies FIFO to the earliest unpaid installment", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(200)
      const adjustment = res.body.data
      expect(adjustment.status).toBe("APPROVED")
      expect(adjustment.computedAmount).toBe(5000)
      expect(adjustment.approvedBy.name).toBe("Adjust Principal")
      expect(adjustment.installmentApplication).toHaveLength(1)
      expect(adjustment.installmentApplication[0].installmentId).toBeTruthy()
      expect(adjustment.installmentApplication[0].amountReduced).toBe(5000)
      expect(adjustment.invoice.totalAmount).toBe(35000)
      expect(adjustment.invoice.balance).toBe(35000)

      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      const installments = invoice.body.data.installments
      expect(installments[0].amount).toBe(15000)
      expect(installments[0].balance).toBe(15000)
      expect(installments[1].amount).toBe(20000)
      expect(installments[1].balance).toBe(20000)
    })

    it("freezes the PERCENTAGE amount at approval", async () => {
      const created = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceAId, { kind: "PERCENTAGE", value: 10 }))
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(200)
      expect(res.body.data.computedAmount).toBe(4000)
      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      expect(invoice.body.data.totalAmount).toBe(36000)
      expect(invoice.body.data.installments[0].amount).toBe(16000)
    })

    it("applies FIFO around already-paid installments without touching paid money", async () => {
      await adminAgent.post("/api/v1/payments").send({
        invoiceId: fixtures.invoiceAId,
        amount: 15000,
        method: "CASH",
        paymentDate: "2026-09-05",
        idempotencyKey: "adj-pay-fifo-1",
      })
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(200)
      expect(res.body.data.invoice.amountPaid).toBe(15000)
      expect(res.body.data.invoice.totalAmount).toBe(35000)
      expect(res.body.data.invoice.balance).toBe(20000)

      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      const installments = invoice.body.data.installments
      expect(installments[0].amount).toBe(15000)
      expect(installments[0].amountPaid).toBe(15000)
      expect(installments[0].balance).toBe(0)
      expect(installments[0].status).toBe("PAID")
      expect(installments[1].amount).toBe(20000)
      expect(installments[1].balance).toBe(20000)
      expect(res.body.data.invoice.totalAmount).toBeGreaterThanOrEqual(res.body.data.invoice.amountPaid)
    })

    it("rejects approval when the cap would push net below paid", async () => {
      await adminAgent.post("/api/v1/payments").send({
        invoiceId: fixtures.invoiceAId,
        amount: 40000,
        method: "CASH",
        paymentDate: "2026-09-05",
        idempotencyKey: "adj-pay-full-1",
      })
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      const still = await adminAgent.get(`/api/v1/fees/adjustments/${created.body.data.id}`)
      expect(still.body.data.status).toBe("REQUESTED")
    })

    it("enforces the aggregate cap when multiple concessions stack", async () => {
      for (const value of [3000, 2000, 1000]) {
        const created = await accountantAgent
          .post("/api/v1/fees/adjustments")
          .send(concessionPayload(fixtures.invoiceBId, { value }))
        expect(created.status).toBe(201)
        const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
        expect(res.status).toBe(200)
      }
      const over = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceBId, { value: 1 }))
      expect(over.status).toBe(201)
      const cap = await principalAgent.post(`/api/v1/fees/adjustments/${over.body.data.id}/approve`).send({})
      expect(cap.status).toBe(400)
      expect(cap.body.error.code).toBe("BAD_REQUEST")

      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceBId}`)
      expect(invoice.body.data.totalAmount).toBe(0)
      expect(invoice.body.data.balance).toBe(0)
    })

    it("rejects self-approval for a non-admin requester", async () => {
      const created = await bursarAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await bursarAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("rejects self-approval even for a SUPER_ADMIN", async () => {
      const created = await adminAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await adminAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(403)
    })

    it("rejects approving the same adjustment twice", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      const again = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(again.status).toBe(400)
    })

    it("rejects approving a rejected adjustment", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reject`).send({})
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      expect(res.status).toBe(400)
    })
  })

  describe("override", () => {
    it("lets a SUPER_ADMIN override someone else's request with a reason", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await adminAgent
        .post(`/api/v1/fees/adjustments/${created.body.data.id}/override`)
        .send({ overrideReason: "Seasonal hardship approval" })
      expect(res.status).toBe(200)
      const adjustment = res.body.data
      expect(adjustment.status).toBe("APPROVED")
      expect(adjustment.overridden).toBe(true)
      expect(adjustment.overriddenBy.name).toBe("Adjust Admin")
      expect(adjustment.overrideReason).toBe("Seasonal hardship approval")
      expect(adjustment.invoice.totalAmount).toBe(35000)
    })

    it("requires an override reason", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await adminAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/override`).send({})
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("forbids overriding one's own request", async () => {
      const created = await adminAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await adminAgent
        .post(`/api/v1/fees/adjustments/${created.body.data.id}/override`)
        .send({ overrideReason: "Self override attempt" })
      expect(res.status).toBe(403)
    })

    it("denies the override endpoint to a non-SUPER_ADMIN role", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await principalAgent
        .post(`/api/v1/fees/adjustments/${created.body.data.id}/override`)
        .send({ overrideReason: "Not authorized" })
      expect(res.status).toBe(403)
    })
  })

  describe("reject & cancel", () => {
    it("rejects a REQUESTED concession without touching the invoice", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reject`).send({})
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("REJECTED")
      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      expect(invoice.body.data.totalAmount).toBe(40000)
    })

    it("cannot reject an approved adjustment", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reject`).send({})
      expect(res.status).toBe(400)
    })

    it("lets the requester cancel their own REQUESTED concession", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await accountantAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/cancel`).send({})
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("CANCELLED")
    })

    it("forbids a non-requester from cancelling (bursar holds request but did not request)", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await bursarAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/cancel`).send({})
      expect(res.status).toBe(403)
      const still = await adminAgent.get(`/api/v1/fees/adjustments/${created.body.data.id}`)
      expect(still.body.data.status).toBe("REQUESTED")
    })

    it("cannot cancel an approved adjustment", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      const res = await accountantAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/cancel`).send({})
      expect(res.status).toBe(400)
    })
  })

  describe("reverse", () => {
    it("reverses an approved concession and restores the exact schedule", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})

      const after = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      expect(after.body.data.totalAmount).toBe(35000)
      expect(after.body.data.installments[0].amount).toBe(15000)

      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reverse`).send({})
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("REVERSED")

      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      const grossRow = await prisma.feeInvoice.findFirst({ where: { id: fixtures.invoiceAId }, select: { grossAmount: true } })
      expect(grossRow?.grossAmount.toNumber()).toBe(40000)
      expect(invoice.body.data.totalAmount).toBe(40000)
      expect(invoice.body.data.balance).toBe(40000)
      expect(invoice.body.data.installments[0].amount).toBe(20000)
      expect(invoice.body.data.installments[0].balance).toBe(20000)
      expect(invoice.body.data.installments[1].amount).toBe(20000)
    })

    it("creates a compensating reversal record paired to the original", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reverse`).send({})
      expect(res.status).toBe(200)

      const records = await prisma.feeAdjustment.findMany({ where: { schoolId: fixtures.schoolId } })
      const original = records.find((row) => row.id === created.body.data.id)
      const compensating = records.find((row) => row.reversalOfId === created.body.data.id && row.id !== created.body.data.id)
      expect(original?.status).toBe("REVERSED")
      expect(compensating).toBeTruthy()
      expect(compensating?.status).toBe("REVERSED")
      expect(compensating?.reversalOfId).toBe(created.body.data.id)
      expect(Number(compensating?.computedAmount)).toBe(5000)
      expect(compensating?.reversedById).toBeTruthy()

      const compensation = await adminAgent.get(`/api/v1/fees/adjustments/${compensating?.id}`)
      expect(compensation.body.data.reversalOf.id).toBe(created.body.data.id)
      expect(compensation.body.data.reversalOf.status).toBe("REVERSED")
      expect(compensation.body.data.installmentApplication).toHaveLength(1)
      expect(compensation.body.data.installmentApplication[0].amountReduced).toBe(5000)
    })

    it("restores amounts correctly even after a partial payment (paid money never refunded)", async () => {
      await adminAgent.post("/api/v1/payments").send({
        invoiceId: fixtures.invoiceAId,
        amount: 15000,
        method: "CASH",
        paymentDate: "2026-09-05",
        idempotencyKey: "adj-pay-rev-1",
      })
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reverse`).send({})
      expect(res.status).toBe(200)

      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      expect(invoice.body.data.amountPaid).toBe(15000)
      expect(invoice.body.data.totalAmount).toBe(40000)
      expect(invoice.body.data.balance).toBe(25000)
      const installments = invoice.body.data.installments
      expect(installments[0].amount).toBe(20000)
      expect(installments[0].amountPaid).toBe(15000)
      expect(installments[0].balance).toBe(5000)
      expect(installments[1].amount).toBe(20000)
      expect(installments[1].balance).toBe(20000)
    })

    it("cannot reverse a REQUESTED adjustment", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const res = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reverse`).send({})
      expect(res.status).toBe(400)
    })

    it("cannot reverse the same approved concession twice", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reverse`).send({})
      const again = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/reverse`).send({})
      expect(again.status).toBe(400)
    })
  })

  describe("get & list", () => {
    it("returns the adjustment detail with actors and the invoice summary", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const approved = await principalAgent.post(`/api/v1/fees/adjustments/${created.body.data.id}/approve`).send({})
      const res = await adminAgent.get(`/api/v1/fees/adjustments/${created.body.data.id}`)
      expect(res.status).toBe(200)
      const detail = res.body.data
      expect(detail.approvedBy.name).toBe("Adjust Principal")
      expect(detail.overridden).toBe(false)
      expect(detail.reversalOf).toBeNull()
      expect(detail.invoice.grossAmount).toBe(40000)
      expect(detail.invoice.totalAmount).toBe(35000)
      expect(detail.session.name).toBe("Adjust Year")
      expect(detail.student.fullName).toBe("Amina Adamu")
      expect(detail.installmentApplication).toHaveLength(1)
      expect(approved.body.data.id).toBe(created.body.data.id)
    })

    it("filters by status, student, invoice and searches reason/student name", async () => {
      const first = await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceAId, { reason: "Academic scholarship" }))
      await accountantAgent
        .post("/api/v1/fees/adjustments")
        .send(concessionPayload(fixtures.invoiceBId, { value: 700, reason: "Hardship" }))
      const firstId = first.body.data.id
      await principalAgent.post(`/api/v1/fees/adjustments/${firstId}/approve`).send({})

      const byStatus = await adminAgent.get("/api/v1/fees/adjustments").query({ status: "APPROVED" })
      expect(byStatus.body.data.pagination.total).toBe(1)
      expect(byStatus.body.data.items[0].id).toBe(firstId)

      const studentBId = (
        await prisma.feeInvoice.findUnique({ where: { id: fixtures.invoiceBId }, select: { studentId: true } })
      )?.studentId
      const byStudent = await adminAgent.get("/api/v1/fees/adjustments").query({ studentId: studentBId })
      expect(byStudent.status).toBe(200)
      expect(byStudent.body.data.pagination.total).toBe(1)
      expect(byStudent.body.data.items[0].value).toBe(700)

      const byReason = await adminAgent.get("/api/v1/fees/adjustments").query({ search: "Hardship" })
      expect(byReason.body.data.pagination.total).toBe(1)
      expect(byReason.body.data.items[0].value).toBe(700)

      const byName = await adminAgent.get("/api/v1/fees/adjustments").query({ search: "Bello" })
      expect(byName.body.data.pagination.total).toBe(1)

      const list = await adminAgent.get("/api/v1/fees/adjustments")
      expect(list.body.data.pagination.total).toBe(2)
      expect(list.body.data.items[0].invoice.invoiceNumber).toBeTruthy()
    })

    it("paginates adjustment listings", async () => {
      for (let i = 0; i < 3; i += 1) {
        await accountantAgent
          .post("/api/v1/fees/adjustments")
          .send(concessionPayload(fixtures.invoiceAId, { value: 1000 + i }))
      }
      const res = await adminAgent.get("/api/v1/fees/adjustments").query({ page: 2, pageSize: 2 })
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.pagination.total).toBe(3)
      expect(res.body.data.pagination.totalPages).toBe(2)
    })

    it("keeps tenants isolated for list and detail", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const list = await otherAgent.get("/api/v1/fees/adjustments")
      expect(list.status).toBe(200)
      expect(list.body.data.items).toEqual([])
      const foreign = await otherAgent.get(`/api/v1/fees/adjustments/${created.body.data.id}`)
      expect(foreign.status).toBe(404)
    })
  })

  describe("audit trail", () => {
    it("records each lifecycle event with actors and money metadata", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      const id = created.body.data.id
      await principalAgent.post(`/api/v1/fees/adjustments/${id}/approve`).send({})
      await principalAgent.post(`/api/v1/fees/adjustments/${id}/reverse`).send({})

      const actions = await prisma.auditLog.findMany({
        where: { schoolId: fixtures.schoolId, entityType: "FEE_ADJUSTMENT", entityId: id },
        orderBy: { createdAt: "asc" },
      })
      expect(actions.map((row) => row.action)).toEqual([
        "CONCESSION_REQUESTED",
        "CONCESSION_APPROVED",
        "CONCESSION_REVERSED",
      ])
      expect(actions[0].actorName).toBe("Adjust Accountant")
      expect(actions[1].actorName).toBe("Adjust Principal")
      expect(actions[1].actorRole).toBe("PRINCIPAL")
      const metadata = actions[1].metadata as { computedAmount?: number; totalAmountAfter?: number }
      expect(metadata.computedAmount).toBe(5000)
      expect(metadata.totalAmountAfter).toBe(35000)
      expect(actions[2].entityType).toBe("FEE_ADJUSTMENT")
    })

    it("records CONCESSION_OVERRIDE with the override reason and actor", async () => {
      const created = await accountantAgent.post("/api/v1/fees/adjustments").send(concessionPayload(fixtures.invoiceAId))
      await adminAgent
        .post(`/api/v1/fees/adjustments/${created.body.data.id}/override`)
        .send({ overrideReason: "Audit trail check" })
      const rows = await prisma.auditLog.findMany({
        where: { schoolId: fixtures.schoolId, entityId: created.body.data.id, action: "CONCESSION_OVERRIDE" },
      })
      expect(rows).toHaveLength(1)
      expect(rows[0].actorName).toBe("Adjust Admin")
      const metadata = rows[0].metadata as { overrideReason?: string }
      expect(metadata.overrideReason).toBe("Audit trail check")
    })
  })

  describe("schema presence (database-free within suite)", () => {
    it("exposes the FeeAdjustment model and concession enums on the generated client", () => {
      expect(Object.keys(Prisma.FeeAdjustmentScalarFieldEnum)).toEqual(
        expect.arrayContaining([
          "invoiceId",
          "kind",
          "value",
          "computedAmount",
          "status",
          "installmentApplication",
          "reversalOfId",
          "overriddenById",
        ]),
      )
      expect(FeeAdjustmentKind).toEqual({ FIXED_AMOUNT: "FIXED_AMOUNT", PERCENTAGE: "PERCENTAGE" })
      expect(FeeAdjustmentStatus).toEqual(
        expect.objectContaining({ REQUESTED: "REQUESTED", APPROVED: "APPROVED", REVERSED: "REVERSED" }),
      )
    })
  })
})

async function resetInvoice(
  prisma: PrismaClient,
  invoiceId: string,
  gross: number,
  installmentAmounts: number[],
): Promise<void> {
  const installments = await prisma.feeInstallment.findMany({
    where: { invoiceId },
    orderBy: { sortOrder: "asc" },
  })
  for (let index = 0; index < installmentAmounts.length; index += 1) {
    await prisma.feeInstallment.update({
      where: { id: installments[index].id },
      data: { amount: installmentAmounts[index], amountPaid: 0, balance: installmentAmounts[index], status: "UNPAID" },
    })
  }
  await prisma.feeInvoice.update({
    where: { id: invoiceId },
    data: { totalAmount: gross, amountPaid: 0, balance: gross, status: "UNPAID" },
  })
}

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeAdjustment" CASCADE')
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