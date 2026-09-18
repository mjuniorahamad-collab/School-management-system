import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword, verifyPassword } from "../src/auth/password.js"
import { hashToken } from "../src/auth/tokens.js"

// Portal account provisioning + one-time activation suite. Verifies: only
// `portal:update` holders may provision/regenerate; new emails create a fresh
// PARENT account with a hashed one-time token; duplicate emails are linked to
// the existing user with no invite; the raw token is returned once and never
// stored; activation is single-use, expiring, and auto-signs the parent in; and
// deprovisioning the last linked profile actually revokes tenant access.
// DB-gated like the other integration suites (TEST_DATABASE_URL) and run
// serially (fileParallelism: false).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

// Raw token + activated guardian user id captured during provisioning and
// reused by later blocks (ordering within the file is linear and explicit).
let pendingToken = ""
let activatedGuardianUserId = ""

describe.skipIf(!TEST_DATABASE_URL)("Portal account activation (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }
  let guardianA1Id = ""
  let studentA1Id = ""
  let studentA2Id = ""
  let studentA3Id = ""
  let studentA4Id = ""
  let studentA5Id = ""
  let studentA6Id = ""
  let studentB1Id = ""
  let adminUserId = ""
  let existingParentId = ""
  let foreignParentId = ""
  let bareParentId = ""
  let staffUserId = ""

  const adminAgent = request.agent(app)
  const parentAgent = request.agent(app) // existingParent (portal:view only)
  const activationAgent = request.agent(app) // becomes guardianA1's session
  const deprovisionAgent = request.agent(app) // becomes studentA3's session

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

    const viewPerm = await prisma.permission.create({
      data: { code: "portal:view", resource: "portal", action: "view" },
    })
    const updatePerm = await prisma.permission.create({
      data: { code: "portal:update", resource: "portal", action: "update" },
    })

    const parentRole = await prisma.role.create({
      data: {
        name: "PARENT",
        description: "Test parent",
        rolePermissions: { create: { permissionId: viewPerm.id } },
      },
    })
    const adminRole = await prisma.role.create({
      data: {
        name: "PORTAL_ADMIN",
        description: "Test portal admin",
        rolePermissions: {
          create: [{ permissionId: viewPerm.id }, { permissionId: updatePerm.id }],
        },
      },
    })
    const staffRole = await prisma.role.create({
      data: {
        name: "STAFF_TEST",
        description: "Test staff (non-parent portal viewer)",
        rolePermissions: { create: { permissionId: viewPerm.id } },
      },
    })

    schoolA.id = (await prisma.school.create({ data: { name: "Activation School A" } })).id
    schoolB.id = (await prisma.school.create({ data: { name: "Activation School B" } })).id

    async function makeStudent(schoolId: string, admissionNumber: string, firstName: string): Promise<string> {
      const student = await prisma.student.create({
        data: {
          schoolId,
          admissionNumber,
          firstName,
          lastName: "Learner",
          dateOfBirth: new Date("2015-05-01T00:00:00.000Z"),
          gender: "FEMALE",
          status: "ACTIVE",
          admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        },
      })
      return student.id
    }

    studentA1Id = await makeStudent(schoolA.id, "ACT-2026-0001", "Amara")
    studentA2Id = await makeStudent(schoolA.id, "ACT-2026-0002", "Bella")
    studentA3Id = await makeStudent(schoolA.id, "ACT-2026-0003", "Cara")
    studentA4Id = await makeStudent(schoolA.id, "ACT-2026-0004", "Dara")
    studentA5Id = await makeStudent(schoolA.id, "ACT-2026-0005", "Ella")
    studentA6Id = await makeStudent(schoolA.id, "ACT-2026-0006", "Faye")
    studentB1Id = await makeStudent(schoolB.id, "ACT-2026-9001", "Fina")

    const guardianA1 = await prisma.guardian.create({
      data: { schoolId: schoolA.id, name: "Grace Guardian" },
    })
    guardianA1Id = guardianA1.id
    await prisma.studentGuardian.create({
      data: {
        studentId: studentA1Id,
        guardianId: guardianA1Id,
        relationshipType: "MOTHER",
        isPrimary: true,
      },
    })

    async function makeUser(
      name: string,
      email: string,
      roleId: string,
      schoolId: string,
      password = "activation-test-secret-123",
    ): Promise<string> {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: hashPassword(password),
          status: "ACTIVE",
          roles: { create: [{ role: { connect: { id: roleId } } }] },
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
      })
      return user.id
    }

    adminUserId = await makeUser("Activation Admin", "act.admin@example.com", adminRole.id, schoolA.id)
    existingParentId = await makeUser(
      "Existing Parent",
      "act.existing@example.com",
      parentRole.id,
      schoolA.id,
    )
    foreignParentId = await makeUser(
      "Foreign Parent",
      "act.foreign@example.com",
      parentRole.id,
      schoolB.id,
    )
    bareParentId = await makeUser("Bare Parent", "act.bare@example.com", parentRole.id, schoolA.id)
    staffUserId = await makeUser("Staff Viewer", "act.staff@example.com", staffRole.id, schoolA.id)

    await login(adminAgent, "act.admin@example.com", "activation-test-secret-123")
    await login(parentAgent, "act.existing@example.com", "activation-test-secret-123")
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  describe("guards", () => {
    it("requires authentication to provision an account", async () => {
      const res = await request(app).post("/api/v1/portal/accounts").send({})
      expect(res.status).toBe(401)
    })

    it("a portal:view-only user cannot provision (403)", async () => {
      const res = await parentAgent.post("/api/v1/portal/accounts").send({
        profileType: "STUDENT",
        profileId: studentA2Id,
        parentName: "Nope",
        email: "nope@example.com",
      })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("a portal:view-only user cannot regenerate an activation link (403)", async () => {
      const res = await parentAgent
        .post("/api/v1/portal/accounts/regenerate")
        .send({ userId: existingParentId })
      expect(res.status).toBe(403)
    })

    it("a forged activation token is rejected (400)", async () => {
      const res = await request(app)
        .post("/api/v1/portal/activate")
        .send({ token: "this-token-does-not-exist-anywhere-0000000000", newPassword: "ValidPassword123" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("INVALID_OR_EXPIRED_LINK")
    })

    it("activation enforces the password policy (400)", async () => {
      const res = await request(app)
        .post("/api/v1/portal/activate")
        .send({ token: "short-password-token-0000000000000000000000", newPassword: "short" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })
  })

  describe("provisioning a new account", () => {
    let rawToken = ""
    let provisionedUserId = ""

    it("the admin provisions a one-time account for an unlinked guardian", async () => {
      const res = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "GUARDIAN",
        profileId: guardianA1Id,
        parentName: "Grace Guardian",
        email: "act.grace@example.com",
      })
      expect(res.status).toBe(201)
      expect(res.body.data.provisioned).toBe(true)
      expect(res.body.data.linkedToExisting).toBe(false)
      expect(typeof res.body.data.token).toBe("string")
      expect(res.body.data.token.length).toBeGreaterThanOrEqual(20)
      expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now())
      rawToken = res.body.data.token
      provisionedUserId = res.body.data.userId
      pendingToken = rawToken
      activatedGuardianUserId = provisionedUserId
      expect(res.body.data.userEmail).toBe("act.grace@example.com")
    })

    it("stores only the hashed token and leaves the account pre-activation", async () => {
      const tokenRow = await prisma.portalActivationToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
      })
      expect(tokenRow).not.toBeNull()
      expect(tokenRow?.tokenHash).not.toBe(rawToken)
      expect(tokenRow?.usedAt).toBeNull()
      expect(tokenRow?.revokedAt).toBeNull()
      expect(tokenRow?.userId).toBe(provisionedUserId)

      const user = await prisma.user.findUniqueOrThrow({ where: { id: provisionedUserId } })
      expect(user.status).toBe("ACTIVE")
      expect(user.passwordHash).not.toBe(rawToken)
      expect(user.passwordHash.startsWith("scrypt$")).toBe(true)
    })

    it("creates an ACTIVE PARENT membership and links the profile", async () => {
      const membership = await prisma.tenantMembership.findFirstOrThrow({
        where: { userId: provisionedUserId, schoolId: schoolA.id },
        include: { role: { select: { name: true } } },
      })
      expect(membership.status).toBe("ACTIVE")
      expect(membership.role.name).toBe("PARENT")

      const guardian = await prisma.guardian.findUniqueOrThrow({ where: { id: guardianA1Id } })
      expect(guardian.userId).toBe(provisionedUserId)
    })

    it("records a provisioning audit event", async () => {
      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, entityType: "GUARDIAN", entityId: guardianA1Id, action: "CREATE" },
        orderBy: { createdAt: "desc" },
      })
      expect(audit?.actorId).toBe(adminUserId)
      expect(audit?.summary).toContain("Provisioned portal account")
    })

    it("shows a PENDING activation state in link management", async () => {
      const res = await adminAgent.get("/api/v1/portal/links")
      expect(res.status).toBe(200)
      const link = res.body.data.guardianLinks.find((l: { profileId: string }) => l.profileId === guardianA1Id)
      expect(link.activation.status).toBe("PENDING")
    })

    it("rejects provisioning an already-linked profile (400)", async () => {
      const res = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "GUARDIAN",
        profileId: guardianA1Id,
        parentName: "Grace Guardian",
        email: "act.grace2@example.com",
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects provisioning an unknown profile (404)", async () => {
      const res = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "STUDENT",
        profileId: "00000000-0000-4000-8000-000000000000",
        parentName: "Ghost",
        email: "ghost@example.com",
      })
      expect(res.status).toBe(404)
    })

    it("cross-tenant: cannot provision another school's profile (404)", async () => {
      const res = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "STUDENT",
        profileId: studentB1Id,
        parentName: "Outsider",
        email: "outsider@example.com",
      })
      expect(res.status).toBe(404)
    })

    it("the placeholder credentials cannot sign in before activation", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "act.grace@example.com", password: "activation-test-secret-123" })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS")
    })
  })

  describe("duplicate email → link, don't invite", () => {
    it("links the profile to the existing user with no token", async () => {
      const res = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "STUDENT",
        profileId: studentA2Id,
        parentName: "Existing Parent",
        email: "act.existing@example.com",
      })
      expect(res.status).toBe(201)
      expect(res.body.data.provisioned).toBe(false)
      expect(res.body.data.linkedToExisting).toBe(true)
      expect(res.body.data.token).toBeNull()
      expect(res.body.data.userId).toBe(existingParentId)

      const student = await prisma.student.findUniqueOrThrow({ where: { id: studentA2Id } })
      expect(student.userId).toBe(existingParentId)

      const tokens = await prisma.portalActivationToken.count({ where: { userId: existingParentId } })
      expect(tokens).toBe(0)
    })

    it("does not change the existing user's password", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: existingParentId } })
      expect(verifyPassword("activation-test-secret-123", user.passwordHash)).toBe(true)
    })

    it("rejects an email belonging to another school (400)", async () => {
      const res = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "STUDENT",
        profileId: studentA4Id,
        parentName: "Foreign Parent",
        email: "act.foreign@example.com",
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(foreignParentId).toBeTruthy()
    })
  })

  describe("activation", () => {
    let activatedUserId = ""

    it("activates with a valid token and sets session cookies", async () => {
      const res = await activationAgent
        .post("/api/v1/portal/activate")
        .send({ token: pendingToken, newPassword: "ParentSetSecret123" })
      expect(res.status).toBe(200)
      expect(res.body.data.activated).toBe(true)
      expect(res.body.data.autoSignedIn).toBe(true)

      const cookies = res.headers["set-cookie"] as unknown as string[] | undefined
      expect(cookies?.some((c) => c.startsWith("sms.access=") && c.includes("HttpOnly"))).toBe(true)
      expect(cookies?.some((c) => c.startsWith("sms.refresh=") && c.includes("HttpOnly"))).toBe(true)
      activatedUserId = res.body.data.user.id
      activatedGuardianUserId = res.body.data.user.id
    })

    it("replaces the placeholder password and consumes the token", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: activatedUserId } })
      expect(verifyPassword("ParentSetSecret123", user.passwordHash)).toBe(true)

      const tokenRow = await prisma.portalActivationToken.findFirstOrThrow({
        where: { tokenHash: hashToken(pendingToken) },
      })
      expect(tokenRow.usedAt).not.toBeNull()
    })

    it("a used token cannot be replayed (400)", async () => {
      const res = await request(app)
        .post("/api/v1/portal/activate")
        .send({ token: pendingToken, newPassword: "AnotherPassword123" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("INVALID_OR_EXPIRED_LINK")
    })

    it("the activation auto-sign-in yields a real PARENT session", async () => {
      const me = await activationAgent.get("/api/v1/auth/me")
      expect(me.status).toBe(200)
      expect(me.body.data.user.roles).toContain("PARENT")
      expect(me.body.data.user.permissions).toContain("portal:view")
    })

    it("the signed-in guardian sees only their linked child", async () => {
      const res = await activationAgent.get("/api/v1/me")
      expect(res.status).toBe(200)
      expect(res.body.data.actorKind).toBe("GUARDIAN")
      const ids = res.body.data.children.map((c: { id: string }) => c.id)
      expect(ids).toContain(studentA1Id)
      expect(ids).not.toContain(studentA2Id)

      const foreign = await activationAgent.get(`/api/v1/me/children/${studentB1Id}`)
      expect(foreign.status).toBe(404)
    })

    it("the new credentials can sign in normally", async () => {
      const agent = request.agent(app)
      await login(agent, "act.grace@example.com", "ParentSetSecret123")
    })

    it("link management now reports the account as ACTIVATED", async () => {
      const res = await adminAgent.get("/api/v1/portal/links")
      const link = res.body.data.guardianLinks.find((l: { profileId: string }) => l.profileId === guardianA1Id)
      expect(link.activation.status).toBe("ACTIVATED")
    })
  })

  describe("expiry and regeneration", () => {
    it("an expired token is rejected (400)", async () => {
      const provision = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "STUDENT",
        profileId: studentA5Id,
        parentName: "Expiring Parent",
        email: "act.expiring@example.com",
      })
      expect(provision.status).toBe(201)
      const raw = provision.body.data.token as string

      await prisma.portalActivationToken.update({
        where: { tokenHash: hashToken(raw) },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      })

      const res = await request(app)
        .post("/api/v1/portal/activate")
        .send({ token: raw, newPassword: "ExpiredPass123" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("INVALID_OR_EXPIRED_LINK")
    })

    it("regeneration invalidates the previous link and issues a working one", async () => {
      const provision = await adminAgent.post("/api/v1/portal/accounts").send({
        profileType: "STUDENT",
        profileId: studentA3Id,
        parentName: "Regenerated Parent",
        email: "act.regenerated@example.com",
      })
      expect(provision.status).toBe(201)
      const firstToken = provision.body.data.token as string
      const userId = provision.body.data.userId as string

      const regen = await adminAgent
        .post("/api/v1/portal/accounts/regenerate")
        .send({ userId })
      expect(regen.status).toBe(200)
      const secondToken = regen.body.data.token as string

      const stale = await request(app)
        .post("/api/v1/portal/activate")
        .send({ token: firstToken, newPassword: "StalePassword123" })
      expect(stale.status).toBe(400)

      const res = await deprovisionAgent
        .post("/api/v1/portal/activate")
        .send({ token: secondToken, newPassword: "FreshPassword123" })
      expect(res.status).toBe(200)
      expect(res.body.data.user.id).toBe(userId)
    })

    it("regeneration is blocked for a user with no linked profiles (400)", async () => {
      const res = await adminAgent
        .post("/api/v1/portal/accounts/regenerate")
        .send({ userId: bareParentId })
      expect(res.status).toBe(400)
    })

    it("regeneration is blocked cross-tenant (404)", async () => {
      const res = await adminAgent
        .post("/api/v1/portal/accounts/regenerate")
        .send({ userId: foreignParentId })
      expect(res.status).toBe(404)
    })
  })

  describe("deprovisioning", () => {
    it("unlinking the last profile revokes tenant access and the live session", async () => {
      const meBefore = await deprovisionAgent.get("/api/v1/me")
      expect(meBefore.status).toBe(200)
      const actorId = meBefore.body.data.id as string

      const res = await adminAgent.delete("/api/v1/portal/links").send({
        userId: actorId,
        profileType: "STUDENT",
        profileId: studentA3Id,
      })
      expect(res.status).toBe(200)

      const membership = await prisma.tenantMembership.findFirstOrThrow({
        where: { userId: actorId, schoolId: schoolA.id },
      })
      expect(membership.status).toBe("INACTIVE")

      const revoked = await prisma.portalActivationToken.count({
        where: { userId: actorId, revokedAt: null, usedAt: null },
      })
      expect(revoked).toBe(0)

      const meAfter = await deprovisionAgent.get("/api/v1/me")
      expect(meAfter.status).toBe(403)

      const relogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "act.regenerated@example.com", password: "FreshPassword123" })
      expect(relogin.status).toBe(403)

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, action: "MEMBER_STATUS_CHANGE" },
        orderBy: { createdAt: "desc" },
      })
      expect(audit?.entityId).toBe(membership.id)
    })

    it("keeps access while another profile remains linked", async () => {
      const link = await adminAgent.post("/api/v1/portal/links").send({
        userId: activatedGuardianUserId,
        profileType: "STUDENT",
        profileId: studentA4Id,
      })
      expect(link.status).toBe(201)

      const unlink = await adminAgent.delete("/api/v1/portal/links").send({
        userId: activatedGuardianUserId,
        profileType: "GUARDIAN",
        profileId: guardianA1Id,
      })
      expect(unlink.status).toBe(200)

      const membership = await prisma.tenantMembership.findFirstOrThrow({
        where: { userId: activatedGuardianUserId, schoolId: schoolA.id },
      })
      expect(membership.status).toBe("ACTIVE")

      const me = await activationAgent.get("/api/v1/me")
      expect(me.status).toBe(200)
      const ids = me.body.data.children.map((c: { id: string }) => c.id)
      expect(ids).toContain(studentA4Id)
    })

    it("leaves a non-parent staff membership untouched", async () => {
      const link = await adminAgent.post("/api/v1/portal/links").send({
        userId: staffUserId,
        profileType: "STUDENT",
        profileId: studentA6Id,
      })
      expect(link.status).toBe(201)

      const unlink = await adminAgent.delete("/api/v1/portal/links").send({
        userId: staffUserId,
        profileType: "STUDENT",
        profileId: studentA6Id,
      })
      expect(unlink.status).toBe(200)

      const membership = await prisma.tenantMembership.findFirstOrThrow({
        where: { userId: staffUserId, schoolId: schoolA.id },
      })
      expect(membership.status).toBe("ACTIVE")
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.feeInvoice.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.studentEnrollment.deleteMany()
  await prisma.examResult.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.libraryLoan.deleteMany()
  await prisma.transportAssignment.deleteMany()
  await prisma.portalActivationToken.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
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
