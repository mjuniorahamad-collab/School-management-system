import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

// Notifications module — per-user in-app feed, tenant-scoped.
//
// Verifies:
//   - RBAC: unauthenticated 401, no-permission role 403, view-only roles
//     (including PARENT/STUDENT) read but can never create (403)
//   - manual creates are role-targeted / recipient-targeted, sender excluded,
//     and loud 400 on any unresolvable target; type is locked to ADMIN
//   - manual creates audit a NOTIFICATION CREATE row (with recipientCount and
//     targetRoleNames); automatic emissions never audit
//   - list/unread semantics: per-recipient read state, all/unread filters,
//     pagination, newest-first ordering
//   - row security: a notification is only visible / readable by its
//     recipients; direct-ID access from other members -> 404; cross-tenant
//     isolation on reads, unread counts, and sends
//   - automatic triggers (inside their own service transactions): fee invoice
//     generation fans out to linked guardians, payments signal the same
//     guardians, and portal profile links notify the linked user; all are
//     source-anchored and idempotent (replay never duplicates)
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const ROLES = [SUPER_ADMIN_ROLE, "SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT", "RECEPTIONIST", "AUDITOR"] as const

describe.skipIf(!TEST_DATABASE_URL)("Notifications (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  const roleIds: Record<string, string> = {}
  const memberUserIds: Record<string, string> = {}
  const feeFixtures = { studentId: "", sessionId: "", classId: "" }

  let invoiceId = ""

  const adminAAgent = request.agent(app)
  const adminBAgent = request.agent(app)
  const teacherAAgent = request.agent(app)
  const teacherBAgent = request.agent(app)
  const parentAAgent = request.agent(app)
  const portalAAgent = request.agent(app)
  const studentUserAgent = request.agent(app)
  const receptionistAAgent = request.agent(app)
  const auditorAAgent = request.agent(app)

  const notificationCodes = ["notifications:view", "notifications:create"]
  const feePaymentCodes = ["fees:view", "fees:create", "payments:create", "portal:update", "portal:view"]

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

    for (const code of [...notificationCodes, ...feePaymentCodes]) {
      const [resource, action] = code.split(":")
      await prisma.permission.create({ data: { code, resource, action, description: code } })
    }
    const allGranted = await prisma.permission.findMany({ where: { code: { in: [...notificationCodes, ...feePaymentCodes] } } })
    const notificationViewOnly = allGranted.filter((permission) => permission.code === "notifications:view")
    const leadership = allGranted.filter((permission) =>
      notificationCodes.includes(permission.code) || feePaymentCodes.includes(permission.code),
    )
    await prisma.rolePermission.createMany({
      data: leadership.map((permission) => ({ roleId: roleIds.SCHOOL_ADMIN, permissionId: permission.id })),
    })
    for (const roleName of ["TEACHER", "PARENT", "STUDENT", "RECEPTIONIST"]) {
      await prisma.rolePermission.createMany({
        data: notificationViewOnly.map((permission) => ({ roleId: roleIds[roleName as string], permissionId: permission.id })),
      })
    }

    const a = await prisma.school.create({ data: { name: "Notifications School A" } })
    schoolA.id = a.id
    const b = await prisma.school.create({ data: { name: "Notifications School B" } })
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

    memberUserIds.adminA = await createMember("notif.admin.a@example.com", "Admin A", schoolA.id, roleIds.SCHOOL_ADMIN)
    memberUserIds.teacherA = await createMember("notif.teacher.a@example.com", "Teacher A", schoolA.id, roleIds.TEACHER)
    memberUserIds.teacherB = await createMember("notif.teacher.b@example.com", "Teacher B", schoolA.id, roleIds.TEACHER)
    memberUserIds.parentA = await createMember("notif.parent.a@example.com", "Parent A", schoolA.id, roleIds.PARENT)
    memberUserIds.portalA = await createMember("notif.portal.a@example.com", "Portal Parent A", schoolA.id, roleIds.PARENT)
    memberUserIds.studentUser = await createMember("notif.student.a@example.com", "Student User", schoolA.id, roleIds.STUDENT)
    memberUserIds.receptionistA = await createMember("notif.receptionist.a@example.com", "Receptionist A", schoolA.id, roleIds.RECEPTIONIST)
    memberUserIds.auditorA = await createMember("notif.auditor.a@example.com", "Auditor A", schoolA.id, roleIds.AUDITOR)
    memberUserIds.adminB = await createMember("notif.admin.b@example.com", "Admin B", schoolB.id, roleIds.SCHOOL_ADMIN)

    await login(adminAAgent, "notif.admin.a@example.com", "password-123456")
    await login(teacherAAgent, "notif.teacher.a@example.com", "password-123456")
    await login(teacherBAgent, "notif.teacher.b@example.com", "password-123456")
    await login(parentAAgent, "notif.parent.a@example.com", "password-123456")
    await login(portalAAgent, "notif.portal.a@example.com", "password-123456")
    await login(studentUserAgent, "notif.student.a@example.com", "password-123456")
    await login(receptionistAAgent, "notif.receptionist.a@example.com", "password-123456")
    await login(auditorAAgent, "notif.auditor.a@example.com", "password-123456")
    await login(adminBAgent, "notif.admin.b@example.com", "password-123456")

    // Fee/base fixtures: a class, session, active structure and one enrolled
    // student whose guardian is already linked to the PARENT account — the
    // resolution target for the FEE_INVOICE / FEE_PAYMENT automatic triggers.
    const session = await prisma.academicSession.create({
      data: {
        schoolId: schoolA.id,
        name: "Notif Year",
        code: "NOTY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    feeFixtures.sessionId = session.id

    const classSix = await prisma.class.create({ data: { schoolId: schoolA.id, name: "Six", sortOrder: 6 } })
    feeFixtures.classId = classSix.id
    const sectionA = await prisma.section.create({ data: { classId: classSix.id, name: "A" } })

    const tuition = await prisma.feeHead.create({
      data: { schoolId: schoolA.id, code: "TUITION", name: "Tuition", isRecurring: true },
    })
    const transport = await prisma.feeHead.create({
      data: { schoolId: schoolA.id, code: "TRANSPORT", name: "Transport", isRecurring: false },
    })
    await prisma.feeStructure.create({
      data: {
        schoolId: schoolA.id,
        sessionId: session.id,
        classId: classSix.id,
        name: "Six Fees",
        isActive: true,
        totalAmount: 1000,
        items: {
          create: [
            { feeHeadId: tuition.id, amount: 700, dueDate: new Date("2027-03-31T00:00:00.000Z"), sortOrder: 1 },
            { feeHeadId: transport.id, amount: 300, dueDate: new Date("2027-03-31T00:00:00.000Z"), sortOrder: 2 },
          ],
        },
      },
    })

    const student = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        admissionNumber: "STU-NOT-0001",
        firstName: "Fees",
        lastName: "Child",
        dateOfBirth: new Date("2014-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    feeFixtures.studentId = student.id

    await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        academicSessionId: session.id,
        classId: classSix.id,
        sectionId: sectionA.id,
      },
    })
    const guardian = await prisma.guardian.create({
      data: { schoolId: schoolA.id, name: "Parent A", userId: memberUserIds.parentA },
    })
    await prisma.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        relationshipType: "PARENT",
        isPrimary: true,
        isEmergencyContact: false,
      },
    })

    // A second, unlinked guardian used by the PORTAL_LINK trigger test.
    await prisma.guardian.create({
      data: { schoolId: schoolA.id, name: "Parent A", userId: null },
    })
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  describe("RBAC", () => {
    it("rejects unauthenticated access", async () => {
      expect((await request(app).get("/api/v1/notifications")).status).toBe(401)
      expect((await request(app).get("/api/v1/notifications/unread-count")).status).toBe(401)
      expect((await request(app).post("/api/v1/notifications").send({})).status).toBe(401)
      expect((await request(app).post("/api/v1/notifications/read-all")).status).toBe(401)
    })

    it("forbids a role without notifications:view on every surface", async () => {
      expect((await auditorAAgent.get("/api/v1/notifications")).status).toBe(403)
      expect((await auditorAAgent.get("/api/v1/notifications/unread-count")).status).toBe(403)
      expect((await auditorAAgent.post("/api/v1/notifications/read-all")).status).toBe(403)
      expect((await auditorAAgent.post("/api/v1/notifications").send({ title: "Hi", roleNames: ["TEACHER"] })).status).toBe(403)
    })

    it("lets view-only roles read but never create", async () => {
      for (const agent of [teacherAAgent, parentAAgent, studentUserAgent, receptionistAAgent]) {
        expect((await agent.get("/api/v1/notifications")).status).toBe(200)
        expect((await agent.get("/api/v1/notifications/unread-count")).status).toBe(200)
        const create = await agent.post("/api/v1/notifications").send({ title: "Hi", roleNames: ["TEACHER"] })
        expect(create.status).toBe(403)
      }
    })
  })

  describe("manual sends", () => {
    it("sends a role-targeted notification, excluding the sender, with an audit trail", async () => {
      const res = await adminAAgent.post("/api/v1/notifications").send({
        type: "ADMIN",
        title: "Staff meeting tomorrow",
        body: "Room 2, 8am prompt.",
        linkPath: "/portal",
        roleNames: ["TEACHER"],
      })
      expect(res.status).toBe(201)
      const data = res.body.data as { notificationId: string; recipientCount: number }
      expect(data.recipientCount).toBe(2)

      const notification = await prisma.notification.findFirstOrThrow({
        where: { id: data.notificationId },
        include: { recipients: { select: { userId: true, readAt: true } } },
      })
      expect(notification.type).toBe("ADMIN")
      expect(notification.title).toBe("Staff meeting tomorrow")
      expect(notification.linkPath).toBe("/portal")
      expect(notification.sourceEntityType).toBeNull()
      expect(notification.sourceEntityId).toBeNull()
      const recipientIds = notification.recipients.map((recipient) => recipient.userId).sort()
      expect(recipientIds).toEqual([memberUserIds.teacherA, memberUserIds.teacherB].sort())
      expect(notification.recipients.every((recipient) => recipient.readAt === null)).toBe(true)

      const auditRow = await prisma.auditLog.findFirstOrThrow({
        where: { entityType: "NOTIFICATION", entityId: data.notificationId, action: "CREATE" },
      })
      expect(auditRow.actorName).toBe("Admin A")
      const metadata = auditRow.metadata as { recipientCount: number; targetRoleNames: string[] }
      expect(metadata.recipientCount).toBe(2)
      expect(metadata.targetRoleNames).toEqual(["TEACHER"])
    })

    it("sends to explicit recipient ids and inspects results on the feed", async () => {
      const res = await adminAAgent.post("/api/v1/notifications").send({
        type: "ADMIN",
        title: "Direct note",
        recipientIds: [memberUserIds.teacherA, memberUserIds.teacherB],
      })
      expect(res.status).toBe(201)
      expect((res.body.data as { recipientCount: number }).recipientCount).toBe(2)

      expect((await parentAAgent.get("/api/v1/notifications")).body.data.items).toHaveLength(0)
      const adminList = (await adminAAgent.get("/api/v1/notifications")).body.data.items as { title: string }[]
      const titles = adminList.map((item) => item.title)
      expect(titles).not.toContain("Direct note")
      expect(titles).not.toContain("Staff meeting tomorrow")
    })

    it("rejects unresolvable, self, and foreign-school recipients with 400", async () => {
      const noPermRole = await adminAAgent.post("/api/v1/notifications").send({ type: "ADMIN", title: "Nope", roleNames: ["AUDITOR"] })
      expect(noPermRole.status).toBe(400)

      const unknownRole = await adminAAgent.post("/api/v1/notifications").send({ type: "ADMIN", title: "Nope", roleNames: ["ALIENS"] })
      expect(unknownRole.status).toBe(400)
      expect((unknownRole.body.error.details as { roles: string[] }).roles).toContain("ALIENS")

      const foreign = await adminAAgent.post("/api/v1/notifications").send({ type: "ADMIN", title: "Nope", recipientIds: [memberUserIds.adminB] })
      expect(foreign.status).toBe(400)

      const self = await adminAAgent.post("/api/v1/notifications").send({ type: "ADMIN", title: "Nope", recipientIds: [memberUserIds.adminA] })
      expect(self.status).toBe(400)

      const noTargets = await adminAAgent.post("/api/v1/notifications").send({ type: "ADMIN", title: "Nope" })
      expect(noTargets.status).toBe(400)
    })

    it("locks the type to ADMIN and rejects invalid shapes", async () => {
      const badType = await adminAAgent.post("/api/v1/notifications").send({
        title: "Nope",
        type: "FEE_INVOICE",
        roleNames: ["TEACHER"],
      })
      expect(badType.status).toBe(400)

      const badLink = await adminAAgent.post("/api/v1/notifications").send({
        type: "ADMIN",
        title: "Nope",
        linkPath: "portal",
        roleNames: ["TEACHER"],
      })
      expect(badLink.status).toBe(400)

      const blind = await adminAAgent.post("/api/v1/notifications").send({ type: "ADMIN" })
      expect(blind.status).toBe(400)
    })
  })

  describe("feed and read state", () => {
    it("lists only my notifications newest-first with pagination", async () => {
      const first = await teacherAAgent.get("/api/v1/notifications").query({ page: 1, pageSize: 1 })
      expect(first.status).toBe(200)
      const firstData = first.body.data as { items: { title: string }[]; total: number }
      expect(firstData.total).toBe(2)
      expect(firstData.items).toHaveLength(1)
      expect(firstData.items[0].title).toBe("Direct note")

      const second = await teacherAAgent.get("/api/v1/notifications").query({ page: 2, pageSize: 1 })
      expect((second.body.data as { items: { title: string }[] }).items[0].title).toBe("Staff meeting tomorrow")
    })

    it("reports, clears, and filters unread state", async () => {
      const before = (await teacherAAgent.get("/api/v1/notifications/unread-count")).body.data as { total: number }
      expect(before.total).toBe(2)

      const unread = await teacherAAgent.get("/api/v1/notifications").query({ filter: "unread" })
      expect((unread.body.data as { total: number }).total).toBe(2)

      const list = await teacherAAgent.get("/api/v1/notifications")
      const items = (list.body.data as { items: { id: string; title: string; readAt: string | null }[] }).items
      expect(items[0].readAt).toBeNull()

      const read = await teacherAAgent.post(`/api/v1/notifications/${items[0].id}/read`)
      expect(read.status).toBe(200)
      expect((read.body.data as { readAt: string }).readAt).toBeTruthy()

      expect((await teacherAAgent.get("/api/v1/notifications/unread-count")).body.data.total).toBe(1)
      const afterUnread = await teacherAAgent.get("/api/v1/notifications").query({ filter: "unread" })
      const unreadIds = (afterUnread.body.data as { items: { id: string }[] }).items.map((item) => item.id)
      expect(unreadIds).not.toContain(items[0].id)

      const still = await teacherAAgent.post(`/api/v1/notifications/${items[0].id}/read`)
      expect(still.status).toBe(200)
      expect((still.body.data as { readAt: string }).readAt).toBe((read.body.data as { readAt: string }).readAt)
    })

    it("marks all read and reflects on the count", async () => {
      const res = await teacherAAgent.post("/api/v1/notifications/read-all")
      expect(res.status).toBe(200)
      expect((res.body.data as { updatedCount: number }).updatedCount).toBe(1)
      expect((await teacherAAgent.get("/api/v1/notifications/unread-count")).body.data.total).toBe(0)
    })

    it("hides notifications from non-recipients in the same school (404)", async () => {
      const list = await teacherAAgent.get("/api/v1/notifications")
      const items = (list.body.data as { items: { id: string }[] }).items
      expect(items).toHaveLength(2)

      expect((await receptionistAAgent.post(`/api/v1/notifications/${items[0].id}/read`)).status).toBe(404)
      const receptionistList = (await receptionistAAgent.get("/api/v1/notifications")).body.data.items as { id: string }[]
      expect(receptionistList.map((item) => item.id)).not.toContain(items[0].id)
      expect((await receptionistAAgent.get("/api/v1/notifications/unread-count")).body.data.total).toBe(0)
    })

    it("isolates tenants on send, read, and count", async () => {
      expect((await adminBAgent.get("/api/v1/notifications")).body.data.items).toHaveLength(0)
      expect((await adminBAgent.get("/api/v1/notifications/unread-count")).body.data.total).toBe(0)

      const source = (await teacherAAgent.get("/api/v1/notifications")).body.data.items as { id: string }[]
      expect((await adminBAgent.post(`/api/v1/notifications/${source[0].id}/read`)).status).toBe(404)

      const foreignSend = await adminBAgent.post("/api/v1/notifications").send({ title: "To A", recipientIds: [memberUserIds.teacherA] })
      expect(foreignSend.status).toBe(400)
    })
  })

  describe("automatic triggers", () => {
    it("notifies linked guardians when invoices are generated, idempotently", async () => {
      const before = await prisma.auditLog.count({ where: { entityType: "NOTIFICATION" } })

      const generate = await adminAAgent.post("/api/v1/fees/invoices/generate").send({
        sessionId: feeFixtures.sessionId,
        classId: feeFixtures.classId,
      })
      expect(generate.status).toBe(201)
      const generateData = generate.body.data as { generated: number; invoiceNumbers: string[] }
      expect(generateData.generated).toBe(1)
      expect(generateData.invoiceNumbers).toHaveLength(1)

      const invoice = await prisma.feeInvoice.findFirstOrThrow({
        where: { schoolId: schoolA.id, student: { id: feeFixtures.studentId } },
      })
      invoiceId = invoice.id

      const unread = (await parentAAgent.get("/api/v1/notifications/unread-count")).body.data as { total: number }
      expect(unread.total).toBe(1)

      const feed = await parentAAgent.get("/api/v1/notifications")
      const items = (feed.body.data as { items: { type: string; title: string; body: string; linkPath: string }[] }).items
      const invoiceNotice = items[0]
      expect(invoiceNotice.type).toBe("FEE_INVOICE")
      expect(invoiceNotice.linkPath).toBe("/portal")
      expect(invoiceNotice.body).toContain("invoice")
      expect(invoiceNotice.body).toContain("INV-")

      const row = await prisma.notification.findFirstOrThrow({
        where: { type: "FEE_INVOICE", sourceEntityId: invoiceId, schoolId: schoolA.id },
        include: { recipients: { select: { userId: true } } },
      })
      expect(row.recipients.map((recipient) => recipient.userId)).toEqual([memberUserIds.parentA])

      // Re-running generation for the same class/session must not duplicate.
      const rerun = await adminAAgent.post("/api/v1/fees/invoices/generate").send({
        sessionId: feeFixtures.sessionId,
        classId: feeFixtures.classId,
      })
      expect(rerun.status).toBe(201)
      expect((rerun.body.data as { generated: number }).generated).toBe(0)
      const invoiceCount = await prisma.notification.count({
        where: { type: "FEE_INVOICE", sourceEntityId: invoiceId, schoolId: schoolA.id },
      })
      expect(invoiceCount).toBe(1)

      // Automatic emissions never add audit rows.
      const after = await prisma.auditLog.count({ where: { entityType: "NOTIFICATION" } })
      expect(after).toBe(before)
    })

    it("notifies linked guardians when a payment is recorded, without duplicate on replay", async () => {
      const before = await prisma.auditLog.count({ where: { entityType: "NOTIFICATION" } })

      const payload = {
        invoiceId,
        amount: 500,
        method: "CASH",
        paymentDate: "2026-09-05",
        idempotencyKey: `pay-notif-${invoiceId}-1`,
      }
      const paid = await adminAAgent.post("/api/v1/payments").send(payload)
      expect(paid.status).toBe(201)
      const paymentId = paid.body.data.payment.id as string

      const replay = await adminAAgent.post("/api/v1/payments").send({ ...payload, notes: "retried" })
      expect(replay.status).toBe(200)
      expect((replay.body.data as { replayed: boolean }).replayed).toBe(true)

      const beforeCount = await prisma.notification.count({
        where: { schoolId: schoolA.id, type: "FEE_PAYMENT", sourceEntityId: paymentId },
      })
      expect(beforeCount).toBe(1)

      const row = await prisma.notification.findFirstOrThrow({
        where: { schoolId: schoolA.id, type: "FEE_PAYMENT", sourceEntityId: paymentId },
        include: { recipients: { select: { userId: true } } },
      })
      expect(row.recipients.map((recipient) => recipient.userId)).toEqual([memberUserIds.parentA])
      expect(row.linkPath).toBe("/portal")
      expect(row.body).toContain("500")
      expect(row.body).toContain("INV-")

      const after = await prisma.auditLog.count({ where: { entityType: "NOTIFICATION" } })
      expect(after).toBe(before)
    })

    it("notifies the linked user when a portal profile link is provisioned", async () => {
      const before = await prisma.auditLog.count({ where: { entityType: "NOTIFICATION" } })

      const guardian = await prisma.guardian.findFirstOrThrow({
        where: { schoolId: schoolA.id, userId: null },
      })
      const link = await adminAAgent.post("/api/v1/portal/links").send({
        userId: memberUserIds.portalA,
        profileType: "GUARDIAN",
        profileId: guardian.id,
      })
      expect(link.status).toBe(201)

      const row = await prisma.notification.findFirstOrThrow({
        where: { schoolId: schoolA.id, type: "PORTAL_LINK", sourceEntityId: memberUserIds.portalA },
        include: { recipients: { select: { userId: true } } },
      })
      expect(row.linkPath).toBe("/portal")
      expect(row.recipients.map((recipient) => recipient.userId)).toEqual([memberUserIds.portalA])

      const feed = await portalAAgent.get("/api/v1/notifications")
      const portalNotice = (feed.body.data as { items: { type: string }[] }).items.find((item) => item.type === "PORTAL_LINK")
      expect(portalNotice).toBeTruthy()

      const after = await prisma.auditLog.count({ where: { entityType: "NOTIFICATION" } })
      expect(after).toBe(before)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "NotificationRecipient" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Notification" CASCADE')
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
  await prisma.studentGuardian.deleteMany()
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
  await prisma.section.deleteMany()
  await prisma.class.deleteMany()
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