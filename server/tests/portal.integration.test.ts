import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"

// Student/Parent Portal suite. Verifies ownership-scoped access: a portal user
// may only read their own linked student(s)/child(ren); changing `:studentId`
// never exposes another student's data; cross-tenant records are unreachable;
// and account provisioning (link/unlink) is restricted to `portal:update`
// holders and recorded in the audit log. DB-gated like the other integration
// suites; the shared TEST_DATABASE_URL is reset in beforeAll and the suite runs
// serially (fileParallelism: false).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

describe.skipIf(!TEST_DATABASE_URL)("Student/Parent Portal (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }
  let sessionAId = ""
  let studentAId = ""
  let studentCId = ""
  let studentBId = ""
  let guardianAId = ""
  let parentUserId = ""
  let studentUserId = ""
  let adminUserId = ""
  let parent2UserId = ""

  const guardianAgent = request.agent(app) // parentUser: linked via Guardian.userId
  const studentAgent = request.agent(app) // studentUser: linked via Student.userId
  const adminAgent = request.agent(app) // PORTAL_ADMIN: portal:view + portal:update
  const parent2Agent = request.agent(app) // provisioned later by the admin

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
    const studentRole = await prisma.role.create({
      data: {
        name: "STUDENT",
        description: "Test student",
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

    const schoolANew = await prisma.school.create({ data: { name: "Portal School A" } })
    schoolA.id = schoolANew.id
    const schoolBNew = await prisma.school.create({ data: { name: "Portal School B" } })
    schoolB.id = schoolBNew.id

    const sessionA = await prisma.academicSession.create({
      data: {
        schoolId: schoolA.id,
        name: "A Year 2026",
        code: "AY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    sessionAId = sessionA.id

    const classA = await prisma.class.create({ data: { schoolId: schoolA.id, name: "6", sortOrder: 6 } })
    const sectionA = await prisma.section.create({ data: { classId: classA.id, name: "A" } })

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

    studentAId = await makeStudent(schoolA.id, "POR-2026-0001", "Amara")
    studentCId = await makeStudent(schoolA.id, "POR-2026-0002", "Chidi")
    studentBId = await makeStudent(schoolB.id, "POR-2026-9001", "Bina")

    for (const studentId of [studentAId, studentCId]) {
      await prisma.studentEnrollment.create({
        data: { studentId, academicSessionId: sessionAId, classId: classA.id, sectionId: sectionA.id },
      })
    }

    // Guardian A is the parent of student A only (not student C).
    const guardianA = await prisma.guardian.create({
      data: { schoolId: schoolA.id, name: "Ms. Amara Guardian" },
    })
    guardianAId = guardianA.id
    await prisma.studentGuardian.create({
      data: { studentId: studentAId, guardianId: guardianAId, relationshipType: "MOTHER", isPrimary: true },
    })

    async function makeUser(name: string, email: string, roleId: string, schoolId: string): Promise<string> {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: hashPassword("portal-test-secret-123"),
          status: "ACTIVE",
          roles: { create: [{ role: { connect: { id: roleId } } }] },
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
      })
      return user.id
    }

    parentUserId = await makeUser("Portal Parent", "portal.parent@example.com", parentRole.id, schoolA.id)
    studentUserId = await makeUser("Portal Student", "portal.student@example.com", studentRole.id, schoolA.id)
    adminUserId = await makeUser("Portal Admin", "portal.admin@example.com", adminRole.id, schoolA.id)

    // Link the parent account to guardian A and the student account to student A.
    await prisma.guardian.update({ where: { id: guardianAId }, data: { userId: parentUserId } })
    await prisma.student.update({ where: { id: studentAId }, data: { userId: studentUserId } })

    await login(guardianAgent, "portal.parent@example.com", "portal-test-secret-123")
    await login(studentAgent, "portal.student@example.com", "portal-test-secret-123")
    await login(adminAgent, "portal.admin@example.com", "portal-test-secret-123")
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  it("requires authentication for the self-service portal", async () => {
    const res = await request(app).get("/api/v1/me")
    expect(res.status).toBe(401)
  })

  it("requires authentication for link management", async () => {
    const res = await request(app).post("/api/v1/portal/links").send({})
    expect(res.status).toBe(401)
  })

  describe("ownership-scoped self-service reads", () => {
    it("a guardian sees only the children related to their linked guardian profile", async () => {
      const res = await guardianAgent.get("/api/v1/me")
      expect(res.status).toBe(200)
      expect(res.body.data.actorKind).toBe("GUARDIAN")
      const ids = res.body.data.children.map((c: { id: string }) => c.id)
      expect(ids).toEqual([studentAId])
      expect(ids).not.toContain(studentCId)
    })

    it("a linked student sees only their own record", async () => {
      const res = await studentAgent.get("/api/v1/me")
      expect(res.status).toBe(200)
      expect(res.body.data.actorKind).toBe("STUDENT")
      const ids = res.body.data.children.map((c: { id: string }) => c.id)
      expect(ids).toEqual([studentAId])
    })

    it("the guardian can fetch their own child's detail", async () => {
      const res = await guardianAgent.get(`/api/v1/me/children/${studentAId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(studentAId)
      expect(res.body.data.guardians.length).toBeGreaterThan(0)
    })

    it("ID tampering: the guardian cannot fetch a schoolmate who is not their child (404)", async () => {
      const res = await guardianAgent.get(`/api/v1/me/children/${studentCId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("ID tampering: the linked student cannot fetch another student (404)", async () => {
      const res = await studentAgent.get(`/api/v1/me/children/${studentCId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("cross-tenant: a portal user cannot reach another school's student (404)", async () => {
      const res = await guardianAgent.get(`/api/v1/me/children/${studentBId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("the guardian can read attendance for their own child", async () => {
      const res = await guardianAgent.get(`/api/v1/me/children/${studentAId}/attendance`)
      expect(res.status).toBe(200)
      expect(res.body.data.session.id).toBe(sessionAId)
    })

    it("the guardian cannot read attendance for a non-owned student (404)", async () => {
      const res = await guardianAgent.get(`/api/v1/me/children/${studentCId}/attendance`)
      expect(res.status).toBe(404)
    })

    it("notices are published to portal viewers", async () => {
      const res = await guardianAgent.get("/api/v1/me/notices")
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data.notices)).toBe(true)
    })
  })

  describe("account provisioning (portal:update only)", () => {
    it("a parent cannot list portal links (403)", async () => {
      const res = await guardianAgent.get("/api/v1/portal/links")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("a parent cannot create a portal link (403)", async () => {
      const res = await guardianAgent.post("/api/v1/portal/links").send({
        userId: parentUserId,
        profileType: "STUDENT",
        profileId: studentCId,
      })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("an admin can list links and sees the seeded profile links", async () => {
      const res = await adminAgent.get("/api/v1/portal/links")
      expect(res.status).toBe(200)
      const ids = res.body.data.studentLinks.map((l: { profileId: string }) => l.profileId)
      expect(ids).toContain(studentAId)
    })

    it("link candidates exclude already-linked profiles", async () => {
      const res = await adminAgent.get("/api/v1/portal/links/candidates")
      expect(res.status).toBe(200)
      const studentIds = res.body.data.students.map((s: { id: string }) => s.id)
      expect(studentIds).toContain(studentCId)
      expect(studentIds).not.toContain(studentAId)
    })

    it("admin links an unlinked student to a new parent account", async () => {
      const user = await prisma.user.create({
        data: {
          name: "Portal Parent Two",
          email: "portal.parent2@example.com",
          passwordHash: hashPassword("portal-test-secret-123"),
          status: "ACTIVE",
        },
      })
      parent2UserId = user.id
      // Provisioned via membership (no legacy schoolId).
      await prisma.tenantMembership.create({
        data: {
          userId: user.id,
          schoolId: schoolA.id,
          roleId: (await prisma.role.findUniqueOrThrow({ where: { name: "PARENT" } })).id,
          status: "ACTIVE",
        },
      })

      const res = await adminAgent.post("/api/v1/portal/links").send({
        userId: parent2UserId,
        profileType: "STUDENT",
        profileId: studentCId,
      })
      expect(res.status).toBe(201)
      expect(res.body.data.linked).toBe(true)

      await login(parent2Agent, "portal.parent2@example.com", "portal-test-secret-123")
      const me = await parent2Agent.get("/api/v1/me")
      expect(me.status).toBe(200)
      const ids = me.body.data.children.map((c: { id: string }) => c.id)
      expect(ids).toContain(studentCId)
      expect(ids).not.toContain(studentAId)
    })

    it("linking a profile that already has a user is rejected (400)", async () => {
      const res = await adminAgent.post("/api/v1/portal/links").send({
        userId: studentUserId,
        profileType: "STUDENT",
        profileId: studentAId,
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("cross-tenant: an admin cannot link another school's student (404)", async () => {
      const res = await adminAgent.post("/api/v1/portal/links").send({
        userId: parent2UserId,
        profileType: "STUDENT",
        profileId: studentBId,
      })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("linking records an auditable entity event", async () => {
      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, entityType: "STUDENT", entityId: studentCId },
        orderBy: { createdAt: "desc" },
      })
      expect(audit).not.toBeNull()
      expect(audit?.action).toBe("UPDATE")
      expect(audit?.actorId).toBe(adminUserId)
      expect(audit?.summary).toContain("Linked")
    })

    it("admin can unlink and the account loses access", async () => {
      const res = await adminAgent.delete("/api/v1/portal/links").send({
        userId: parent2UserId,
        profileType: "STUDENT",
        profileId: studentCId,
      })
      expect(res.status).toBe(200)
      expect(res.body.data.linked).toBe(false)

      const me = await parent2Agent.get("/api/v1/me")
      const ids = me.body.data.children.map((c: { id: string }) => c.id)
      expect(ids).not.toContain(studentCId)
    })

    it("unlink audit entry is recorded", async () => {
      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, entityType: "STUDENT", entityId: studentCId },
        orderBy: { createdAt: "desc" },
      })
      expect(audit).not.toBeNull()
      expect(audit?.summary).toContain("Unlinked")
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.studentGuardian.deleteMany()
  await prisma.studentEnrollment.deleteMany()
  await prisma.feeInvoice.deleteMany()
  await prisma.examResult.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.libraryLoan.deleteMany()
  await prisma.transportAssignment.deleteMany()
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