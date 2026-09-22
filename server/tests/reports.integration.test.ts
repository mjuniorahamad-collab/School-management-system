import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const REPORT_PERMISSIONS = [
  { code: "reports:view", resource: "reports", action: "view" },
  { code: "reports:export", resource: "reports", action: "export" },
  { code: "students:view", resource: "students", action: "view" },
  { code: "admissions:view", resource: "admissions", action: "view" },
  { code: "attendance:view", resource: "attendance", action: "view" },
  { code: "results:view", resource: "results", action: "view" },
  { code: "fees:view", resource: "fees", action: "view" },
  { code: "payments:view", resource: "payments", action: "view" },
  { code: "receipts:view", resource: "receipts", action: "view" },
] as const

const FIXTURES = {
  schoolId: "",
  otherSchoolId: "",
  sessionId: "",
  otherSessionId: "",
  sessionA2Id: "",
  classGrade4: "",
  classGrade3: "",
  sectionGrade4A: "",
  enrollmentSt1: "",
  enrollmentSt2: "",
  enrollmentSt3: "",
  publishedExamId: "",
  draftExamId: "",
  examSubjectMath: "",
  examSubjectEnglish: "",
  examResultSt1: "",
  examResultSt2: "",
  otherExamId: "",
  invoice1Id: "",
  invoice2Id: "",
  invoice3Id: "",
} as Record<string, string>

const DATE = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function csvParser(
  res: {
    setEncoding(encoding: string): void
    on(event: "data", listener: (chunk: string) => void): void
    on(event: "end", listener: () => void): void
  },
  callback: (err: Error | null, body: unknown) => void,
): void {
  let text = ""
  res.setEncoding("utf8")
  res.on("data", (chunk) => {
    text += chunk
  })
  res.on("end", () => callback(null, text))
}

function csvGet(agent: ReturnType<typeof request.agent>, url: string) {
  return agent.get(url).buffer(true).parse(csvParser)
}

