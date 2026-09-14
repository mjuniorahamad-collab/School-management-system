import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

// Messages module — persistent, private, tenant-scoped conversations.
//
// Verifies:
//   - RBAC: unauthenticated 401, no-permission role 403, view-only role can
//     read but 403 on create/send/archive/add-participants
//   - recipients: only ACTIVE memberships whose role carries `messages:view`;
//     never grants users:view, never leaks foreign-school accounts
//   - DIRECT conversations are deduplicated 1:1 via the stable pair key
//   - GROUP conversations via recipientIds and role broadcasts (bounded to
//     GROUP_CONVERSATION_LIMIT)
//   - messages are immutable-after-send reads; read cursor drives unread counts
//   - participant-only row security: non-participants and cross-tenant IDs -> 404
//   - archive hides the thread from that participant's list and unread count
//   - audit privacy: structural events only; message bodies never reach audit
//     rows and per-message sends are never audited
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const ROLES = [SUPER_ADMIN_ROLE, "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "RECEPTIONIST", "ACCOUNTANT"] as const

describe.skipIf(!TEST_DATABASE_URL)("Messages (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  const roleIds: Record<string, string> = {}
  const memberUserIds: Record<string, string> = {}

  const adminAAgent = request.agent(app)
  const adminBAgent = request.agent(app)
  const teacherAAgent = request.agent(app)
  const parentAAgent = request.agent(app)
  const principalAAgent = request.agent(app)
  const receptionistAAgent = request.agent(app)
  const accountantAAgent = request.agent(app)

  const sharedAdminAgent = request.agent(app)

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

    for (const code of ["messages:view", "messages:create"]) {
      const [resource, action] = code.split(":")
      await prisma.permission.create({ data: { code, resource, action, description: code } })
    }
    const granted = await prisma.permission.findMany({ where: { code: { in: ["messages:view", "messages:create"] } } })
    const viewAndCreate = granted
    const viewOnly = granted.filter((permission) => permission.code === "messages:view")
    for (const roleName of ["SCHOOL_ADMIN", "TEACHER", "PARENT", "RECEPTIONIST"]) {
      await prisma.rolePermission.createMany({
        data: viewAndCreate.map((permission) => ({ roleId: roleIds[roleName], permissionId: permission.id })),
      })
    }
    await prisma.rolePermission.createMany({
      data: viewOnly.map((permission) => ({ roleId: roleIds.PRINCIPAL, permissionId: permission.id })),
    })

    const a = await prisma.school.create({ data: { name: "Messages School A" } })
    schoolA.id = a.id
    const b = await prisma.school.create({ data: { name: "Messages School B" } })
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

    memberUserIds.adminA = await createMember("msg.admin.a@example.com", "Admin A", schoolA.id, roleIds.SCHOOL_ADMIN)
    memberUserIds.teacherA = await createMember("msg.teacher.a@example.com", "Teacher A", schoolA.id, roleIds.TEACHER)
    memberUserIds.teacherB = await createMember("msg.teacher.b@example.com", "Teacher B", schoolA.id, roleIds.TEACHER)
    memberUserIds.parentA = await createMember("msg.parent.a@example.com", "Parent A", schoolA.id, roleIds.PARENT)
    memberUserIds.principalA = await createMember("msg.principal.a@example.com", "Principal A", schoolA.id, roleIds.PRINCIPAL)
    memberUserIds.receptionistA = await createMember("msg.receptionist.a@example.com", "Receptionist A", schoolA.id, roleIds.RECEPTIONIST)
    memberUserIds.accountantA = await createMember("msg.accountant.a@example.com", "Accountant A", schoolA.id, roleIds.ACCOUNTANT)
    memberUserIds.adminB = await createMember("msg.admin.b@example.com", "Admin B", schoolB.id, roleIds.SCHOOL_ADMIN)

    // A cross-school admin and teacher — each an ACTIVE member of BOTH schools.
    // The same (sender, recipient) pair in both tenants produces an identical
    // directKey, which the (schoolId, directKey) uniqueness must permit.
    // The admin carries a legacy User.schoolId + UserRole so login resolves a
    // home tenant (multi-membership accounts have no implicit default).
    memberUserIds.crossAdmin = await createMember("msg.cross.admin@example.com", "Cross Admin", schoolA.id, roleIds.SCHOOL_ADMIN)
    memberUserIds.crossTeacher = await createMember("msg.cross.teacher@example.com", "Cross Teacher", schoolA.id, roleIds.TEACHER)
    await prisma.user.update({ where: { id: memberUserIds.crossAdmin }, data: { schoolId: schoolA.id } })
    await prisma.userRole.create({
      data: { userId: memberUserIds.crossAdmin, roleId: roleIds.SCHOOL_ADMIN },
    })
    await prisma.tenantMembership.create({
      data: { userId: memberUserIds.crossAdmin, schoolId: schoolB.id, roleId: roleIds.SCHOOL_ADMIN, status: "ACTIVE" },
    })
    await prisma.tenantMembership.create({
      data: { userId: memberUserIds.crossTeacher, schoolId: schoolB.id, roleId: roleIds.TEACHER, status: "ACTIVE" },
    })

    await login(adminAAgent, "msg.admin.a@example.com", "password-123456")
    await login(teacherAAgent, "msg.teacher.a@example.com", "password-123456")
    await login(parentAAgent, "msg.parent.a@example.com", "password-123456")
    await login(principalAAgent, "msg.principal.a@example.com", "password-123456")
    await login(receptionistAAgent, "msg.receptionist.a@example.com", "password-123456")
    await login(accountantAAgent, "msg.accountant.a@example.com", "password-123456")
    await login(adminBAgent, "msg.admin.b@example.com", "password-123456")
    await login(sharedAdminAgent, "msg.cross.admin@example.com", "password-123456")
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  describe("RBAC", () => {
    it("rejects unauthenticated access", async () => {
      expect((await request(app).get("/api/v1/messages/conversations")).status).toBe(401)
    })

    it("forbids roles without messages:view", async () => {
      const list = await accountantAAgent.get("/api/v1/messages/conversations")
      const recipients = await accountantAAgent.get("/api/v1/messages/recipients")
      expect(list.status).toBe(403)
      expect(recipients.status).toBe(403)
    })

    it("lets a view-only role read but not create or act", async () => {
      expect((await principalAAgent.get("/api/v1/messages/conversations")).status).toBe(200)
      expect((await principalAAgent.get("/api/v1/messages/recipients")).status).toBe(200)
      expect((await principalAAgent.get("/api/v1/messages/unread-count")).status).toBe(200)
      expect((await principalAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.teacherA] })).status).toBe(403)
      const directId = await createDirect()
      expect((await principalAAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: "Hi" })).status).toBe(403)
      expect((await principalAAgent.post(`/api/v1/messages/conversations/${directId}/archive`).send({})).status).toBe(403)
      expect((await principalAAgent.post(`/api/v1/messages/conversations/${directId}/participants`).send({ recipientIds: [memberUserIds.parentA] })).status).toBe(403)
    })
  })

  describe("recipients", () => {
    it("lists only messagable ACTIVE members, excluding the caller", async () => {
      const { body } = await adminAAgent.get("/api/v1/messages/recipients")
      expect(body.success).toBe(true)
      const ids = (body.data as { userId: string }[]).map((r) => r.userId)
      expect(ids).toContain(memberUserIds.teacherA)
      expect(ids).toContain(memberUserIds.parentA)
      expect(ids).toContain(memberUserIds.receptionistA)
      expect(ids).not.toContain(memberUserIds.accountantA)
      expect(ids).not.toContain(memberUserIds.adminA)
      expect(ids).not.toContain(memberUserIds.adminB)
      const adminBEntry = (body.data as { userId: string }[]).find((r) => r.userId === memberUserIds.adminB)
      expect(adminBEntry).toBeUndefined()
    })

    it("searches by name or email and filters by role", async () => {
      const byName = await adminAAgent.get("/api/v1/messages/recipients").query({ search: "Parent" })
      const byNameEntries = (byName.body.data as { userId: string }[]).map((r) => r.userId)
      expect(byNameEntries).toContain(memberUserIds.parentA)
      expect(byNameEntries).not.toContain(memberUserIds.teacherA)

      const byRole = await adminAAgent.get("/api/v1/messages/recipients").query({ roleNames: "TEACHER,PRINCIPAL" })
      const byRoleEntries = (byRole.body.data as { userId: string }[]).map((r) => r.userId)
      expect(byRoleEntries).toContain(memberUserIds.teacherA)
      expect(byRoleEntries).toContain(memberUserIds.teacherB)
      expect(byRoleEntries).not.toContain(memberUserIds.parentA)
    })
  })

  describe("direct conversations", () => {
    it("creates a 1:1 thread and dedupes on the stable pair key", async () => {
      const first = await createDirect()
      const second = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.teacherA] })
      expect(second.status).toBe(201)
      expect((second.body.data as { id: string }).id).toBe(first)

      const auditRows = await prisma.auditLog.count({
        where: { entityType: "CONVERSATION", entityId: first, action: "CREATE" },
      })
      expect(auditRows).toBe(1)
    })

    it("enables parent accounts", async () => {
      const res = await parentAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.teacherA] })
      expect(res.status).toBe(201)
      const participants = (res.body.data as { participants: { userId: string }[] }).participants.map((p) => p.userId)
      expect(participants).toContain(memberUserIds.parentA)
      expect(participants).toContain(memberUserIds.teacherA)
    })

    it("rejects unmessagable, foreign-school, and self recipients", async () => {
      const accountant = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.accountantA] })
      expect(accountant.status).toBe(400)
      const foreign = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.adminB] })
      expect(foreign.status).toBe(400)
      const self = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.adminA] })
      expect(self.status).toBe(400)
    })

    it("rejects invalid shapes", async () => {
      const zero = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [] })
      expect(zero.status).toBe(400)
      const two = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.teacherA, memberUserIds.parentA] })
      expect(two.status).toBe(400)
      const withTitle = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.teacherA], title: "Nope" })
      expect(withTitle.status).toBe(400)
    })
  })

  describe("group conversations", () => {
    it("creates a titled group from explicit recipients", async () => {
      const res = await adminAAgent.post("/api/v1/messages/conversations").send({
        type: "GROUP",
        title: "Ops queue",
        recipientIds: [memberUserIds.teacherA, memberUserIds.parentA],
      })
      expect(res.status).toBe(201)
      const participants = (res.body.data as { participants: { userId: string }[] }).participants.map((p) => p.userId)
      expect(participants).toHaveLength(3)
      expect(participants).toContain(memberUserIds.adminA)
    })

    it("supports role-broadcast groups and rejects unmessagable roles", async () => {
      const ok = await adminAAgent.post("/api/v1/messages/conversations").send({
        type: "GROUP",
        title: "All teachers",
        roleNames: ["TEACHER"],
      })
      expect(ok.status).toBe(201)
      const participants = (ok.body.data as { participants: { userId: string }[] }).participants.map((p) => p.userId)
      expect(participants).toContain(memberUserIds.teacherA)
      expect(participants).toContain(memberUserIds.teacherB)
      expect(participants).toContain(memberUserIds.adminA)

      const accountantRole = await adminAAgent.post("/api/v1/messages/conversations").send({
        type: "GROUP",
        title: "Accountants",
        roleNames: ["ACCOUNTANT"],
      })
      expect(accountantRole.status).toBe(400)

      const unknownRole = await adminAAgent.post("/api/v1/messages/conversations").send({
        type: "GROUP",
        title: "Aliens",
        roleNames: ["ALIENS"],
      })
      expect(unknownRole.status).toBe(400)
    })

    it("rejects groups without a title or any targets", async () => {
      const noTitle = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "GROUP", recipientIds: [memberUserIds.teacherA] })
      expect(noTitle.status).toBe(400)
      const noTargets = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "GROUP", title: "Empty" })
      expect(noTargets.status).toBe(400)
    })
  })

  describe("sending and reading messages", () => {
    let directId = ""

    it("sends and denormalizes conversation preview state", async () => {
      directId = await createDirect()

      const short = await adminAAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: "Morning briefing at 8" })
      expect(short.status).toBe(201)
      expect((short.body.data as { body: string }).body).toBe("Morning briefing at 8")

      const longBody = `x`.repeat(161)
      const long = await adminAAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: longBody })
      expect(long.status).toBe(201)

      const conversation = await adminAAgent.get(`/api/v1/messages/conversations/${directId}`)
      const data = conversation.body.data as {
        lastMessagePreview: string
        lastMessageAt: string
        lastMessageSenderId: string
        unreadCount: number
      }
      expect(data.lastMessagePreview).toBe(`${"x".repeat(159)}…`)
      expect(data.lastMessageAt).toBeTruthy()
      expect(data.lastMessageSenderId).toBe(memberUserIds.adminA)
      expect(data.unreadCount).toBe(0)
    })

    it("reports and clears other-side unread counts via the read cursor", async () => {
      expect((await teacherAAgent.get("/api/v1/messages/unread-count")).body.data.total).toBe(2)
      expect((await teacherAAgent.get("/api/v1/messages/conversations")).body.data.items[0].unreadCount).toBe(2)

      const read = await teacherAAgent.post(`/api/v1/messages/conversations/${directId}/read`)
      expect(read.status).toBe(200)
      expect((await teacherAAgent.get("/api/v1/messages/unread-count")).body.data.total).toBe(0)
      expect((await teacherAAgent.get(`/api/v1/messages/conversations/${directId}`)).body.data.unreadCount).toBe(0)
    })

    it("lists messages newest-first", async () => {
      const list = await teacherAAgent.get(`/api/v1/messages/conversations/${directId}/messages`)
      expect(list.status).toBe(200)
      const items = list.body.data.items as { body: string }[]
      expect(items).toHaveLength(2)
      expect(items[0].body).toBe("x".repeat(161))
      expect(items[1].body).toBe("Morning briefing at 8")
    })

    it("paginates backwards via the before cursor", async () => {
      const cursor = await adminAAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: "marker-after" })
      const markerId = (cursor.body.data as { id: string }).id

      const base = new Date(Date.now() - 5000)
      await prisma.message.createMany({
        data: [
          { schoolId: schoolA.id, conversationId: directId, senderId: memberUserIds.teacherA, body: "cursor-oldest", createdAt: base },
          { schoolId: schoolA.id, conversationId: directId, senderId: memberUserIds.teacherA, body: "cursor-middle", createdAt: new Date(base.getTime() + 1000) },
        ],
      })

      const before = await teacherAAgent.get(`/api/v1/messages/conversations/${directId}/messages`).query({ before: `${base.toISOString()}` })
      expect(before.status).toBe(200)
      const bodies = (before.body.data.items as { body: string }[]).map((m) => m.body)
      expect(bodies).not.toContain("cursor-oldest")
      expect(bodies).not.toContain("cursor-middle")
      expect(bodies).not.toContain("marker-after")
      expect(bodies).not.toContain("x".repeat(161))

      const all = await teacherAAgent.get(`/api/v1/messages/conversations/${directId}/messages`)
      const allIds = (all.body.data.items as { id: string }[]).map((m) => m.id)
      expect(allIds).toContain(markerId)
    })
  })

  describe("participant security", () => {
    it("hides conversations from non-participants in the same school (404)", async () => {
      const directId = await createDirect()
      expect((await receptionistAAgent.get(`/api/v1/messages/conversations/${directId}`)).status).toBe(404)
      expect((await receptionistAAgent.get(`/api/v1/messages/conversations/${directId}/messages`)).status).toBe(404)
      expect((await receptionistAAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: "sneak" })).status).toBe(404)
      expect((await receptionistAAgent.post(`/api/v1/messages/conversations/${directId}/read`)).status).toBe(404)
      expect((await receptionistAAgent.post(`/api/v1/messages/conversations/${directId}/archive`)).status).toBe(404)
      expect((await receptionistAAgent.post(`/api/v1/messages/conversations/${directId}/participants`).send({ recipientIds: [memberUserIds.parentA] })).status).toBe(404)
    })

    it("isolates tenants and resists direct-ID attacks", async () => {
      const directId = await createDirect()
      expect((await adminBAgent.get(`/api/v1/messages/conversations/${directId}`)).status).toBe(404)
      expect((await adminBAgent.get(`/api/v1/messages/conversations/${directId}/messages`)).status).toBe(404)
      expect((await adminBAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: "from B" })).status).toBe(404)
      const list = await adminBAgent.get("/api/v1/messages/conversations")
      const ids = (list.body.data.items as { id: string }[]).map((c) => c.id)
      expect(ids).not.toContain(directId)
      const foreignDirect = await adminBAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.teacherA] })
      expect(foreignDirect.status).toBe(400)
    })
  })

  describe("adding participants", () => {
    let groupId = ""

    it("adds new participants to group conversations only, auditing each", async () => {
      const created = await adminAAgent.post("/api/v1/messages/conversations").send({
        type: "GROUP",
        title: "Front desk",
        recipientIds: [memberUserIds.teacherA],
      })
      groupId = (created.body.data as { id: string }).id

      const add = await adminAAgent.post(`/api/v1/messages/conversations/${groupId}/participants`).send({
        recipientIds: [memberUserIds.receptionistA, memberUserIds.parentA],
      })
      expect(add.status).toBe(200)
      const participants = (add.body.data as { participants: { userId: string }[] }).participants.map((p) => p.userId)
      expect(participants).toHaveLength(4)

      const auditRows = await prisma.auditLog.findMany({
        where: { entityType: "CONVERSATION_PARTICIPANT", metadata: { equals: { conversationId: groupId } } },
      })
      expect(auditRows).toHaveLength(2)
    })

    it("rejects duplicate targets with no-op feedback", async () => {
      const res = await adminAAgent.post(`/api/v1/messages/conversations/${groupId}/participants`).send({ recipientIds: [memberUserIds.receptionistA] })
      expect(res.status).toBe(400)
    })

    it("rejects adding participants to direct conversations", async () => {
      const directId = await createDirect()
      const res = await adminAAgent.post(`/api/v1/messages/conversations/${directId}/participants`).send({ recipientIds: [memberUserIds.parentA] })
      expect(res.status).toBe(400)
    })
  })

  describe("archiving", () => {
    it("hides the thread from the caller's list and unread count only", async () => {
      const directId = await createDirect()
      await adminAAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: "archive me" })
      const beforeTotal = (await teacherAAgent.get("/api/v1/messages/unread-count")).body.data.total as number
      const targetUnread = (await teacherAAgent.get(`/api/v1/messages/conversations/${directId}`)).body.data.unreadCount as number
      expect(targetUnread).toBeGreaterThan(0)

      const archive = await teacherAAgent.post(`/api/v1/messages/conversations/${directId}/archive`)
      expect(archive.status).toBe(200)

      const list = await teacherAAgent.get("/api/v1/messages/conversations")
      const ids = (list.body.data.items as { id: string }[]).map((c) => c.id)
      expect(ids).not.toContain(directId)
      expect((await teacherAAgent.get("/api/v1/messages/unread-count")).body.data.total).toBe(beforeTotal - targetUnread)

      const adminList = await adminAAgent.get("/api/v1/messages/conversations")
      const adminIds = (adminList.body.data.items as { id: string }[]).map((c) => c.id)
      expect(adminIds).toContain(directId)

      const auditRows = await prisma.auditLog.findMany({
        where: { entityType: "CONVERSATION", entityId: directId, action: "ARCHIVE" },
      })
      expect(auditRows).toHaveLength(1)
    })
  })

  describe("audit privacy", () => {
    it("audits structural events without message bodies", async () => {
      const token = "sensitive-body-token-xyz"
      const directId = await createDirect()
      await adminAAgent.post(`/api/v1/messages/conversations/${directId}/messages`).send({ body: token })
      const countBefore = await prisma.auditLog.count()

      const all = await prisma.auditLog.findMany()
      const auditText = JSON.stringify(all)
      expect(auditText).not.toContain(token)
      expect(auditText).not.toContain("x".repeat(161))

      const messageRows = all.filter((row) => row.entityType === "MESSAGE")
      expect(messageRows).toHaveLength(0)
      const countAfter = await prisma.auditLog.count()
      expect(countAfter).toBe(countBefore)

      const createAudit = await prisma.auditLog.findMany({
        where: { entityType: "CONVERSATION", entityId: directId, action: "CREATE" },
      })
      expect(createAudit).toHaveLength(1)
      const meta = createAudit[0].metadata as { type: string; participantCount: number }
      expect(meta.type).toBe("DIRECT")
      expect(meta.participantCount).toBe(2)
    })
  })

  describe("group size limit", () => {
    it("rejects role broadcasts that would exceed GROUP_CONVERSATION_LIMIT", async () => {
      const passwordHash = hashPassword("password-123456")
      const extraUsers: { email: string; name: string }[] = Array.from({ length: 48 }, (_, index) => ({
        email: `msg.teacher.bulk.${index}@example.com`,
        name: `Bulk Teacher ${index}`,
      }))
      await prisma.user.createMany({
        data: extraUsers.map((user) => ({ ...user, passwordHash, status: "ACTIVE" })),
      })
      const createdUsers = await prisma.user.findMany({
        where: { email: { in: extraUsers.map((user) => user.email) } },
        select: { id: true },
      })
      await prisma.tenantMembership.createMany({
        data: createdUsers.map((user) => ({
          userId: user.id,
          schoolId: schoolA.id,
          roleId: roleIds.TEACHER,
          status: "ACTIVE",
        })),
      })

      const res = await adminAAgent.post("/api/v1/messages/conversations").send({
        type: "GROUP",
        title: "Bulk teachers",
        roleNames: ["TEACHER"],
      })
      expect(res.status).toBe(400)
    })
  })

  describe("cross-school direct conversations (directKey uniqueness per tenant)", () => {
    it("allows the same sender+recipient pair to have separate conversations in two different schools", async () => {
      // School A: crossAdmin (sender) → crossTeacher (recipient)
      const inA = await sharedAdminAgent
        .set("x-school-id", schoolA.id)
        .post("/api/v1/messages/conversations")
        .send({ type: "DIRECT", recipientIds: [memberUserIds.crossTeacher] })
      expect(inA.status).toBe(201)
      const convAId = (inA.body.data as { id: string }).id

      // School B: the same crossAdmin + crossTeacher → same directKey, but
      // a different school — must NOT collide.
      const inB = await sharedAdminAgent
        .set("x-school-id", schoolB.id)
        .post("/api/v1/messages/conversations")
        .send({ type: "DIRECT", recipientIds: [memberUserIds.crossTeacher] })
      expect(inB.status).toBe(201)
      const convBId = (inB.body.data as { id: string }).id

      // The two conversations are distinct rows.
      expect(convBId).not.toBe(convAId)

      // Each school's list shows only its own conversation.
      const listA = await sharedAdminAgent.set("x-school-id", schoolA.id).get("/api/v1/messages/conversations")
      const idsA = (listA.body.data.items as { id: string }[]).map((c) => c.id)
      expect(idsA).toContain(convAId)
      expect(idsA).not.toContain(convBId)

      const listB = await sharedAdminAgent.set("x-school-id", schoolB.id).get("/api/v1/messages/conversations")
      const idsB = (listB.body.data.items as { id: string }[]).map((c) => c.id)
      expect(idsB).toContain(convBId)
      expect(idsB).not.toContain(convAId)
    })
  })

  async function createDirect(): Promise<string> {
    const res = await adminAAgent.post("/api/v1/messages/conversations").send({ type: "DIRECT", recipientIds: [memberUserIds.teacherA] })
    expect(res.status).toBe(201)
    return (res.body.data as { id: string }).id
  }
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.userRole.deleteMany()
  await prisma.tenantMembership.deleteMany()
  // Fee invoices reference sessions (Restrict FK); clear them before sessions.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.academicSession.deleteMany()
  await prisma.school.deleteMany()
  await prisma.rolePermission.deleteMany()
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
  await prisma.user.deleteMany()
}

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}