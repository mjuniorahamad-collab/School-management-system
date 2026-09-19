import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"

// Tenant branding projection suite. Verifies the chrome's `GET /branding` read
// is available to ANY authenticated user of the school — including portal-only
// roles that lack `settings:view` — always resolves the canonical editable
// SchoolSetting.schoolName (falling back to School.name), stays tenant-isolated,
// and never loosens the `settings:view` permission model. DB-gated like the
// other integration suites; requires TEST_DATABASE_URL.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

describe.skipIf(!TEST_DATABASE_URL)("Tenant branding projection (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  const parentAAgent = request.agent(app) // school A, portal:view only
  const adminAAgent = request.agent(app) // school A, settings:view
  const parentBAgent = request.agent(app) // school B, portal:view only

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

    const portalPerm = await prisma.permission.create({
      data: { code: "portal:view", resource: "portal", action: "view" },
    })
    const settingsPerm = await prisma.permission.create({
      data: { code: "settings:view", resource: "settings", action: "view" },
    })

    const parentRole = await prisma.role.create({
      data: {
        name: "PARENT",
        description: "Test parent",
        rolePermissions: { create: { permissionId: portalPerm.id } },
      },
    })
    const adminRole = await prisma.role.create({
      data: {
        name: "SCHOOL_ADMIN",
        description: "Test admin",
        rolePermissions: { create: { permissionId: settingsPerm.id } },
      },
    })

    const schoolANew = await prisma.school.create({ data: { name: "Branding School A" } })
    schoolA.id = schoolANew.id
    const schoolBNew = await prisma.school.create({ data: { name: "Branding School B" } })
    schoolB.id = schoolBNew.id

    // School A has an editable (canonical) school name; school B leaves it empty
    // so the School.name fallback path is exercised.
    await prisma.schoolSetting.create({
      data: { schoolId: schoolA.id, key: "schoolName", value: "Portal School A Editable" },
    })
    await prisma.schoolSetting.create({
      data: { schoolId: schoolA.id, key: "tagline", value: "Learn. Grow. Shine." },
    })

    async function makeUser(name: string, email: string, roleId: string, schoolId: string): Promise<void> {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: hashPassword("branding-test-secret-123"),
          status: "ACTIVE",
          roles: { create: [{ role: { connect: { id: roleId } } }] },
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
      })
    }

    await makeUser("Parent A", "branding.parent.a@example.com", parentRole.id, schoolA.id)
    await makeUser("Admin A", "branding.admin.a@example.com", adminRole.id, schoolA.id)
    await makeUser("Parent B", "branding.parent.b@example.com", parentRole.id, schoolB.id)

    await login(parentAAgent, "branding.parent.a@example.com", "branding-test-secret-123")
    await login(adminAAgent, "branding.admin.a@example.com", "branding-test-secret-123")
    await login(parentBAgent, "branding.parent.b@example.com", "branding-test-secret-123")
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/branding")
    expect(res.status).toBe(401)
  })

  it("resolves the canonical editable schoolName for a portal-only user (no settings:view)", async () => {
    const res = await parentAAgent.get("/api/v1/branding")
    expect(res.status).toBe(200)
    expect(res.body.data.schoolName).toBe("Portal School A Editable")
    expect(res.body.data.tagline).toBe("Learn. Grow. Shine.")
  })

  it("an admin with settings:view gets the same branding projection", async () => {
    const res = await adminAAgent.get("/api/v1/branding")
    expect(res.status).toBe(200)
    expect(res.body.data.schoolName).toBe("Portal School A Editable")
  })

  it("falls back to School.name when the editable schoolName is empty", async () => {
    const res = await parentBAgent.get("/api/v1/branding")
    expect(res.status).toBe(200)
    expect(res.body.data.schoolName).toBe("Branding School B")
    expect(res.body.data.tagline).toBeNull()
  })

  it("never leaks another tenant's branding", async () => {
    const resA = await parentAAgent.get("/api/v1/branding")
    const resB = await parentBAgent.get("/api/v1/branding")
    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)
    expect(resA.body.data.schoolName).toBe("Portal School A Editable")
    expect(resB.body.data.schoolName).not.toBe(resA.body.data.schoolName)
  })

  it("a portal-only user still cannot read the full settings payload", async () => {
    const res = await parentAAgent.get("/api/v1/settings")
    expect(res.status).toBe(403)
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.schoolSetting.deleteMany()
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