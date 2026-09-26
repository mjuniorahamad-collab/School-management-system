import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { CONCESSION_SELF_APPROVAL_SETTING_KEY } from "../src/lib/school-settings.js"
import { updateSettings } from "../src/modules/settings/setting.service.js"

// School settings suite, focused on the tenant-scoped concession self-approval
// policy (`feeConcessionSelfApproval`) because it is the one setting that
// authorizes a business action server-side. Verifies the fail-safe default for a
// school that never saved it, the round trip, the `settings:view` /
// `settings:update` permission split, rejection of out-of-contract values on write,
// coercion of a corrupt stored row on read, tenant isolation, and the SETTING_CHANGE
// audit row that records the policy's before/after value.
// DB-gated like the other integration suites; requires TEST_DATABASE_URL.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()
const PASSWORD = "settings-test-secret-123"

describe.skipIf(!TEST_DATABASE_URL)("School settings & concession self-approval policy (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  const adminAAgent = request.agent(app) // school A, settings:view + settings:update
  const accountantAAgent = request.agent(app) // school A, settings:view only
  const teacherAAgent = request.agent(app) // school A, concessions:view only, no settings:*
  const adminBAgent = request.agent(app) // school B, settings:view + settings:update

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")

    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "server/prisma/schema.prisma"],
      { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "pipe" },
    )

    prisma = new PrismaClient()
    await resetAllTables(prisma)

    const viewPerm = await prisma.permission.create({
      data: { code: "settings:view", resource: "settings", action: "view" },
    })
    const updatePerm = await prisma.permission.create({
      data: { code: "settings:update", resource: "settings", action: "update" },
    })
    const concessionsViewPerm = await prisma.permission.create({
      data: { code: "concessions:view", resource: "concessions", action: "view" },
    })

    const adminRole = await prisma.role.create({
      data: {
        name: "SCHOOL_ADMIN",
        description: "Test admin",
        rolePermissions: {
          create: [
            { permissionId: viewPerm.id },
            { permissionId: updatePerm.id },
            { permissionId: concessionsViewPerm.id },
          ],
        },
      },
    })
    const accountantRole = await prisma.role.create({
      data: {
        name: "ACCOUNTANT",
        description: "Test accountant",
        rolePermissions: { create: [{ permissionId: viewPerm.id }, { permissionId: concessionsViewPerm.id }] },
      },
    })
    // Deliberately holds no settings:* permission, to assert the read guard.
    const teacherRole = await prisma.role.create({
      data: {
        name: "TEACHER",
        description: "Test teacher",
        rolePermissions: { create: [{ permissionId: concessionsViewPerm.id }] },
      },
    })

    const createdA = await prisma.school.create({ data: { name: "Settings School A" } })
    schoolA.id = createdA.id
    const createdB = await prisma.school.create({ data: { name: "Settings School B" } })
    schoolB.id = createdB.id

    async function makeUser(name: string, email: string, roleId: string, schoolId: string): Promise<void> {
      const user = await prisma.user.create({
        data: { name, email, passwordHash: hashPassword(PASSWORD), status: "ACTIVE" },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
      })
    }

    await makeUser("Admin A", "settings.admin.a@example.com", adminRole.id, schoolA.id)
    await makeUser("Accountant A", "settings.accountant.a@example.com", accountantRole.id, schoolA.id)
    await makeUser("Teacher A", "settings.teacher.a@example.com", teacherRole.id, schoolA.id)
    await makeUser("Admin B", "settings.admin.b@example.com", adminRole.id, schoolB.id)

    await login(adminAAgent, "settings.admin.a@example.com")
    await login(accountantAAgent, "settings.accountant.a@example.com")
    await login(teacherAAgent, "settings.teacher.a@example.com")
    await login(adminBAgent, "settings.admin.b@example.com")
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  it("requires authentication", async () => {
    expect((await request(app).get("/api/v1/settings")).status).toBe(401)
    const write = await request(app).put("/api/v1/settings").send({ feeCurrency: "EUR" })
    expect(write.status).toBe(401)
  })

  it("returns the safe default when the school never saved the policy", async () => {
    const res = await adminAAgent.get("/api/v1/settings")
    expect(res.status).toBe(200)
    // No row exists: the read must still hand the client a contract-valid value
    // that matches the server's policy decision, not `undefined`.
    expect(res.body.data.settings.feeConcessionSelfApproval).toBe("INDEPENDENT_APPROVAL_REQUIRED")

    const rows = await prisma.schoolSetting.findMany({
      where: { schoolId: schoolA.id, key: CONCESSION_SELF_APPROVAL_SETTING_KEY },
    })
    expect(rows).toHaveLength(0)
  })

  it("denies the settings read without settings:view", async () => {
    const denied = await teacherAAgent.get("/api/v1/settings")
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe("FORBIDDEN")
  })

  it("exposes the policy to a concessions viewer without a settings permission of its own", async () => {
    // The accountant does hold settings:view, so the policy is asserted through
    // the concessions seam instead: an actor who can only list concessions must
    // still learn which policy the school runs under, because the UI needs it to
    // decide whether to offer a self-approval action.
    const list = await accountantAAgent.get("/api/v1/fees/adjustments")
    expect(list.status).toBe(200)
    expect(list.body.data.approvalPolicy).toBe("INDEPENDENT_APPROVAL_REQUIRED")
  })

  it("denies the policy write without settings:update", async () => {
    const res = await accountantAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "SELF_APPROVAL_ALLOWED" })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("FORBIDDEN")

    const rows = await prisma.schoolSetting.findMany({
      where: { schoolId: schoolA.id, key: CONCESSION_SELF_APPROVAL_SETTING_KEY },
    })
    expect(rows).toHaveLength(0)
  })

  it("round-trips a policy change and exposes it to the concessions seam", async () => {
    const saved = await adminAAgent
      .put("/api/v1/settings")
      .send({ feeConcessionSelfApproval: "SELF_APPROVAL_ALLOWED" })
    expect(saved.status).toBe(200)
    expect(saved.body.data.settings.feeConcessionSelfApproval).toBe("SELF_APPROVAL_ALLOWED")

    const reread = await adminAAgent.get("/api/v1/settings")
    expect(reread.body.data.settings.feeConcessionSelfApproval).toBe("SELF_APPROVAL_ALLOWED")

    // A role that can only view concessions learns the policy from the list
    // response rather than from a permission-gated settings read.
    const list = await accountantAAgent.get("/api/v1/fees/adjustments")
    expect(list.body.data.approvalPolicy).toBe("SELF_APPROVAL_ALLOWED")

    const row = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: schoolA.id, key: CONCESSION_SELF_APPROVAL_SETTING_KEY } },
    })
    expect(row?.value).toBe("SELF_APPROVAL_ALLOWED")

    await adminAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "INDEPENDENT_APPROVAL_REQUIRED" })
  })

  it("rejects an out-of-contract value on write", async () => {
    const res = await adminAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "BOTH_ALLOWED" })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe("VALIDATION_ERROR")

    const row = await prisma.schoolSetting.findUnique({
      where: { schoolId_key: { schoolId: schoolA.id, key: CONCESSION_SELF_APPROVAL_SETTING_KEY } },
    })
    expect(row?.value).toBe("INDEPENDENT_APPROVAL_REQUIRED")
  })

  it("coerces a corrupt stored value to the safe default on read", async () => {
    await prisma.schoolSetting.upsert({
      where: { schoolId_key: { schoolId: schoolA.id, key: CONCESSION_SELF_APPROVAL_SETTING_KEY } },
      update: { value: "yes please" },
      create: { schoolId: schoolA.id, key: CONCESSION_SELF_APPROVAL_SETTING_KEY, value: "yes please" },
    })

    const res = await adminAAgent.get("/api/v1/settings")
    expect(res.status).toBe(200)
    expect(res.body.data.settings.feeConcessionSelfApproval).toBe("INDEPENDENT_APPROVAL_REQUIRED")

    // ...and the concessions seam must agree, so the UI can never be looser than
    // the server.
    const list = await accountantAAgent.get("/api/v1/fees/adjustments")
    expect(list.body.data.approvalPolicy).toBe("INDEPENDENT_APPROVAL_REQUIRED")

    await prisma.schoolSetting.deleteMany({ where: { schoolId: schoolA.id, key: CONCESSION_SELF_APPROVAL_SETTING_KEY } })
  })

  it("records the policy's before/after value in the audit trail", async () => {
    // Earlier cases in this suite also saved the policy; start from a clean
    // trail so the before/after pairs below are unambiguous.
    await prisma.auditLog.deleteMany({ where: { schoolId: schoolA.id, entityType: "SCHOOL_SETTING" } })

    await adminAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "SELF_APPROVAL_ALLOWED" })
    await adminAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "INDEPENDENT_APPROVAL_REQUIRED" })

    const rows = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, entityType: "SCHOOL_SETTING", action: "SETTING_CHANGE" },
      orderBy: { createdAt: "asc" },
    })
    expect(rows).toHaveLength(2)

    const first = rows[0].metadata as { keys?: string[]; policyChange?: Record<string, string> }
    expect(first.keys).toEqual([CONCESSION_SELF_APPROVAL_SETTING_KEY])
    expect(first.policyChange).toEqual({
      key: CONCESSION_SELF_APPROVAL_SETTING_KEY,
      previousValue: "INDEPENDENT_APPROVAL_REQUIRED",
      newValue: "SELF_APPROVAL_ALLOWED",
    })

    const second = rows[1].metadata as { policyChange?: Record<string, string> }
    expect(second.policyChange).toEqual({
      key: CONCESSION_SELF_APPROVAL_SETTING_KEY,
      previousValue: "SELF_APPROVAL_ALLOWED",
      newValue: "INDEPENDENT_APPROVAL_REQUIRED",
    })
  })

  it("records only the policy's own newValue when saved alongside other settings", async () => {
    // Seed a known policy value and a clean trail so the assertions below are
    // about this call alone, independent of test order.
    await adminAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "INDEPENDENT_APPROVAL_REQUIRED" })
    await prisma.auditLog.deleteMany({ where: { schoolId: schoolA.id, entityType: "SCHOOL_SETTING" } })

    // Exercised through the service rather than the HTTP route on purpose. The
    // route's zod schema reorders a payload into the schema's own declaration
    // order, and the policy key is declared last, so an HTTP caller can never
    // actually place another entry after it. `updateSettings` is a public
    // exported function, though, and it must not depend on that accident of
    // declaration order: any caller that assembles the object with the policy
    // key first would otherwise record the LAST entry's value as the policy's
    // new value, misrepresenting a segregation-of-duties control in the trail.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "settings.admin.a@example.com" } })
    const res = await updateSettings(
      {
        feeConcessionSelfApproval: "SELF_APPROVAL_ALLOWED",
        feeCurrency: "INR",
        contactEmail: "office@example.com",
      },
      schoolA.id,
      {
        id: admin.id,
        school: { id: schoolA.id, name: "Settings School A" },
        name: "Admin A",
        email: admin.email,
        status: "ACTIVE",
        roles: ["SCHOOL_ADMIN"],
        permissions: ["settings:view", "settings:update", "concessions:view"],
        memberships: [{ schoolId: schoolA.id, roleName: "SCHOOL_ADMIN" }],
      },
    )
    expect(res.settings.feeConcessionSelfApproval).toBe("SELF_APPROVAL_ALLOWED")

    const rows = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, entityType: "SCHOOL_SETTING", action: "SETTING_CHANGE" },
      orderBy: { createdAt: "desc" },
    })
    expect(rows).toHaveLength(1)

    const metadata = rows[0].metadata as { keys?: string[]; policyChange?: Record<string, string> }
    // The payload's own order is preserved here, so this also documents that the
    // two trailing keys really did follow the policy key.
    expect(metadata.keys).toEqual([CONCESSION_SELF_APPROVAL_SETTING_KEY, "feeCurrency", "contactEmail"])
    // An exact match, so this pins newValue to the POLICY's stored form and not
    // the last entry's: before the fix these trailing keys left "INR"/the email
    // in the policy's newValue.
    expect(metadata.policyChange).toEqual({
      key: CONCESSION_SELF_APPROVAL_SETTING_KEY,
      previousValue: "INDEPENDENT_APPROVAL_REQUIRED",
      newValue: "SELF_APPROVAL_ALLOWED",
    })

    // Leave the policy as the neighbouring tests expect to find it.
    await adminAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "INDEPENDENT_APPROVAL_REQUIRED" })
  })

  it("records no values for other settings keys", async () => {
    await adminAAgent
      .put("/api/v1/settings")
      .send({ contactEmail: "office@example.com", feeCurrency: "INR" })

    const rows = await prisma.auditLog.findMany({
      where: { schoolId: schoolA.id, entityType: "SCHOOL_SETTING", action: "SETTING_CHANGE" },
      orderBy: { createdAt: "desc" },
    })
    const metadata = rows[0].metadata as Record<string, unknown>
    expect(metadata.keys).toEqual(["contactEmail", "feeCurrency"])
    // The before/after detail is scoped to the policy control only, so no other
    // setting's value ever enters the audit trail.
    expect(metadata.policyChange).toBeUndefined()
  })

  it("never leaks or applies one school's policy to another", async () => {
    await adminAAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "SELF_APPROVAL_ALLOWED" })

    const other = await adminBAgent.get("/api/v1/settings")
    expect(other.status).toBe(200)
    expect(other.body.data.settings.feeConcessionSelfApproval).toBe("INDEPENDENT_APPROVAL_REQUIRED")

    const otherList = await adminBAgent.get("/api/v1/fees/adjustments")
    expect(otherList.body.data.approvalPolicy).toBe("INDEPENDENT_APPROVAL_REQUIRED")

    const written = await adminBAgent.put("/api/v1/settings").send({ feeConcessionSelfApproval: "SELF_APPROVAL_ALLOWED" })
    expect(written.status).toBe(200)

    const stillAllowedA = await adminAAgent.get("/api/v1/settings")
    expect(stillAllowedA.body.data.settings.feeConcessionSelfApproval).toBe("SELF_APPROVAL_ALLOWED")
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.feeAdjustment.deleteMany()
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
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password: PASSWORD })
  expect(res.status).toBe(200)
}
