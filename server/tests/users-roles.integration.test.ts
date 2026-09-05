import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

// Users & Roles module — tenant-scoped membership management.
//
// Verifies:
//   - a tenant admin manages only their own tenant's users
//   - cross-tenant user/role access is blocked (list, direct-ID, assignment)
//   - the same global user can hold different roles in different tenants
//   - platform super admin behavior is explicit and controlled
//   - self-management safeguards (no self-lockout)
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const MANAGER_PERMS = [
  "users:view",
  "users:create",
  "users:update",
  "users:delete",
  "roles:view",
]

describe.skipIf(!TEST_DATABASE_URL)("Users & Roles (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  let teacherRoleId = ""
  let accountantRoleId = ""
  let superRoleId = ""

  let adminAUserId = ""
  let adminBUserId = ""
  let platSupUserId = ""

  const adminAAgent = request.agent(app)
  const adminBAgent = request.agent(app)
  const platSupAgent = request.agent(app)

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

    // Roles.
    const superRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Platform super admin" },
    })
    superRoleId = superRole.id
    const schoolAdminRole = await prisma.role.create({
      data: { name: "SCHOOL_ADMIN", description: "Tenant admin" },
    })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Tenant teacher" } })
    teacherRoleId = teacherRole.id
    const accountantRole = await prisma.role.create({ data: { name: "ACCOUNTANT", description: "Tenant accountant" } })
    accountantRoleId = accountantRole.id

    // Permissions + grants so the SCHOOL_ADMIN tenant admin can manage users.
    for (const code of MANAGER_PERMS) {
      const [resource, action] = code.split(":")
      await prisma.permission.create({ data: { code, resource, action, description: code } })
    }
    const managerPermissions = await prisma.permission.findMany({
      where: { code: { in: MANAGER_PERMS } },
    })
    await prisma.rolePermission.createMany({
      data: managerPermissions.map((permission) => ({
        roleId: schoolAdminRole.id,
        permissionId: permission.id,
      })),
    })

    // Schools.
    const a = await prisma.school.create({ data: { name: "Users School A" } })
    schoolA.id = a.id
    const b = await prisma.school.create({ data: { name: "Users School B" } })
    schoolB.id = b.id

    // Helper to create a global user + a membership.
    const createMember = async (
      email: string,
      name: string,
      schoolId: string,
      roleId: string,
      membershipStatus: "ACTIVE" | "INACTIVE" = "ACTIVE",
    ): Promise<{ userId: string }> => {
      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash: hashPassword("password-123456"),
          status: "ACTIVE",
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: membershipStatus },
      })
      return { userId: user.id }
    }

    const adminA = await createMember("admin.a@example.com", "Admin A", schoolA.id, schoolAdminRole.id)
    adminAUserId = adminA.userId
    const adminB = await createMember("admin.b@example.com", "Admin B", schoolB.id, schoolAdminRole.id)
    adminBUserId = adminB.userId

    // Platform super admin — a SUPER_ADMIN member of School A. Not a "tenant
    // admin": cannot be managed by a tenant admin, cannot be assigned by tenant
    // admins, but can manage within a tenant (bypass via role check).
    const platSup = await createMember("plat.super@example.com", "Platform Super", schoolA.id, superRoleId)
    platSupUserId = platSup.userId

    await login(adminAAgent, "admin.a@example.com", "password-123456")
    await login(adminBAgent, "admin.b@example.com", "password-123456")
    await login(platSupAgent, "plat.super@example.com", "password-123456")
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  describe("roles catalog (assignable)", () => {
    it("requires the roles:view permission", async () => {
      const res = await request(app).get("/api/v1/roles")
      expect(res.status).toBe(401)
    })

    it("tenant admin can list assignable roles", async () => {
      const res = await adminAAgent.get("/api/v1/roles")
      expect(res.status).toBe(200)
      const names = res.body.data.map((r: { name: string }) => r.name)
      expect(names).toContain("SCHOOL_ADMIN")
      expect(names).toContain("TEACHER")
      expect(names).not.toContain(SUPER_ADMIN_ROLE)
    })
  })

  describe("tenant A admin manages tenant A users", () => {
    it("lists only tenant A members", async () => {
      const res = await adminAAgent.get("/api/v1/users")
      expect(res.status).toBe(200)
      const emails = res.body.data.items.map((u: { email: string }) => u.email)
      expect(emails).toContain("admin.a@example.com")
      expect(emails).toContain("plat.super@example.com")
      expect(emails).not.toContain("admin.b@example.com")
    })

    it("creates a user in tenant A with a role", async () => {
      const res = await adminAAgent.post("/api/v1/users").send({
        name: "New A User",
        email: "new.a@example.com",
        password: "password-123456",
        roleId: teacherRoleId,
      })
      expect(res.status).toBe(201)
      expect(res.body.data.role.name).toBe("TEACHER")
      expect(res.body.data.membershipStatus).toBe("ACTIVE")
    })

    it("the created user can sign in (login still works)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "new.a@example.com", password: "password-123456" })
      expect(res.status).toBe(200)
    })

    it("creates an account for an existing global user (re-grant)", async () => {
      const res = await adminAAgent.post("/api/v1/users").send({
        name: "New A User",
        email: "new.a@example.com",
        roleId: accountantRoleId,
      })
      expect(res.status).toBe(201)
      expect(res.body.data.role.name).toBe("ACCOUNTANT")
    })

    it("updates a user's role in tenant A", async () => {
      const members = await prisma.tenantMembership.findFirst({
        where: { schoolId: schoolA.id, user: { email: "new.a@example.com" } },
      })
      const res = await adminAAgent
        .patch(`/api/v1/users/${members!.userId}`)
        .send({ roleId: teacherRoleId })
      expect(res.status).toBe(200)
      expect(res.body.data.role.name).toBe("TEACHER")
    })

    it("deactivates and reactivates a membership in tenant A", async () => {
      const members = await prisma.tenantMembership.findFirst({
        where: { schoolId: schoolA.id, user: { email: "new.a@example.com" } },
      })
      const res = await adminAAgent.patch(`/api/v1/users/${members!.userId}`).send({ status: "INACTIVE" })
      expect(res.status).toBe(200)
      expect(res.body.data.membershipStatus).toBe("INACTIVE")

      const reactivate = await adminAAgent.patch(`/api/v1/users/${members!.userId}`).send({ status: "ACTIVE" })
      expect(reactivate.status).toBe(200)
      expect(reactivate.body.data.membershipStatus).toBe("ACTIVE")
    })

    it("filters the membership list by role", async () => {
      const res = await adminAAgent.get(`/api/v1/users?roleId=${teacherRoleId}`)
      expect(res.status).toBe(200)
      for (const item of res.body.data.items) {
        expect(item.role.id).toBe(teacherRoleId)
      }
    })
  })

  describe("user management mutations are audited", () => {
    it("records a CREATE + USER row attributed to the acting admin", async () => {
      const row = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, action: "CREATE", entityType: "USER" },
        orderBy: { createdAt: "desc" },
      })
      expect(row).not.toBeNull()
      expect(row!.actorId).toBe(adminAUserId)
      expect(row!.actorRole).toBe("SCHOOL_ADMIN")
      expect(row!.summary).toContain("New A User")
      const metadata = row!.metadata as { roleName?: string }
      expect(metadata.roleName).toBeTruthy()
    })

    it("records MEMBER_ROLE_CHANGE on TENANT_MEMBERSHIP with a diff", async () => {
      const rows = await prisma.auditLog.findMany({
        where: { schoolId: schoolA.id, action: "MEMBER_ROLE_CHANGE", entityType: "TENANT_MEMBERSHIP" },
        orderBy: { createdAt: "desc" },
      })
      expect(rows.length).toBeGreaterThan(0)
      const row = rows[0]
      expect(row!.actorId).toBe(adminAUserId)
      const diff = row!.diff as { fields: { field: string; before?: string; after?: string }[] }
      const roleDiff = diff.fields.find((field) => field.field === "roleId")
      expect(roleDiff).toBeDefined()
      expect(roleDiff!.after).toBe(teacherRoleId)
    })

    it("records MEMBER_STATUS_CHANGE when a membership is deactivated", async () => {
      const rows = await prisma.auditLog.findMany({
        where: { schoolId: schoolA.id, action: "MEMBER_STATUS_CHANGE", entityType: "TENANT_MEMBERSHIP" },
        orderBy: { createdAt: "desc" },
      })
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row!.actorId).toBe(adminAUserId)
      }
      const deactivated = rows.find((row) => {
        const diff = row.diff as { fields: { field: string; after?: string }[] }
        return diff.fields.find((field) => field.field === "status")?.after === "INACTIVE"
      })
      expect(deactivated).toBeDefined()
    })

    it("does not audit actions that were rejected before any write", async () => {
      const sneaky = await prisma.auditLog.findFirst({
        where: { schoolId: schoolA.id, summary: { contains: "Wannabe Super" } },
      })
      expect(sneaky).toBeNull()
    })
  })

  describe("cross-tenant isolation", () => {
    it("tenant A admin cannot view tenant B users in the list", async () => {
      const res = await adminAAgent.get("/api/v1/users?search=admin.b%40example.com")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)
    })

    it("tenant A admin cannot read tenant B user by direct ID (404)", async () => {
      const res = await adminAAgent.get(`/api/v1/users/${adminBUserId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("tenant A admin cannot place a user into tenant B via the body (400)", async () => {
      const res = await adminAAgent.post("/api/v1/users").send({
        name: "Sneaky",
        email: "sneaky@example.com",
        password: "password-123456",
        roleId: teacherRoleId,
        schoolId: schoolB.id,
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("tenant A admin cannot update a tenant B user (404)", async () => {
      const res = await adminAAgent
        .patch(`/api/v1/users/${adminBUserId}`)
        .send({ roleId: teacherRoleId })
      expect(res.status).toBe(404)
    })

    it("tenant A admin cannot remove a tenant B user (404)", async () => {
      const res = await adminAAgent.delete(`/api/v1/users/${adminBUserId}`)
      expect(res.status).toBe(404)
    })
  })

  describe("same global user, different roles per tenant", () => {
    it("lets a user hold TEACHER in A and ACCOUNTANT in B simultaneously", async () => {
      // Create a global user and add them to both tenants with different roles.
      const user = await prisma.user.create({
        data: {
          email: "multi.role@example.com",
          name: "Multi Role",
          passwordHash: hashPassword("password-123456"),
          status: "ACTIVE",
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId: schoolA.id, roleId: teacherRoleId, status: "ACTIVE" },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId: schoolB.id, roleId: accountantRoleId, status: "ACTIVE" },
      })

      const inA = await adminAAgent.get(`/api/v1/users/${user.id}`)
      expect(inA.status).toBe(200)
      expect(inA.body.data.role.name).toBe("TEACHER")

      const inB = await adminBAgent.get(`/api/v1/users/${user.id}`)
      expect(inB.status).toBe(200)
      expect(inB.body.data.role.name).toBe("ACCOUNTANT")
    })
  })

  describe("platform super admin behavior", () => {
    it("platform super admin can manage users within a tenant", async () => {
      const res = await platSupAgent.get("/api/v1/users")
      expect(res.status).toBe(200)
    })

    it("no one can assign the SUPER_ADMIN role to a tenant user (403)", async () => {
      const res = await adminAAgent.post("/api/v1/users").send({
        name: "Wannabe Super",
        email: "wannabe.super@example.com",
        password: "password-123456",
        roleId: superRoleId,
      })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("a tenant admin cannot manage a platform super admin's membership (403)", async () => {
      const res = await adminAAgent
        .patch(`/api/v1/users/${platSupUserId}`)
        .send({ status: "INACTIVE" })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("a tenant admin cannot remove a platform super admin (403)", async () => {
      const res = await adminAAgent.delete(`/api/v1/users/${platSupUserId}`)
      expect(res.status).toBe(403)
    })
  })

  describe("self-management safeguards", () => {
    it("a tenant admin cannot deactivate their own membership", async () => {
      const res = await adminAAgent
        .patch(`/api/v1/users/${adminAUserId}`)
        .send({ status: "INACTIVE" })
      expect(res.status).toBe(400)
    })

    it("a tenant admin cannot remove their own membership", async () => {
      const res = await adminAAgent.delete(`/api/v1/users/${adminAUserId}`)
      expect(res.status).toBe(400)
    })

    it("logout still revokes the session", async () => {
      const session = await adminAAgent.post("/api/v1/auth/logout")
      expect(session.status).toBe(200)
      const me = await adminAAgent.get("/api/v1/auth/me")
      expect(me.status).toBe(401)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.studentGuardian.deleteMany()
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

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}