describe.skipIf(!TEST_DATABASE_URL)("Reports API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const managerAgent = request.agent(app)
  const studentsOnlyAgent = request.agent(app)
  const viewOnlyAgent = request.agent(app)
  const noAccessAgent = request.agent(app)

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")

    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "server/prisma/schema.prisma"],
      { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "pipe" },
    )

    prisma = new PrismaClient()
    await resetAllTables(prisma)

    // ── Schools ──────────────────────────────────────────────────────────────
    const school = await prisma.school.create({ data: { name: "Reports School" } })
    FIXTURES.schoolId = school.id
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } })
    FIXTURES.otherSchoolId = otherSchool.id

    async function session(schoolId: string, name: string, code: string, status: string) {
      return prisma.academicSession.create({
        data: {
          schoolId,
          name,
          code,
          startDate: DATE("2026-01-05"),
          endDate: DATE("2026-12-18"),
          status: status as "ACTIVE" | "UPCOMING" | "CLOSED",
        },
      })
    }
    const active = await session(school.id, "2026-2027", "2026", "ACTIVE")
    FIXTURES.sessionId = active.id
    const prior = await session(school.id, "2025-2026", "2025", "CLOSED")
    FIXTURES.sessionA2Id = prior.id
    const otherSession = await session(otherSchool.id, "Other 2026", "OTH-2026", "ACTIVE")
    FIXTURES.otherSessionId = otherSession.id

    // ── Classes / sections ───────────────────────────────────────────────────
    const grade4 = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 4", sortOrder: 4 } })
    FIXTURES.classGrade4 = grade4.id
    const grade3 = await prisma.class.create({ data: { schoolId: school.id, name: "Grade 3", sortOrder: 3 } })
    FIXTURES.classGrade3 = grade3.id
    const grade4a = await prisma.section.create({ data: { classId: grade4.id, name: "A" } })
    FIXTURES.sectionGrade4A = grade4a.id
    await prisma.section.create({ data: { classId: grade3.id, name: "A" } })

    // ── Students + enrollments ───────────────────────────────────────────────
    async function student(name: string, admission: string) {
      return prisma.student.create({
        data: {
          schoolId: school.id,
          admissionNumber: admission,
          firstName: name,
          dateOfBirth: DATE("2015-01-01"),
          gender: "FEMALE",
          status: "ACTIVE",
          email: `${admission.toLowerCase()}@example.com`,
          city: "Lagos",
          state: "Lagos",
          admissionDate: DATE("2026-01-10"),
        },
      })
    }
    const st1 = await student("Amara", "RPT-0001")
    const st2 = await student("Binta", "RPT-0002")
    const st3 = await student("Carla", "RPT-0003")
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: otherSchool.id,
        admissionNumber: "OTH-0001",
        firstName: "Evil",
        dateOfBirth: DATE("2015-01-01"),
        gender: "MALE",
        status: "ACTIVE",
        admissionDate: DATE("2026-01-10"),
      },
    })

    async function enroll(studentId: string, sessionId: string, classId: string, sectionId: string | null) {
      return prisma.studentEnrollment.create({
        data: { studentId, academicSessionId: sessionId, classId, sectionId },
      })
    }
    FIXTURES.enrollmentSt1 = (await enroll(st1.id, active.id, grade4.id, grade4a.id)).id
    FIXTURES.enrollmentSt2 = (await enroll(st2.id, active.id, grade4.id, grade4a.id)).id
    FIXTURES.enrollmentSt3 = (await enroll(st3.id, active.id, grade3.id, null)).id
    await enroll(otherStudent.id, otherSession.id, grade4.id, grade4a.id)

    // ── Attendance ───────────────────────────────────────────────────────────
    async function attendance(
      enrollmentId: string,
      studentId: string,
      date: string,
      status: string,
      classId: string,
      sectionId: string | null,
    ) {
      return prisma.attendanceRecord.create({
        data: {
          schoolId: school.id,
          academicSessionId: active.id,
          classId,
          sectionId,
          date: DATE(date),
          studentId,
          enrollmentId,
          status: status as "PRESENT" | "ABSENT" | "LATE" | "HOLIDAY",
        },
      })
    }
    await attendance(FIXTURES.enrollmentSt1, st1.id, "2026-07-01", "PRESENT", grade4.id, grade4a.id)
    await attendance(FIXTURES.enrollmentSt1, st1.id, "2026-07-02", "LATE", grade4.id, grade4a.id)
    await attendance(FIXTURES.enrollmentSt1, st1.id, "2026-07-03", "ABSENT", grade4.id, grade4a.id)
    await attendance(FIXTURES.enrollmentSt1, st1.id, "2026-07-06", "PRESENT", grade4.id, grade4a.id)
    await attendance(FIXTURES.enrollmentSt2, st2.id, "2026-07-01", "PRESENT", grade4.id, grade4a.id)
    await attendance(FIXTURES.enrollmentSt2, st2.id, "2026-07-02", "PRESENT", grade4.id, grade4a.id)
    await attendance(FIXTURES.enrollmentSt2, st2.id, "2026-07-03", "HOLIDAY", grade4.id, grade4a.id)
    await attendance(FIXTURES.enrollmentSt3, st3.id, "2026-07-01", "PRESENT", grade3.id, null)
    await attendance(FIXTURES.enrollmentSt3, st3.id, "2026-07-02", "ABSENT", grade3.id, null)

    // ── Admissions ───────────────────────────────────────────────────────────
    async function application(name: string, number: string, createdISO: string, status: string) {
      return prisma.admissionApplication.create({
        data: {
          schoolId: school.id,
          applicationNumber: number,
          firstName: name,
          dateOfBirth: DATE("2015-01-01"),
          gender: "FEMALE",
          status: status as "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "CONVERTED",
          guardianName: "Guardian",
          createdAt: DATE(createdISO),
        },
      })
    }
    await application("Amara", "RPT-APP-001", "2026-02-10", "CONVERTED")
    await application("Binta", "RPT-APP-002", "2026-02-20", "PENDING")
    await application("Carla", "RPT-APP-003", "2026-03-05", "REJECTED")
    await application("Dara", "RPT-APP-004", "2026-03-15", "WITHDRAWN")
    await prisma.admissionApplication.create({
      data: {
        schoolId: otherSchool.id,
        applicationNumber: "OTH-APP-001",
        firstName: "Evil",
        dateOfBirth: DATE("2015-01-01"),
        gender: "MALE",
        status: "CONVERTED",
        guardianName: "Guardian",
        createdAt: DATE("2026-02-10"),
      },
    })

    // ── Exams / results ──────────────────────────────────────────────────────
    const examType = await prisma.examType.create({
      data: { schoolId: school.id, code: "MT", name: "Mid-Term", sortOrder: 1 },
    })
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "RPT-T-001",
        firstName: "Mr",
        lastName: "Tutor",
        gender: "MALE",
        designation: "Teacher",
        status: "ACTIVE",
        joiningDate: DATE("2024-01-01"),
      },
    })
    const math = await prisma.subject.create({ data: { schoolId: school.id, code: "MATH", name: "Mathematics", sortOrder: 1 } })
    const english = await prisma.subject.create({ data: { schoolId: school.id, code: "ENG", name: "English", sortOrder: 2 } })

    async function exam(
      name: string,
      status: string,
      classId: string,
      sectionId: string | null,
      sessionId: string,
      schoolId: string,
    ) {
      return prisma.exam.create({
        data: {
          schoolId,
          academicSessionId: sessionId,
          examTypeId: examType.id,
          name,
          classId,
          sectionId,
          startDate: DATE("2026-06-01"),
          endDate: DATE("2026-06-10"),
          status: status as "DRAFT" | "PUBLISHED" | "FINAL" | "ARCHIVED",
          publishedAt: status === "PUBLISHED" ? DATE("2026-06-20") : null,
          finalizedAt: null,
        },
      })
    }
    const published = await exam("Mid-Term Exam", "PUBLISHED", grade4.id, grade4a.id, active.id, school.id)
    FIXTURES.publishedExamId = published.id
    const draft = await exam("Draft Exam", "DRAFT", grade4.id, null, active.id, school.id)
    FIXTURES.draftExamId = draft.id
    const otherExam = await exam("Other Exam", "PUBLISHED", grade4.id, grade4a.id, otherSession.id, otherSchool.id)
    FIXTURES.otherExamId = otherExam.id

    async function examSubject(examId: string, subjectId: string, sortOrder: number) {
      return prisma.examSubject.create({
        data: { examId, subjectId, teacherId: teacher.id, maxMarks: 100, passMarks: 40, sortOrder },
      })
    }
    FIXTURES.examSubjectMath = (await examSubject(published.id, math.id, 1)).id
    FIXTURES.examSubjectEnglish = (await examSubject(published.id, english.id, 2)).id

    async function result(examId: string, studentId: string, enrollmentId: string, data: {
      totalObtained: number
      totalMaxMarks: number
      totalPercentage: number
      grade: string
      isPass: boolean
      rank: number
    }) {
      return prisma.examResult.create({
        data: {
          schoolId: school.id,
          examId,
          studentId,
          enrollmentId,
          isComplete: true,
          ...data,
        },
      })
    }
    FIXTURES.examResultSt1 = (
      await result(published.id, st1.id, FIXTURES.enrollmentSt1, {
        totalObtained: 180,
        totalMaxMarks: 200,
        totalPercentage: 90,
        grade: "A",
        isPass: true,
        rank: 1,
      })
    ).id
    FIXTURES.examResultSt2 = (
      await result(published.id, st2.id, FIXTURES.enrollmentSt2, {
        totalObtained: 150,
        totalMaxMarks: 200,
        totalPercentage: 75,
        grade: "B",
        isPass: true,
        rank: 2,
      })
    ).id

    async function mark(examResultId: string, examSubjectId: string, obtained: number, percentage: number) {
      return prisma.examMark.create({
        data: {
          schoolId: school.id,
          examResultId,
          examSubjectId,
          obtainedMarks: obtained,
          isAbsent: false,
          percentage,
          grade: percentage >= 50 ? "A" : "B",
          isPass: true,
        },
      })
    }
    await mark(FIXTURES.examResultSt1, FIXTURES.examSubjectMath, 90, 90)
    await mark(FIXTURES.examResultSt1, FIXTURES.examSubjectEnglish, 90, 90)
    await mark(FIXTURES.examResultSt2, FIXTURES.examSubjectMath, 80, 80)
    await mark(FIXTURES.examResultSt2, FIXTURES.examSubjectEnglish, 70, 70)

    // ── Fee invoices / payments / receipts ───────────────────────────────────
    async function invoice(
      studentRow: { id: string; name: string; admissionNumber: string },
      enrollmentId: string,
      invoiceNumber: string,
      total: number,
      classPlacement: { className: string; sectionName: string | null },
      installments: { installmentNo: number; label: string; dueISO: string; amount: number; paid: number },
    ) {
      return prisma.feeInvoice.create({
        data: {
          schoolId: school.id,
          studentId: studentRow.id,
          enrollmentId,
          sessionId: active.id,
          invoiceNumber,
          className: classPlacement.className,
          sectionName: classPlacement.sectionName,
          sessionName: active.name,
          grossAmount: total,
          totalAmount: total,
          amountPaid: installments.reduce((sum, i) => sum + i.paid, 0),
          balance: total - installments.reduce((sum, i) => sum + i.paid, 0),
          status: installments.every((i) => i.paid >= i.amount) ? "PAID" : "UNPAID",
          items: [],
          installments: {
            create: installments.map((i) => ({
              schoolId: school.id,
              installmentNo: i.installmentNo,
              label: i.label,
              amount: i.amount,
              dueDate: DATE(i.dueISO),
              amountPaid: i.paid,
              balance: i.amount - i.paid,
              status: i.paid >= i.amount ? "PAID" : "UNPAID",
              sortOrder: i.installmentNo,
            })),
          },
        },
        include: { installments: true },
      })
    }
    const grade4Placement = { className: grade4.name, sectionName: grade4a.name }
    const grade3Placement = { className: grade3.name, sectionName: null }
    const inv1 = await invoice(
      { id: st1.id, name: "Amara", admissionNumber: "RPT-0001" },
      FIXTURES.enrollmentSt1,
      "RPT-INV-001",
      1000,
      grade4Placement,
      [{ installmentNo: 1, label: "Term 1", dueISO: "2026-09-30", amount: 1000, paid: 1000 }],
    )
    FIXTURES.invoice1Id = inv1.id
    const inv2 = await invoice(
      { id: st2.id, name: "Binta", admissionNumber: "RPT-0002" },
      FIXTURES.enrollmentSt2,
      "RPT-INV-002",
      800,
      grade4Placement,
      [
        { installmentNo: 1, label: "Term 1", dueISO: "2026-05-15", amount: 400, paid: 100 },
        { installmentNo: 2, label: "Term 2", dueISO: "2026-09-30", amount: 400, paid: 0 },
      ],
    )
    FIXTURES.invoice2Id = inv2.id
    const inv3 = await invoice(
      { id: st3.id, name: "Carla", admissionNumber: "RPT-0003" },
      FIXTURES.enrollmentSt3,
      "RPT-INV-003",
      600,
      grade3Placement,
      [{ installmentNo: 1, label: "Term 1", dueISO: "2026-12-31", amount: 600, paid: 0 }],
    )
    FIXTURES.invoice3Id = inv3.id

    async function payment(
      invoiceId: string,
      studentRow: { id: string; name: string; admissionNumber: string },
      invoiceMeta: { invoiceNumber: string; invoiceTotal: number },
      paymentNumber: string,
      receiptNumber: string,
      amount: number,
      balanceAfter: number,
      method: string,
      paymentISO: string,
    ) {
      const feePayment = await prisma.feePayment.create({
        data: {
          schoolId: school.id,
          invoiceId,
          paymentNumber,
          amount,
          method: method as "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "OTHER",
          paymentDate: DATE(paymentISO),
          status: "SUCCESS",
        },
      })
      await prisma.feeReceipt.create({
        data: {
          schoolId: school.id,
          paymentId: feePayment.id,
          invoiceId,
          receiptNumber,
          studentId: studentRow.id,
          studentName: studentRow.name,
          admissionNumber: studentRow.admissionNumber,
          className: grade4.name,
          sectionName: grade4a.name,
          sessionName: active.name,
          sessionYear: 2026,
          invoiceNumber: invoiceMeta.invoiceNumber,
          invoiceTotal: invoiceMeta.invoiceTotal,
          amount,
          balanceAfter,
          method: method as "CASH" | "BANK_TRANSFER" | "CHEQUE" | "CARD" | "OTHER",
          paymentDate: DATE(paymentISO),
        },
      })
    }
    await payment(
      FIXTURES.invoice1Id,
      { id: st1.id, name: "Amara", admissionNumber: "RPT-0001" },
      { invoiceNumber: "RPT-INV-001", invoiceTotal: 1000 },
      "RPT-PAY-001",
      "RPT-RCP-001",
      1000,
      0,
      "CASH",
      "2026-05-11",
    )
    await payment(
      FIXTURES.invoice2Id,
      { id: st2.id, name: "Binta", admissionNumber: "RPT-0002" },
      { invoiceNumber: "RPT-INV-002", invoiceTotal: 800 },
      "RPT-PAY-002",
      "RPT-RCP-002",
      100,
      700,
      "BANK_TRANSFER",
      "2026-05-10",
    )

    // A cross-tenant receipt that must never appear in school A's register.
    const otherPayment = await prisma.feePayment.create({
      data: {
        schoolId: otherSchool.id,
        invoiceId: (await prisma.feeInvoice.create({
          data: {
            schoolId: otherSchool.id,
            studentId: otherStudent.id,
            enrollmentId: (await prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: otherStudent.id } })).id,
            sessionId: otherSession.id,
            invoiceNumber: "OTH-INV-001",
            className: grade4.name,
            sectionName: grade4a.name,
            sessionName: otherSession.name,
            grossAmount: 500,
            totalAmount: 500,
            amountPaid: 0,
            balance: 500,
            status: "UNPAID",
            items: [],
          },
        })).id,
        paymentNumber: "OTH-PAY-001",
        amount: 500,
        method: "CASH",
        paymentDate: DATE("2026-05-11"),
        status: "SUCCESS",
      },
    })
    await prisma.feeReceipt.create({
      data: {
        schoolId: otherSchool.id,
        paymentId: otherPayment.id,
        invoiceId: otherPayment.invoiceId,
        receiptNumber: "OTH-RCP-001",
        studentId: otherStudent.id,
        studentName: "Evil",
        admissionNumber: "OTH-0001",
        className: grade4.name,
        sectionName: grade4a.name,
        sessionName: otherSession.name,
        sessionYear: 2026,
        invoiceNumber: "OTH-INV-001",
        invoiceTotal: 500,
        amount: 500,
        balanceAfter: 0,
        method: "CASH",
        paymentDate: DATE("2026-05-11"),
      },
    })

    // ── Users / roles / login ────────────────────────────────────────────────
    const superAdminRole = await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const managerRole = await prisma.role.create({ data: { name: "REPORTS_MANAGER_TEST", description: "All reports" } })
    const studentsOnlyRole = await prisma.role.create({ data: { name: "REPORTS_STUDENTS_TEST", description: "Roster only" } })
    const viewOnlyRole = await prisma.role.create({ data: { name: "REPORTS_VIEW_TEST", description: "reports:view only" } })
    const noAccessRole = await prisma.role.create({ data: { name: "REPORTS_NONE_TEST", description: "No access" } })

    for (const permission of REPORT_PERMISSIONS) {
      const row = await prisma.permission.create({ data: { ...permission } })
      await prisma.rolePermission.create({ data: { roleId: managerRole.id, permissionId: row.id } })
      if (permission.code === "reports:view") {
        await prisma.rolePermission.create({ data: { roleId: studentsOnlyRole.id, permissionId: row.id } })
        await prisma.rolePermission.create({ data: { roleId: viewOnlyRole.id, permissionId: row.id } })
      }
      if (permission.code === "students:view") {
        await prisma.rolePermission.create({ data: { roleId: studentsOnlyRole.id, permissionId: row.id } })
      }
    }

    async function createUser(name: string, email: string, roleId: string, password: string) {
      const user = await prisma.user.create({
        data: {
          schoolId: school.id,
          name,
          email,
          passwordHash: hashPassword(password),
          status: "ACTIVE",
          roles: { create: [{ role: { connect: { id: roleId } } }] },
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId: school.id, roleId, status: "ACTIVE" },
      })
      return user
    }
    // The SUPER_ADMIN role row already exists; reuse the same role for the admin.
    const superUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Reports Admin",
        email: "reports.admin@example.com",
        passwordHash: hashPassword("admin-secret-123"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: superAdminRole.id } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: superUser.id, schoolId: school.id, roleId: superAdminRole.id, status: "ACTIVE" },
    })
    await createUser("Manager", "reports.manager@example.com", managerRole.id, "manager-secret-123")
    await createUser("Students Only", "reports.students@example.com", studentsOnlyRole.id, "students-secret-123")
    await createUser("View Only", "reports.view@example.com", viewOnlyRole.id, "view-secret-123")
    await createUser("None", "reports.none@example.com", noAccessRole.id, "none-secret-123")

    await login(adminAgent, "reports.admin@example.com", "admin-secret-123")
    await login(managerAgent, "reports.manager@example.com", "manager-secret-123")
    await login(studentsOnlyAgent, "reports.students@example.com", "students-secret-123")
    await login(viewOnlyAgent, "reports.view@example.com", "view-secret-123")
    await login(noAccessAgent, "reports.none@example.com", "none-secret-123")
  })

  afterEach(async () => {
    if (prisma) await prisma.auditLog.deleteMany()
  })

  afterAll(async () => {
    if (!prisma) return
    // Leave the shared test database exactly as it was found so the other DB
    // suites (whose resets predate the fee/exam tables) see a clean tenant.
    await resetAllTables(prisma)
    await prisma.$disconnect()
  })

  // ─── RBAC and authentication ───────────────────────────────────────────────

  describe("RBAC and authentication", () => {
    it("rejects unauthenticated catalog access", async () => {
      const res = await request(app).get("/api/v1/reports")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("denies a role without reports:view", async () => {
      const res = await noAccessAgent.get("/api/v1/reports")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("scopes the catalog to reports the actor can run", async () => {
      const res = await managerAgent.get("/api/v1/reports")
      expect(res.status).toBe(200)
      expect(res.body.data.map((entry: { key: string }) => entry.key)).toHaveLength(6)
    })

    it("hides reports whose underlying permission the actor lacks", async () => {
      const res = await studentsOnlyAgent.get("/api/v1/reports")
      expect(res.status).toBe(200)
      expect(res.body.data.map((entry: { key: string }) => entry.key)).toEqual(["student-roster"])
    })

    it("returns an empty catalog for reports:view-only accounts", async () => {
      const res = await viewOnlyAgent.get("/api/v1/reports")
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it("enforces the per-report permission gate on direct calls", async () => {
      const roster = await viewOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.sessionId}`)
      expect(roster.status).toBe(403)
      const rosterOk = await studentsOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.sessionId}`)
      expect(rosterOk.status).toBe(200)
      const fee = await studentsOnlyAgent.get(`/api/v1/reports/fee-collection?sessionId=${FIXTURES.sessionId}`)
      expect(fee.status).toBe(403)
      expect(fee.body.error.code).toBe("FORBIDDEN")
    })

    it("requires reports:export for CSV downloads", async () => {
      const res = await studentsOnlyAgent.get(`/api/v1/reports/student-roster/export?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(403)
    })
  })

  // ─── Student roster ────────────────────────────────────────────────────────

  describe("student roster", () => {
    it("lists enrolled students sorted by name with a class breakdown", async () => {
      const res = await studentsOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.summary.total).toBe(3)
      expect(data.items.map((item: { name: string }) => item.name)).toEqual(["Amara", "Binta", "Carla"])
      expect(data.summary.classBreakdown).toEqual(
        expect.arrayContaining([
          { classId: FIXTURES.classGrade3, className: "Grade 3", count: 1 },
          { classId: FIXTURES.classGrade4, className: "Grade 4", count: 2 },
        ]),
      )
      expect(data.session.name).toBe("2026-2027")
    })

    it("honors class, search and pagination filters", async () => {
      const byClass = await studentsOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.sessionId}&classId=${FIXTURES.classGrade4}`)
      expect(byClass.body.data.summary.total).toBe(2)

      const search = await studentsOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.sessionId}&search=amara`)
      expect(search.body.data.summary.total).toBe(1)
      expect(search.body.data.items[0].name).toBe("Amara")

      const paged = await studentsOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.sessionId}&page=1&pageSize=1`)
      expect(paged.body.data.items).toHaveLength(1)
      expect(paged.body.data.pagination.totalPages).toBe(3)
    })

    it("rejects a session that belongs to another school", async () => {
      const res = await studentsOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.otherSessionId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("validates required query parameters", async () => {
      const missing = await studentsOnlyAgent.get("/api/v1/reports/student-roster")
      expect(missing.status).toBe(400)
      const badPage = await studentsOnlyAgent.get(`/api/v1/reports/student-roster?sessionId=${FIXTURES.sessionId}&pageSize=9999`)
      expect(badPage.status).toBe(400)
    })
  })

  // ─── Admissions summary ────────────────────────────────────────────────────

  describe("admissions summary", () => {
    it("computes status counts, conversion rate and monthly buckets", async () => {
      const res = await managerAgent.get("/api/v1/reports/admissions-summary?from=2026-02-01&to=2026-03-31")
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.summary.total).toBe(4)
      expect(data.summary.converted).toBe(1)
      expect(data.summary.conversionRate).toBe(25)
      expect(data.summary.statusCounts).toEqual({ PENDING: 1, CONVERTED: 1, REJECTED: 1, WITHDRAWN: 1 })
      expect(data.items).toEqual([
        { month: "2026-02", total: 2, statusCounts: { CONVERTED: 1, PENDING: 1 } },
        { month: "2026-03", total: 2, statusCounts: { REJECTED: 1, WITHDRAWN: 1 } },
      ])
    })

    it("filters by status and rejects malformed dates", async () => {
      const filtered = await managerAgent.get("/api/v1/reports/admissions-summary?from=2026-02-01&to=2026-03-31&status=PENDING")
      expect(filtered.body.data.summary.total).toBe(1)
      const bad = await managerAgent.get("/api/v1/reports/admissions-summary?from=02/2026&to=2026-03-31")
      expect(bad.status).toBe(400)
    })
  })

  // ─── Attendance summary ────────────────────────────────────────────────────

  describe("attendance summary", () => {
    it("aggregates overall, per-class and per-day counts", async () => {
      const res = await managerAgent.get(`/api/v1/reports/attendance-summary?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.summary).toEqual({ present: 5, late: 1, absent: 2, holiday: 1, total: 9, presentRate: 75 })
      const grade4 = data.classes.find((row: { className: string }) => row.className === "Grade 4")
      expect(grade4).toMatchObject({ present: 4, late: 1, absent: 1, holiday: 1, total: 7 })
      const d1 = data.daily.find((row: { date: string }) => row.date === "2026-07-01")
      expect(d1).toMatchObject({ present: 3, absent: 0, presentRate: 100 })
    })

    it("scopes to a date window", async () => {
      const res = await managerAgent.get(`/api/v1/reports/attendance-summary?sessionId=${FIXTURES.sessionId}&from=2026-07-06&to=2026-07-06`)
      expect(res.status).toBe(200)
      expect(res.body.data.daily).toHaveLength(1)
      expect(res.body.data.summary.total).toBe(1)
    })

    it("rejects other-school sessions", async () => {
      const res = await managerAgent.get(`/api/v1/reports/attendance-summary?sessionId=${FIXTURES.otherSessionId}`)
      expect(res.status).toBe(404)
    })
  })

  // ─── Academic performance ─────────────────────────────────────────────────

  describe("academic performance", () => {
    it("aggregates per-student and per-class performance for one exam", async () => {
      const res = await managerAgent.get(
        `/api/v1/reports/academic-performance?sessionId=${FIXTURES.sessionId}&examId=${FIXTURES.publishedExamId}`,
      )
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.exam.name).toBe("Mid-Term Exam")
      expect(data.items.map((item: { rank: number }) => item.rank)).toEqual([1, 2])
      expect(data.summary).toMatchObject({
        students: 2,
        completeStudents: 2,
        averagePercentage: 82.5,
        passCount: 2,
        passRate: 100,
      })
      expect(data.classes).toEqual([{ rank: 1, className: "Grade 4", performance: 82.5, students: 2 }])
      const math = data.summary.subjects.find((s: { subjectCode: string }) => s.subjectCode === "MATH")
      expect(math).toMatchObject({ maxMarks: 100, attemptedMarks: 2, averagePercentage: 85 })
    })

    it("rejects draft exams and cross-school exams", async () => {
      const draft = await managerAgent.get(
        `/api/v1/reports/academic-performance?sessionId=${FIXTURES.sessionId}&examId=${FIXTURES.draftExamId}`,
      )
      expect(draft.status).toBe(400)
      expect(draft.body.error.message).toContain("published")

      const cross = await managerAgent.get(
        `/api/v1/reports/academic-performance?sessionId=${FIXTURES.sessionId}&examId=${FIXTURES.otherExamId}`,
      )
      expect(cross.status).toBe(404)
    })

    it("requires the exam to belong to the selected session", async () => {
      const res = await managerAgent.get(
        `/api/v1/reports/academic-performance?sessionId=${FIXTURES.sessionA2Id}&examId=${FIXTURES.publishedExamId}`,
      )
      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("selected session")
    })
  })

  describe("exam options", () => {
    it("lists only published/final exams for the session", async () => {
      const res = await managerAgent.get(`/api/v1/reports/exam-options?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0]).toMatchObject({ name: "Mid-Term Exam", subjectCount: 2, examTypeName: "Mid-Term" })
    })

    it("requires results:view in addition to reports:view", async () => {
      const res = await studentsOnlyAgent.get(`/api/v1/reports/exam-options?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(403)
    })

    it("rejects cross-school sessions", async () => {
      const res = await managerAgent.get(`/api/v1/reports/exam-options?sessionId=${FIXTURES.otherSessionId}`)
      expect(res.status).toBe(404)
    })
  })

  // ─── Fee collection ───────────────────────────────────────────────────────

  describe("fee collection", () => {
    it("derives invoice statuses and totals from canonical invoice data", async () => {
      const res = await managerAgent.get(`/api/v1/reports/fee-collection?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.summary).toMatchObject({ invoiceCount: 3, invoiced: 2400, collected: 1100, outstanding: 1300 })
      const statuses = data.items.map((item: { status: string }) => item.status).sort()
      expect(statuses).toEqual(["OVERDUE", "PAID", "UNPAID"])
      const inv2 = data.items.find((item: { invoiceNumber: string }) => item.invoiceNumber === "RPT-INV-002")
      expect(inv2).toMatchObject({ nextDueDate: "2026-05-15", balance: 700 })
    })

    it("filters by derived invoice status", async () => {
      const res = await managerAgent.get(`/api/v1/reports/fee-collection?sessionId=${FIXTURES.sessionId}&status=OVERDUE`)
      expect(res.status).toBe(200)
      expect(res.body.data.summary.invoiceCount).toBe(1)
      expect(res.body.data.items[0].invoiceNumber).toBe("RPT-INV-002")
    })

    it("rejects cross-school sessions", async () => {
      const res = await managerAgent.get(`/api/v1/reports/fee-collection?sessionId=${FIXTURES.otherSessionId}`)
      expect(res.status).toBe(404)
    })
  })

  // ─── Payment register ─────────────────────────────────────────────────────

  describe("payment register", () => {
    it("summarizes receipts over the range and paginates", async () => {
      const res = await managerAgent.get("/api/v1/reports/payment-register?from=2026-05-01&to=2026-05-31")
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.summary).toMatchObject({ count: 2, totalAmount: 1100, methodCounts: { CASH: 1, BANK_TRANSFER: 1 } })
      expect(data.items).toHaveLength(2)
      expect(data.pagination.totalPages).toBe(1)
    })

    it("never leaks another school's receipts", async () => {
      const res = await managerAgent.get("/api/v1/reports/payment-register?from=2026-05-01&to=2026-05-31")
      expect(res.status).toBe(200)
      const numbers = res.body.data.items.map((item: { receiptNumber: string }) => item.receiptNumber)
      expect(numbers).not.toContain("OTH-RCP-001")
      expect(numbers).toEqual(expect.arrayContaining(["RPT-RCP-001", "RPT-RCP-002"]))
    })

    it("filters by method and empty ranges", async () => {
      const cash = await managerAgent.get("/api/v1/reports/payment-register?from=2026-05-01&to=2026-05-31&method=CASH")
      expect(cash.body.data.items).toHaveLength(1)
      expect(cash.body.data.items[0].method).toBe("CASH")
      const empty = await managerAgent.get("/api/v1/reports/payment-register?from=2026-01-01&to=2026-01-05")
      expect(empty.body.data.summary.count).toBe(0)
    })
  })

  // ─── Export & audit ───────────────────────────────────────────────────────

  describe("export & audit trail", () => {
    it("downloads a BOM/CRLF CSV roster and audits the export", async () => {
      const res = await csvGet(managerAgent, `/api/v1/reports/student-roster/export?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("text/csv")
      expect(res.headers["content-disposition"]).toContain("attachment")
      const csv = res.body as string
      expect(csv.startsWith("\uFEFF")).toBe(true)
      expect(csv).toContain('"Admission Number"')
      expect(csv).toContain('"RPT-0001"')
      expect(csv).toContain("\r\n")

      const audit = await prisma.auditLog.findMany({ where: { schoolId: FIXTURES.schoolId } })
      expect(audit).toHaveLength(1)
      expect(audit[0]).toMatchObject({ action: "EXPORT", entityType: "REPORT", summary: "Exported the \"Student Roster\" report" })
      expect(audit[0].metadata).toMatchObject({ reportKey: "student-roster", rowCount: 3 })
    })

    it("audits fee exports with an item count", async () => {
      const res = await csvGet(managerAgent, `/api/v1/reports/fee-collection/export?sessionId=${FIXTURES.sessionId}`)
      expect(res.status).toBe(200)
      const csv = res.body as string
      expect(csv).toContain('"RPT-INV-003"')
      const audit = await prisma.auditLog.findMany({ where: { entityType: "REPORT" } })
      expect(audit.some((row) => (row.metadata as { reportKey?: string }).reportKey === "fee-collection")).toBe(true)
      expect(audit.find((row) => (row.metadata as { reportKey?: string }).reportKey === "fee-collection")?.metadata).toMatchObject({ rowCount: 3 })
    })

    it("audits register exports with the full-range total", async () => {
      const res = await csvGet(managerAgent, "/api/v1/reports/payment-register/export?from=2026-05-01&to=2026-05-31")
      expect(res.status).toBe(200)
      const csv = res.body as string
      expect(csv).toContain('"RPT-RCP-001"')
      expect(csv).not.toContain('"OTH-RCP-001"')
      const audit = await prisma.auditLog.findMany({ where: { entityType: "REPORT" } })
      expect(audit.find((row) => (row.metadata as { reportKey?: string }).reportKey === "payment-register")?.metadata).toMatchObject({ rowCount: 2 })
    })

    it("rejects invalid report keys", async () => {
      const res = await managerAgent.get("/api/v1/reports/not-a-report")
      expect(res.status).toBe(400)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeReceipt" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeePayment" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInstallment" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamMark" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamResult" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamSubject" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Exam" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ExamType" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "TeacherSubject" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "TeacherClass" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Teacher" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Subject" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AdmissionApplication" CASCADE')
  await prisma.attendanceRecord.deleteMany()
  await prisma.timetableEntry.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.section.deleteMany()
  await prisma.class.deleteMany()
  await prisma.academicSession.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.tenantMembership.deleteMany()
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