import { execFileSync } from "node:child_process"
import { Prisma, PrismaClient } from "@prisma/client"
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
  sessionId: string
  otherSessionId: string
  classId: string
  sectionId: string
  otherClassId: string
  otherSectionId: string
  studentAId: string
  studentBId: string
  otherStudentId: string
  invoiceAId: string
  otherInvoiceAId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  otherSchoolId: "",
  sessionId: "",
  otherSessionId: "",
  classId: "",
  sectionId: "",
  otherClassId: "",
  otherSectionId: "",
  studentAId: "",
  studentBId: "",
  otherStudentId: "",
  invoiceAId: "",
  otherInvoiceAId: "",
  adminPassword: "fees-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Fees payments & receipts API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const otherAgent = request.agent(app)
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

    const school = await prisma.school.create({ data: { name: "Fees School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Fees Year",
        code: "FEY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    const classSix = await prisma.class.create({
      data: { schoolId: school.id, name: "Six", sortOrder: 6 },
    })
    fixtures.classId = classSix.id
    const sectionA = await prisma.section.create({ data: { classId: classSix.id, name: "A" } })
    fixtures.sectionId = sectionA.id

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
    fixtures.studentAId = studentA.id

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
    fixtures.studentBId = studentB.id

    for (const student of [studentA, studentB]) {
      await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicSessionId: session.id,
          classId: classSix.id,
          sectionId: sectionA.id,
        },
      })
    }

    fixtures.invoiceAId = (
      await prisma.feeInvoice.create({
        data: {
          schoolId: school.id,
          studentId: studentA.id,
          enrollmentId: (
            await prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: studentA.id } })
          ).id,
          sessionId: session.id,
          invoiceNumber: "INV-2026-1001",
          className: "Six",
          sectionName: "A",
          sessionName: "Fees Year",
          totalAmount: 1000,
          amountPaid: 0,
          balance: 1000,
          status: "UNPAID",
          items: [
            { feeHeadCode: tuition.code, feeHeadName: tuition.name, amount: 700 },
            { feeHeadCode: transport.code, feeHeadName: transport.name, amount: 300 },
          ],
          installments: {
            create: [
              {
                schoolId: school.id,
                installmentNo: 1,
                label: "Term 1",
                amount: 500,
                dueDate: new Date("2027-01-15T00:00:00.000Z"),
                amountPaid: 0,
                balance: 500,
                sortOrder: 1,
              },
              {
                schoolId: school.id,
                installmentNo: 2,
                label: "Term 2",
                amount: 500,
                dueDate: new Date("2027-02-15T00:00:00.000Z"),
                amountPaid: 0,
                balance: 500,
                sortOrder: 2,
              },
            ],
          },
        },
      })
    ).id

    const superRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const viewerRole = await prisma.role.create({
      data: { name: "ACCOUNTANT", description: "Test role with view-only fee permissions" },
    })
    for (const code of ["payments:view", "receipts:view"]) {
      const [resource, action] = code.split(":")
      const permission = await prisma.permission.create({
        data: { code, resource, action, description: `Test ${code}` },
      })
      await prisma.rolePermission.create({
        data: { roleId: viewerRole.id, permissionId: permission.id },
      })
    }

    const admin = await prisma.user.create({
      data: {
        name: "Fees Admin",
        email: "fees.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: admin.id, schoolId: school.id, roleId: superRole.id, status: "ACTIVE" },
    })

    const viewer = await prisma.user.create({
      data: {
        name: "Fees Viewer",
        email: "fees.viewer@example.com",
        passwordHash: hashPassword("fees-viewer-secret-123"),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: viewer.id, schoolId: school.id, roleId: viewerRole.id, status: "ACTIVE" },
    })

    const otherSchool = await prisma.school.create({ data: { name: "Other Fees School" } })
    fixtures.otherSchoolId = otherSchool.id
    const otherSession = await prisma.academicSession.create({
      data: {
        schoolId: otherSchool.id,
        name: "Other Fees Year",
        code: "OFE2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.otherSessionId = otherSession.id
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Six", sortOrder: 6 },
    })
    fixtures.otherClassId = otherClass.id
    const otherSection = await prisma.section.create({
      data: { classId: otherClass.id, name: "A" },
    })
    fixtures.otherSectionId = otherSection.id

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
    fixtures.otherStudentId = otherStudent.id
    const otherEnrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: otherStudent.id,
        academicSessionId: otherSession.id,
        classId: otherClass.id,
        sectionId: otherSection.id,
      },
    })
    fixtures.otherInvoiceAId = (
      await prisma.feeInvoice.create({
        data: {
          schoolId: otherSchool.id,
          studentId: otherStudent.id,
          enrollmentId: otherEnrollment.id,
          sessionId: otherSession.id,
          invoiceNumber: "INV-2026-9001",
          className: "Six",
          sectionName: "A",
          sessionName: "Other Fees Year",
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

    const otherAdmin = await prisma.user.create({
      data: {
        name: "Other Fees Admin",
        email: "fees.other@example.com",
        passwordHash: hashPassword("other-secret-123"),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: otherAdmin.id, schoolId: otherSchool.id, roleId: superRole.id, status: "ACTIVE" },
    })

    await login(adminAgent, "fees.admin@example.com", fixtures.adminPassword)
    await login(otherAgent, "fees.other@example.com", "other-secret-123")
    await login(viewerAgent, "fees.viewer@example.com", "fees-viewer-secret-123")
  })

  beforeEach(async () => {
    await prisma.feeReceipt.deleteMany()
    await prisma.feePayment.deleteMany()
    await prisma.feeInstallment.updateMany({
      where: { invoiceId: fixtures.invoiceAId },
      data: { amountPaid: 0, balance: 500, status: "UNPAID" },
    })
    await prisma.feeInvoice.update({
      where: { id: fixtures.invoiceAId },
      data: { amountPaid: 0, balance: 1000, status: "UNPAID" },
    })
    await prisma.school.update({
      where: { id: fixtures.schoolId },
      data: { feePaymentCounter: 0, feeReceiptCounter: 0 },
    })
  })

  afterAll(async () => {
    if (prisma) {
      // Leave the shared test DB pristine: other integration suites reset tables
      // via deleteMany in their beforeAll and would trip over leftover FeeInvoice
      // rows (Restrict FK on enrollment). Full reset keeps file order irrelevant.
      await resetAllTables(prisma)
      await prisma.$disconnect()
    }
  })

  function paymentPayload(invoiceId: string, overrides: Record<string, unknown> = {}) {
    return {
      invoiceId,
      amount: 500,
      method: "CASH",
      paymentDate: "2026-09-05",
      idempotencyKey: `pay-${invoiceId}-attempt-1`,
      ...overrides,
    }
  }

  describe("index & rbac", () => {
    it("requires an authenticated session for payments and receipts", async () => {
      const payments = await request(app).get("/api/v1/payments")
      expect(payments.status).toBe(401)
      const receipts = await request(app).get("/api/v1/receipts")
      expect(receipts.status).toBe(401)
    })

    it("denies payment creation to a viewer without payments:create", async () => {
      const res = await viewerAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("allows a viewer to list payments and receipts", async () => {
      await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const payments = await viewerAgent.get("/api/v1/payments")
      expect(payments.status).toBe(200)
      expect(payments.body.data.pagination.total).toBe(1)
      const receipts = await viewerAgent.get("/api/v1/receipts")
      expect(receipts.status).toBe(200)
      expect(receipts.body.data.pagination.total).toBe(1)
    })

    it("returns an empty list before any payment exists", async () => {
      const res = await adminAgent.get("/api/v1/payments")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.pagination.total).toBe(0)
    })
  })

  describe("create (payment + receipt)", () => {
    it("records a partial payment, allocates FIFO, and issues a receipt", async () => {
      const res = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      expect(res.status).toBe(201)
      expect(res.body.data.replayed).toBe(false)
      const payment = res.body.data.payment
      expect(payment.paymentNumber).toBe("PAY-2026-0001")
      expect(payment.amount).toBe(500)
      expect(payment.method).toBe("CASH")
      expect(payment.paymentDate).toBe("2026-09-05")
      expect(payment.invoice.invoiceNumber).toBe("INV-2026-1001")
      expect(payment.invoice.student.fullName).toBe("Amina Adamu")
      expect(payment.recordedBy.name).toBe("Fees Admin")
      expect(payment.receipt.receiptNumber).toBe("RCT-2026-0001")
      expect(payment.receipt.balanceAfter).toBe(500)

      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      expect(invoice.body.data.amountPaid).toBe(500)
      expect(invoice.body.data.balance).toBe(500)
      // Derive rule (phase 7A): the earliest outstanding installment is fully
      // unpaid, so the invoice reports UNPAID until an outstanding installment
      // is partially paid (then PARTIAL) — see fees.unit.test.ts.
      expect(invoice.body.data.status).toBe("UNPAID")
      const installment = invoice.body.data.installments[0]
      expect(installment.amountPaid).toBe(500)
      expect(installment.balance).toBe(0)
      expect(installment.status).toBe("PAID")
    })

    it("replays the original payment+receipt on an identical idempotency key", async () => {
      const first = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      expect(first.status).toBe(201)
      const replay = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId, { notes: "retried" }))
      expect(replay.status).toBe(200)
      expect(replay.body.data.replayed).toBe(true)
      expect(replay.body.data.payment.id).toBe(first.body.data.payment.id)
      expect(replay.body.data.receipt.id).toBe(first.body.data.payment.receipt.id)

const payments = await adminAgent.get("/api/v1/payments")
      expect(payments.body.data.pagination.total).toBe(1)
    })

    it("settles the invoice after a second payment covering the remainder", async () => {
      await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const second = await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.invoiceAId, { idempotencyKey: "pay-again-2" }))
      expect(second.status).toBe(201)
      expect(second.body.data.payment.paymentNumber).toBe("PAY-2026-0002")
      expect(second.body.data.payment.receipt.receiptNumber).toBe("RCT-2026-0002")
      expect(second.body.data.payment.receipt.balanceAfter).toBe(0)

      const invoice = await adminAgent.get(`/api/v1/fees/invoices/${fixtures.invoiceAId}`)
      expect(invoice.body.data.status).toBe("PAID")
      expect(invoice.body.data.balance).toBe(0)
    })

    it("rejects overpayments beyond the outstanding balance", async () => {
      const res = await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.invoiceAId, { amount: 1000.01 }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/outstanding balance/)
    })

    it("rejects validation failures at the API boundary", async () => {
      const badDate = await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.invoiceAId, { paymentDate: "05/09/2026" }))
      expect(badDate.status).toBe(400)
      expect(badDate.body.error.code).toBe("VALIDATION_ERROR")

      const badMethod = await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.invoiceAId, { method: "CRYPTO" }))
      expect(badMethod.status).toBe(400)
    })

    it("returns 404 for an unknown or cross-tenant invoice", async () => {
      const missing = await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload("00000000-0000-4000-8000-000000000099"))
      expect(missing.status).toBe(404)

      const foreign = await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.otherInvoiceAId))
      expect(foreign.status).toBe(404)
    })
  })

  describe("get", () => {
    it("returns the payment detail with its receipt", async () => {
      const created = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const id = created.body.data.payment.id
      const res = await adminAgent.get(`/api/v1/payments/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.paymentNumber).toBe("PAY-2026-0001")
      expect(res.body.data.receipt.receiptNumber).toBe("RCT-2026-0001")
      expect(res.body.data.invoice.student.fullName).toBe("Amina Adamu")
    })

    it("returns 404 for an unknown or cross-tenant payment", async () => {
      const missing = await adminAgent.get("/api/v1/payments/00000000-0000-4000-8000-000000000099")
      expect(missing.status).toBe(404)

      const created = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const foreign = await otherAgent.get(`/api/v1/payments/${created.body.data.payment.id}`)
      expect(foreign.status).toBe(404)
    })
  })

  describe("list", () => {
    it("filters by method, date range, and searches by student/receipt number", async () => {
      await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.invoiceAId, { method: "BANK_TRANSFER", transactionRef: "TXN-77" }))
      await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.invoiceAId, { idempotencyKey: "pay-cash-2", amount: 500 }))

      const cash = await adminAgent.get("/api/v1/payments").query({ method: "BANK_TRANSFER" })
      expect(cash.body.data.pagination.total).toBe(1)
      expect(cash.body.data.items[0].transactionRef).toBe("TXN-77")

      const ranged = await adminAgent
        .get("/api/v1/payments")
        .query({ from: "2026-09-01", to: "2026-09-30" })
      expect(ranged.body.data.pagination.total).toBe(2)

      const search = await adminAgent.get("/api/v1/payments").query({ search: "Adamu" })
      expect(search.body.data.pagination.total).toBe(2)

      const byNumber = await adminAgent.get("/api/v1/receipts").query({ search: "RCT-2026-0002" })
      expect(byNumber.body.data.pagination.total).toBe(1)
      expect(byNumber.body.data.items[0].invoiceNumber).toBe("INV-2026-1001")
    })

    it("paginates and reports totalPages", async () => {
      await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      await adminAgent
        .post("/api/v1/payments")
        .send(paymentPayload(fixtures.invoiceAId, { idempotencyKey: "pay-page-2", amount: 500 }))
      const res = await adminAgent.get("/api/v1/payments").query({ page: 2, pageSize: 1 })
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.pagination.totalPages).toBe(2)
    })

    it("rejects invalid list query values", async () => {
      const res = await adminAgent.get("/api/v1/payments").query({ method: "BOGUS" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("keeps tenants isolated by default filtering", async () => {
      await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const res = await otherAgent.get("/api/v1/payments")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
    })
  })

  describe("receipts", () => {
    it("lists receipts with immutable snapshots matching the payment", async () => {
      await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const res = await adminAgent.get("/api/v1/receipts")
      expect(res.status).toBe(200)
      const receipt = res.body.data.items[0]
      expect(receipt.receiptNumber).toBe("RCT-2026-0001")
      expect(receipt.studentName).toBe("Amina Adamu")
      expect(receipt.admissionNumber).toBe("STU-2026-0001")
      expect(receipt.className).toBe("Six")
      expect(receipt.sessionName).toBe("Fees Year")
      expect(receipt.invoiceNumber).toBe("INV-2026-1001")
      expect(receipt.amount).toBe(500)
      expect(receipt.balanceAfter).toBe(500)
      expect(receipt.method).toBe("CASH")
      expect(receipt.receivedByName).toBe("Fees Admin")
    })

    it("returns the receipt detail referencing its payment", async () => {
      const created = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const receiptId = created.body.data.payment.receipt.id
      const res = await adminAgent.get(`/api/v1/receipts/${receiptId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.sessionYear).toBe(2026)
      expect(res.body.data.invoiceTotal).toBe(1000)
      expect(res.body.data.payment.paymentNumber).toBe("PAY-2026-0001")
    })

    it("treats receipts as immutable: no update/delete routes exist", async () => {
      const created = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const receiptId = created.body.data.payment.receipt.id
      const patch = await adminAgent.patch(`/api/v1/receipts/${receiptId}`).send({ amount: 1 })
      expect(patch.status).toBe(404)
      const del = await adminAgent.delete(`/api/v1/receipts/${receiptId}`)
      expect(del.status).toBe(404)
      const res = await adminAgent.get(`/api/v1/receipts/${receiptId}`)
      expect(res.status).toBe(200)
    })

    it("returns 404 for a cross-tenant receipt", async () => {
      const created = await adminAgent.post("/api/v1/payments").send(paymentPayload(fixtures.invoiceAId))
      const foreign = await otherAgent.get(`/api/v1/receipts/${created.body.data.payment.receipt.id}`)
      expect(foreign.status).toBe(404)
    })
  })

  describe("financial mutations write a transactional audit trail", () => {
    it("records RECORD_PAYMENT rows attributed to the acting admin", async () => {
      const rows = await prisma.auditLog.findMany({
        where: { schoolId: fixtures.schoolId, action: "RECORD_PAYMENT", entityType: "FEE_PAYMENT" },
      })
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.actorName).toBe("Fees Admin")
        expect(row.actorRole).toBe(SUPER_ADMIN_ROLE)
        expect(row.entityId).toMatch(/^[0-9a-f-]{36}$/)
        const metadata = row.metadata as { amount?: number; paymentNumber?: string }
        expect(metadata.amount).toBe(500)
        expect(metadata.paymentNumber).toBeTruthy()
      }
    })

    it("records ISSUE_RECEIPT rows with the receipt number", async () => {
      const rows = await prisma.auditLog.findMany({
        where: { schoolId: fixtures.schoolId, action: "ISSUE_RECEIPT", entityType: "FEE_RECEIPT" },
      })
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.entityId).toMatch(/^[0-9a-f-]{36}$/)
        const metadata = row.metadata as { receiptNumber?: string; balanceAfter?: number }
        expect(metadata.receiptNumber).toBeTruthy()
        expect(typeof metadata.balanceAfter).toBe("number")
      }
    })

    it("does not audit denied or rejected payment attempts", async () => {
      const viewerRows = await prisma.auditLog.findMany({
        where: { schoolId: fixtures.schoolId, actorName: "Fees Viewer", entityType: "FEE_PAYMENT" },
      })
      expect(viewerRows.length).toBe(0)
    })
  })

  describe("schema presence (database-free within suite)", () => {
    it("exposes the phase 7B models on the generated client", () => {
      expect(Object.keys(Prisma.FeePaymentScalarFieldEnum)).toEqual(
        expect.arrayContaining([
          "invoiceId",
          "paymentNumber",
          "amount",
          "method",
          "transactionRef",
          "paymentDate",
          "idempotencyKey",
          "recordedBy",
        ]),
      )
      expect(Object.keys(Prisma.FeeReceiptScalarFieldEnum)).toEqual(
        expect.arrayContaining([
          "paymentId",
          "receiptNumber",
          "studentName",
          "balanceAfter",
          "receivedByName",
          "sessionYear",
        ]),
      )
    })
  })
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