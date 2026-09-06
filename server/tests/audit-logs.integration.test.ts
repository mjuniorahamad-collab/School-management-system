import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"
import { recordAudit } from "../src/modules/audit-logs/audit-log.service.js"
import type { AuditRecordInput } from "../src/modules/audit-logs/audit-log.types.js"

// Audit Logs module — immutable, tenant-scoped audit trail.
//
// Verifies:
//   - RBAC: unauthenticated 401, TEACHER 403, PRINCIPAL view-only (export 403),
//     SCHOOL_ADMIN view + export
//   - tenant isolation: list only shows the caller's school; direct-ID across
//     tenants resolves to 404
//   - filters: entityType, action, actor, entityId, search, date range
//   - pagination
//   - write-time sanitization: secrets never reach the DB even when a caller
//     passes them (defense-in-depth)
//   - transactional coupling: audit rows commit with the business tx and
//     roll back with it
//   - append-only API: no create/update/delete routes exist
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const ROLES = [SUPER_ADMIN_ROLE, "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"] as const

describe.skipIf(!TEST_DATABASE_URL)("Audit Logs (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  const roleIds: Record<string, string> = {}
  const memberUserIds: Record<string, string> = {}
  let auditSessionId = ""
  let auditClassId = ""
  let auditFeeHeadId = ""

  const adminAAgent = request.agent(app)
  const adminBAgent = request.agent(app)
  const principalAAgent = request.agent(app)
  const teacherAAgent = request.agent(app)

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

    for (const name of ROLES) {
      const role = await prisma.role.create({ data: { name, description: name } })
      roleIds[name] = role.id
    }

    for (const code of ["audit-logs:view", "audit-logs:export", "fees:create", "fees:update"]) {
      const [resource, action] = code.split(":")
      await prisma.permission.create({ data: { code, resource, action, description: code } })
    }
    const granted = await prisma.permission.findMany({
      where: { code: { in: ["audit-logs:view", "audit-logs:export", "fees:create", "fees:update"] } },
    })
    const viewOnly = granted.filter((permission) => permission.code === "audit-logs:view")
    const viewAndExport = granted
    await prisma.rolePermission.createMany({
      data: [
        ...viewOnly.map((permission) => ({ roleId: roleIds.PRINCIPAL, permissionId: permission.id })),
        ...viewAndExport.map((permission) => ({ roleId: roleIds.SCHOOL_ADMIN, permissionId: permission.id })),
      ],
    })

    const a = await prisma.school.create({ data: { name: "Audit School A" } })
    schoolA.id = a.id
    const b = await prisma.school.create({ data: { name: "Audit School B" } })
    schoolB.id = b.id

    const createMember = async (
      email: string,
      name: string,
      schoolId: string,
      roleId: string,
    ): Promise<string> => {
      const user = await prisma.user.create({
        data: { email, name, passwordHash: hashPassword("password-123456"), status: "ACTIVE" },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
      })
      return user.id
    }

    memberUserIds.adminA = await createMember("audit.admin.a@example.com", "Admin A", schoolA.id, roleIds.SCHOOL_ADMIN)
    memberUserIds.principalA = await createMember("audit.principal.a@example.com", "Principal A", schoolA.id, roleIds.PRINCIPAL)
    memberUserIds.teacherA = await createMember("audit.teacher.a@example.com", "Teacher A", schoolA.id, roleIds.TEACHER)
    memberUserIds.adminB = await createMember("audit.admin.b@example.com", "Admin B", schoolB.id, roleIds.SCHOOL_ADMIN)

    // Fee fixtures used to drive the critical finance instrumentation paths.
    const auditSession = await prisma.academicSession.create({
      data: {
        schoolId: schoolA.id,
        name: "Audit Year 2026",
        code: "AUD2026",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    auditSessionId = auditSession.id
    const auditClass = await prisma.class.create({
      data: { schoolId: schoolA.id, name: "Seven", sortOrder: 7 },
    })
    auditClassId = auditClass.id
    const auditFeeHead = await prisma.feeHead.create({
      data: { schoolId: schoolA.id, code: "TUITION", name: "Tuition", isRecurring: true },
    })
    auditFeeHeadId = auditFeeHead.id
    const auditStudent = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        admissionNumber: "STU-AUD-0001",
        firstName: "Audit",
        lastName: "Pupil",
        dateOfBirth: new Date("2013-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        admissionDate: new Date("2026-01-05T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    await prisma.studentEnrollment.create({
      data: {
        studentId: auditStudent.id,
        academicSessionId: auditSession.id,
        classId: auditClass.id,
      },
    })

    // Seed historical audit records simulating prior instrumentation.
    const schoolARecords: (Omit<AuditRecordInput, "actorId" | "actorName"> & { actor: keyof typeof memberUserIds })[] = [
      {
        actor: "adminA",
        schoolId: schoolA.id,
        action: "CREATE",
        entityType: "USER",
        summary: "Created user 'Priya' with role TEACHER",
      },
      {
        actor: "adminA",
        schoolId: schoolA.id,
        action: "MEMBER_ROLE_CHANGE",
        entityType: "TENANT_MEMBERSHIP",
        summary: "Changed Priya's role to ACCOUNTANT",
        diff: { fields: [{ field: "roleId", before: "T", after: "A" }] },
      },
      {
        actor: "principalA",
        schoolId: schoolA.id,
        action: "RECORD_PAYMENT",
        entityType: "FEE_PAYMENT",
        summary: "Recorded payment of 5000",
        metadata: { amount: 5000, method: "CASH" },
      },
      {
        actor: "principalA",
        schoolId: schoolA.id,
        action: "CONVERT",
        entityType: "ADMISSION",
        summary: "Converted application to student",
      },
    ]
    const actorNames: Record<keyof typeof memberUserIds, string> = {
      adminA: "Admin A",
      principalA: "Principal A",
      teacherA: "Teacher A",
      adminB: "Admin B",
    }
    for (const record of schoolARecords) {
      const { actor, ...input } = record
      await recordAudit(prisma, {
        ...input,
        actorId: memberUserIds[actor],
        actorName: actorNames[actor],
        actorRole: "SCHOOL_ADMIN",
      })
    }

    // A school B record must never be visible to school A agents.
    await recordAudit(prisma, {
      schoolId: schoolB.id,
      actorId: memberUserIds.adminB,
      actorName: "Admin B",
      actorRole: "SCHOOL_ADMIN",
      action: "UPDATE",
      entityType: "STUDENT",
      summary: "Updated a student in school B",
    })

    await login(adminAAgent, "audit.admin.a@example.com", "password-123456")
    await login(adminBAgent, "audit.admin.b@example.com", "password-123456")
    await login(principalAAgent, "audit.principal.a@example.com", "password-123456")
    await login(teacherAAgent, "audit.teacher.a@example.com", "password-123456")
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  describe("RBAC", () => {
    it("rejects unauthenticated access (401)", async () => {
      const res = await request(app).get("/api/v1/audit-logs")
      expect(res.status).toBe(401)
    })

    it("blocks a TEACHER from viewing the audit trail (403)", async () => {
      const res = await teacherAAgent.get("/api/v1/audit-logs")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("blocks a TEACHER from reading a single record (403)", async () => {
      const res = await teacherAAgent.get("/api/v1/audit-logs/whatever")
      expect(res.status).toBe(403)
    })

    it("lets a PRINCIPAL view the trail", async () => {
      const res = await principalAAgent.get("/api/v1/audit-logs")
      expect(res.status).toBe(200)
    })

    it("denies PRINCIPAL export while SCHOOL_ADMIN can export", async () => {
      const denied = await principalAAgent.get("/api/v1/audit-logs/export")
      expect(denied.status).toBe(403)

      const res = await adminAAgent.get("/api/v1/audit-logs/export")
      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("text/csv")
      expect(res.text).toContain("Timestamp")
      expect(res.text).toContain("Recorded payment of 5000")
    })
  })

  describe("tenant isolation", () => {
    it("lists only the caller's tenant records", async () => {
      const res = await adminAAgent.get("/api/v1/audit-logs")
      expect(res.status).toBe(200)
      const summaries = res.body.data.items.map((item: { summary: string }) => item.summary)
      expect(summaries).toContain("Recorded payment of 5000")
      expect(summaries).not.toContain("Updated a student in school B")

      const resB = await adminBAgent.get("/api/v1/audit-logs")
      const summariesB = resB.body.data.items.map((item: { summary: string }) => item.summary)
      expect(summariesB).toContain("Updated a student in school B")
      expect(summariesB).not.toContain("Recorded payment of 5000")
    })

    it("resolves direct-ID access across tenants to 404", async () => {
      const list = await adminAAgent.get("/api/v1/audit-logs")
      const firstId = list.body.data.items[0].id

      const fromB = await adminBAgent.get(`/api/v1/audit-logs/${firstId}`)
      expect(fromB.status).toBe(404)
      expect(fromB.body.error.code).toBe("NOT_FOUND")

      const fromA = await adminAAgent.get(`/api/v1/audit-logs/${firstId}`)
      expect(fromA.status).toBe(200)
      expect(fromA.body.data.id).toBe(firstId)
    })
  })

  describe("filters and search", () => {
    it("filters by entityType", async () => {
      const res = await adminAAgent.get("/api/v1/audit-logs?entityType=FEE_PAYMENT")
      expect(res.status).toBe(200)
      expect(res.body.data.pagination.total).toBe(1)
      expect(res.body.data.items[0].entityType).toBe("FEE_PAYMENT")
    })

    it("filters by action", async () => {
      const res = await adminAAgent.get("/api/v1/audit-logs?action=CREATE")
      expect(res.status).toBe(200)
      for (const item of res.body.data.items) {
        expect(item.action).toBe("CREATE")
      }
    })

    it("filters by actorId", async () => {
      const res = await adminAAgent.get(`/api/v1/audit-logs?actorId=${memberUserIds.principalA}`)
      expect(res.status).toBe(200)
      for (const item of res.body.data.items) {
        expect(item.actorName).toBe("Principal A")
      }
    })

    it("searches entityId / summary", async () => {
      const res = await adminAAgent.get("/api/v1/audit-logs?search=payment")
      expect(res.status).toBe(200)
      expect(res.body.data.items[0].summary).toContain("payment")
    })

    it("filters by date range (createdAt)", async () => {
      await prisma.auditLog.create({
        data: {
          schoolId: schoolA.id,
          actorId: memberUserIds.adminA,
          actorName: "Admin A",
          actorRole: "SCHOOL_ADMIN",
          action: "EXPORT",
          entityType: "AUTH",
          summary: "Old export",
          createdAt: new Date("2026-01-10T10:00:00.000Z"),
        },
      })
      const res = await adminAAgent.get("/api/v1/audit-logs?from=2026-01-01&to=2026-01-31")
      expect(res.status).toBe(200)
      const from = new Date("2026-01-10T10:00:00.000Z")
      const to = new Date("2026-01-31T23:59:59.999Z")
      for (const item of res.body.data.items) {
        const ts = new Date(item.createdAt).getTime()
        expect(ts).toBeGreaterThanOrEqual(from.getTime())
        expect(ts).toBeLessThanOrEqual(to.getTime())
      }
      expect(res.body.data.items.map((item: { summary: string }) => item.summary)).toContain("Old export")
    })
  })

  describe("pagination", () => {
    it("pages results and reports totals", async () => {
      const page1 = await adminAAgent.get("/api/v1/audit-logs?page=1&pageSize=2")
      expect(page1.status).toBe(200)
      expect(page1.body.data.items).toHaveLength(2)
      expect(page1.body.data.pagination.total).toBeGreaterThan(4)
      expect(page1.body.data.pagination.totalPages).toBeGreaterThanOrEqual(2)

      const page2 = await adminAAgent.get("/api/v1/audit-logs?page=2&pageSize=2")
      expect(page2.status).toBe(200)
      const ids1 = page1.body.data.items.map((item: { id: string }) => item.id)
      const ids2 = page2.body.data.items.map((item: { id: string }) => item.id)
      for (const id of ids2) {
        expect(ids1).not.toContain(id)
      }
    })
  })

  describe("write-time sanitization (defense-in-depth)", () => {
    it("never persists sensitive fields even when passed raw", async () => {
      await recordAudit(prisma, {
        schoolId: schoolA.id,
        actorId: memberUserIds.adminA,
        actorName: "Admin A",
        actorRole: "SCHOOL_ADMIN",
        action: "UPDATE",
        entityType: "USER",
        summary: "Secret-leak attempt",
        metadata: { userEmail: "x@example.com", passwordHash: "scrypt$secret", cardNumber: "4242" },
        diff: {
          fields: [
            { field: "password", before: "old", after: "new" },
            { field: "status", before: "ACTIVE", after: "SUSPENDED" },
          ],
        },
      })

      const row = await prisma.auditLog.findFirstOrThrow({
        where: { summary: "Secret-leak attempt" },
      })
      const metadata = row.metadata as Record<string, unknown>
      expect(metadata.passwordHash).toBe("[REDACTED]")
      expect(metadata.cardNumber).toBe("[REDACTED]")
      expect(metadata.userEmail).toBe("x@example.com")

      const diff = row.diff as { fields: { field: string }[] }
      expect(diff.fields.map((field) => field.field)).toEqual(["status"])
    })
  })

  describe("transactional coupling", () => {
    it("commits the audit row with the business transaction", async () => {
      const marker = "tx-commit-audit"
      await prisma.$transaction(async (tx) => {
        await tx.school.update({ where: { id: schoolA.id }, data: { name: "Audit School A" } })
        await recordAudit(tx, {
          schoolId: schoolA.id,
          actorId: memberUserIds.adminA,
          actorName: "Admin A",
          actorRole: "SCHOOL_ADMIN",
          action: "UPDATE",
          entityType: "SCHOOL_SETTING",
          summary: marker,
        })
      })
      const row = await prisma.auditLog.findFirst({ where: { summary: marker } })
      expect(row).not.toBeNull()
    })

    it("rolls the audit row back when the business transaction fails", async () => {
      const marker = "tx-rollback-audit"
      await expect(
        prisma.$transaction(async (tx) => {
          await recordAudit(tx, {
            schoolId: schoolA.id,
            actorId: memberUserIds.adminA,
            actorName: "Admin A",
            actorRole: "SCHOOL_ADMIN",
            action: "CREATE",
            entityType: "STUDENT",
            summary: marker,
          })
          throw new Error("business mutation failed")
        }),
      ).rejects.toThrow("business mutation failed")

      const row = await prisma.auditLog.findFirst({ where: { summary: marker } })
      expect(row).toBeNull()
    })
  })

  describe("critical finance paths are instrumented", () => {
    it("records a CREATE FEE_STRUCTURE row when one is created via the API", async () => {
      const res = await adminAAgent.post("/api/v1/fees/structures").send({
        name: "Audit Year Tuition",
        sessionId: auditSessionId,
        classId: auditClassId,
        items: [{ feeHeadId: auditFeeHeadId, amount: 1500 }],
      })
      expect(res.status).toBe(201)

      const row = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, action: "CREATE", entityType: "FEE_STRUCTURE" },
        orderBy: { createdAt: "desc" },
      })
      expect(row).not.toBeNull()
      expect(row!.entityId).toBe(res.body.data.id)
      expect(row!.actorId).toBe(memberUserIds.adminA)
      const metadata = row!.metadata as { totalAmount?: number; itemCount?: number }
      expect(metadata.totalAmount).toBe(1500)
      expect(metadata.itemCount).toBe(1)
    })

    it("records an UPDATE FEE_STRUCTURE row with a diff", async () => {
      const structure = await prisma.feeStructure.findFirstOrThrow({ where: { schoolId: schoolA.id } })
      const res = await adminAAgent
        .patch(`/api/v1/fees/structures/${structure.id}`)
        .send({ name: "Audit Year Tuition (revised)" })
      expect(res.status).toBe(200)

      const row = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, action: "UPDATE", entityType: "FEE_STRUCTURE" },
        orderBy: { createdAt: "desc" },
      })
      expect(row).not.toBeNull()
      const diff = row!.diff as { fields: { field: string; before?: string; after?: string }[] }
      const nameDiff = diff.fields.find((field) => field.field === "name")
      expect(nameDiff?.after).toBe("Audit Year Tuition (revised)")
    })

    it("records a single GENERATE summary row for the bulk run", async () => {
      const res = await adminAAgent
        .post("/api/v1/fees/invoices/generate")
        .send({ sessionId: auditSessionId, classId: auditClassId })
      expect(res.status).toBe(201)
      expect(res.body.data.generated).toBe(1)

      const rows = await prisma.auditLog.findMany({
        where: { schoolId: schoolA.id, action: "GENERATE", entityType: "FEE_INVOICE" },
      })
      expect(rows.length).toBe(1)
      const metadata = rows[0].metadata as { generated?: number; skippedExisting?: number }
      expect(metadata.generated).toBe(1)
      expect(metadata.skippedExisting).toBe(0)
    })

    it("scopes finance audit rows to the acting tenant", async () => {
      const res = await adminBAgent.get("/api/v1/audit-logs?action=GENERATE")
      expect(res.status).toBe(200)
      expect(res.body.data.pagination.total).toBe(0)
    })
  })

  describe("auth lifecycle events", () => {
    it("records a LOGIN row for a successful sign-in", async () => {
      await login(teacherAAgent, "audit.teacher.a@example.com", "password-123456")

      const row = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, action: "LOGIN", entityType: "AUTH" },
        orderBy: { createdAt: "desc" },
      })
      expect(row).not.toBeNull()
      expect(row!.actorId).toBe(memberUserIds.teacherA)
      expect(row!.actorName).toBe("Teacher A")
      expect(row!.actorRole).toBe("TEACHER")
    })

    it("records a FAILED_LOGIN row with the attempted identity", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "audit.teacher.a@example.com", password: "wrong-password-1" })
      expect(res.status).toBe(401)

      const row = await prisma.auditLog.findFirst({
        where: { action: "FAILED_LOGIN", entityType: "AUTH" },
        orderBy: { createdAt: "desc" },
      })
      expect(row).not.toBeNull()
      expect(row!.actorId).toBe(memberUserIds.teacherA)
      expect(row!.actorName).toBe("audit.teacher.a@example.com")
      expect(row!.actorRole).toBe("GUEST")
    })

    it("records FAILED_LOGIN for an unknown account too", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: "password-123456" })
      expect(res.status).toBe(401)

      const row = await prisma.auditLog.findFirst({
        where: { action: "FAILED_LOGIN", entityType: "AUTH", actorName: "nobody@example.com" },
        orderBy: { createdAt: "desc" },
      })
      expect(row).not.toBeNull()
      expect(row!.actorId).toBe("nobody@example.com")
      expect(row!.actorName).toBe("nobody@example.com")
      expect(row!.actorRole).toBe("GUEST")
    })

    it("records a LOGOUT row when a session is revoked", async () => {
      const res = await adminAAgent.post("/api/v1/auth/logout")
      expect(res.status).toBe(200)

      const row = await prisma.auditLog.findFirst({
        where: { action: "LOGOUT", entityType: "AUTH", actorId: memberUserIds.adminA },
        orderBy: { createdAt: "desc" },
      })
      expect(row).not.toBeNull()
      expect(row!.actorName).toBe("Admin A")
    })
  })

  describe("append-only API", () => {
    it("exposes no create/update/delete routes", async () => {
      const post = await adminAAgent.post("/api/v1/audit-logs").send({ action: "CREATE" })
      expect([404, 405]).toContain(post.status)

      const patch = await adminAAgent
        .patch("/api/v1/audit-logs/some-id")
        .send({ summary: "tamper" })
      expect([404, 405]).toContain(patch.status)

      const del = await adminAAgent.delete("/api/v1/audit-logs/some-id")
      expect([404, 405]).toContain(del.status)
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