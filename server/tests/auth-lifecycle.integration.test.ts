import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../src/auth/cookies.js"
import { hashPassword } from "../src/auth/password.js"
import { hashToken } from "../src/auth/tokens.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"
import { createApp } from "../src/app.js"

// Session lifecycle, cookie attributes, and token-revocation semantics.
//
// Verifies:
//   - login issues httpOnly SameSite=Lax session cookies (never Secure in test)
//     and stores only sha256 hashes in the database
//   - /me returns the authenticated user; unauthenticated /me is 401
//   - refresh ROTATES: the old refresh token is revoked and rejected on reuse
//     while the rotated pair keeps working
//   - an expired access token is rejected (401)
//   - logout revokes the session and clears the cookie jar
//   - bad/unknown credentials produce ONE generic error plus a FAILED_LOGIN
//     audit row (no account enumeration); non-ACTIVE accounts get ACCOUNT_DISABLED
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

describe.skipIf(!TEST_DATABASE_URL)("Auth lifecycle (integration)", () => {
  let prisma: PrismaClient

  const fixtures = { schoolId: "" }
  const admin = { email: "lifecycle.admin@example.com", password: "lifecycle-secret-1" }
  const pending = { email: "lifecycle.pending@example.com", password: "lifecycle-secret-2" }

  const sharedAgent = request.agent(app)

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

    const school = await prisma.school.create({ data: { name: "Auth Lifecycle School" } })
    fixtures.schoolId = school.id

    const superRole = await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Lifecycle admin role" } })

    const adminUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Lifecycle Admin",
        email: admin.email,
        passwordHash: hashPassword(admin.password),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: adminUser.id, schoolId: school.id, roleId: superRole.id, status: "ACTIVE" },
    })

    const pendingUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Lifecycle Pending",
        email: pending.email,
        passwordHash: hashPassword(pending.password),
        status: "SUSPENDED",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: pendingUser.id, schoolId: school.id, roleId: superRole.id, status: "ACTIVE" },
    })
  })

  afterAll(async () => {
    if (prisma) {
      await resetAllTables(prisma)
      await prisma.$disconnect()
    }
  })

  function cookieHeader(
    headers: { [key: string]: string | string[] | undefined },
    name: string,
  ): string {
    const all = (headers["set-cookie"] as string[]) ?? []
    const found = all.find((h) => h.startsWith(`${name}=`))
    if (!found) throw new Error(`Expected Set-Cookie for ${name}`)
    return found
  }

  function rawValue(header: string): string {
    const match = /^[^=]+=([^;]+)/.exec(header)
    if (!match) throw new Error("Could not extract raw cookie value")
    return match[1]
  }

  it("login issues httpOnly SameSite=Lax session cookies (Secure only in production)", async () => {
    const res = await sharedAgent
      .post("/api/v1/auth/login")
      .send({ email: admin.email, password: admin.password })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.user.email).toBe(admin.email)

    for (const header of [
      cookieHeader(res.headers, ACCESS_COOKIE),
      cookieHeader(res.headers, REFRESH_COOKIE),
    ]) {
      expect(header.toLowerCase()).toContain("httponly")
      expect(header.toLowerCase()).toContain("samesite=lax")
      expect(header.toLowerCase()).toContain("path=/")
      expect(header.toLowerCase()).not.toMatch(/\bsecure/i)
      const maxAge = /max-age=(\d+)/i.exec(header)?.[1]
      expect(maxAge).toBeTruthy()
      expect(Number(maxAge)).toBeGreaterThan(0)
    }
  })

  it("stores only sha256 token hashes — never raw tokens", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: admin.email, password: admin.password })
    expect(login.status).toBe(200)

    const accessRaw = rawValue(cookieHeader(login.headers, ACCESS_COOKIE))
    const refreshRaw = rawValue(cookieHeader(login.headers, REFRESH_COOKIE))

    const session = await prisma.session.findFirst({
      where: { accessTokenHash: hashToken(accessRaw) },
    })
    expect(session).toBeTruthy()
    expect(session?.refreshTokenHash).toBe(hashToken(refreshRaw))
    expect(session?.accessTokenHash).not.toContain(accessRaw)
    expect(session?.refreshTokenHash).not.toContain(refreshRaw)
    expect(session?.revokedAt).toBeNull()
  })

  it("me returns the authenticated user; an unauthenticated call is 401", async () => {
    const res = await sharedAgent.get("/api/v1/auth/me")
    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe(admin.email)
    expect(res.body.data.user.roles).toContain(SUPER_ADMIN_ROLE)

    const anon = await request(app).get("/api/v1/auth/me")
    expect(anon.status).toBe(401)
    expect(anon.body.error.code).toBe("UNAUTHORIZED")
  })

  it("refresh rotates the pair and rejects reuse of the old refresh token", async () => {
    const agent = request.agent(app)
    const login = await agent.post("/api/v1/auth/login").send({ email: admin.email, password: admin.password })
    expect(login.status).toBe(200)
    const oldRefresh = rawValue(cookieHeader(login.headers, REFRESH_COOKIE))

    const rotation = await agent.post("/api/v1/auth/refresh")
    expect(rotation.status).toBe(200)
    expect(rotation.body.data.refreshed).toBe(true)

    const newRefresh = rawValue(cookieHeader(rotation.headers, REFRESH_COOKIE))
    expect(newRefresh).not.toBe(oldRefresh)

    // The rotated pair keeps working.
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200)

    // The old refresh token was revoked: direct reuse is rejected.
    const reuse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${oldRefresh}`)
    expect(reuse.status).toBe(401)
    expect(reuse.body.error.code).toBe("UNAUTHORIZED")

    // And the database confirms the old row is revoked.
    const oldRow = await prisma.session.findUnique({ where: { refreshTokenHash: hashToken(oldRefresh) } })
    expect(oldRow?.revokedAt).not.toBeNull()
  })

  it("rejects an expired access token even while the session exists", async () => {
    const agent = request.agent(app)
    const login = await agent.post("/api/v1/auth/login").send({ email: admin.email, password: admin.password })
    expect(login.status).toBe(200)
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200)

    const accessRaw = rawValue(cookieHeader(login.headers, ACCESS_COOKIE))
    await prisma.session.updateMany({
      where: { accessTokenHash: hashToken(accessRaw) },
      data: { accessExpiresAt: new Date(Date.now() - 1000) },
    })

    const expired = await agent.get("/api/v1/auth/me")
    expect(expired.status).toBe(401)
    expect(expired.body.error.code).toBe("UNAUTHORIZED")
  })

  it("logout revokes the session and clears both cookies", async () => {
    const agent = request.agent(app)
    await agent.post("/api/v1/auth/login").send({ email: admin.email, password: admin.password })
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200)

    const logout = await agent.post("/api/v1/auth/logout")
    expect(logout.status).toBe(200)
    const cleared = (logout.headers["set-cookie"] as string[]) ?? []
    expect(cleared.some((h) => h.startsWith(`${ACCESS_COOKIE}=`))).toBe(true)
    expect(cleared.some((h) => h.startsWith(`${REFRESH_COOKIE}=`))).toBe(true)

    expect((await agent.get("/api/v1/auth/me")).status).toBe(401)

    const session = await prisma.session.findFirst({
      where: { revokedAt: { not: null } },
      orderBy: { revokedAt: "desc" },
    })
    expect(session).toBeTruthy()
  })

  it("bad and unknown credentials both return the same generic error", async () => {
    const wrongPassword = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: admin.email, password: "definitely-not-the-password" })
    expect(wrongPassword.status).toBe(401)
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS")
    expect(wrongPassword.body.error.message).toBe("Invalid email or password")

    const unknownEmail = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "definitely-not-the-password" })
    expect(unknownEmail.status).toBe(401)
    expect(unknownEmail.body.error.code).toBe("INVALID_CREDENTIALS")
    expect(unknownEmail.body.error.message).toBe("Invalid email or password")
  })

  it("records a FAILED_LOGIN audit row for the attempted identity", async () => {
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: admin.email, password: "definitely-not-the-password" })

    const audit = await prisma.auditLog.findFirst({
      where: { action: "FAILED_LOGIN", actorEmail: admin.email },
    })
    expect(audit).toBeTruthy()
    expect(audit?.entityType).toBe("AUTH")
  })

  it("rejects a non-ACTIVE account with ACCOUNT_DISABLED", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: pending.email, password: pending.password })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED")
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
  await prisma.user.deleteMany()
  await prisma.rolePermission.deleteMany()
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
  await prisma.school.deleteMany()
}