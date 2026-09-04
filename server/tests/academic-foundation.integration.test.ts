import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

// Integration tests require a real PostgreSQL database. The pool is configured
// via TEST_DATABASE_URL (see .env.example); when it is unset the whole suite is
// skipped so `npm test` stays green without a database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

interface Fixtures {
  schoolId: string
  activeSessionId: string
  activeSessionName: string
  activeSessionCode: string
  fixtureClassId: string
  fixtureClassName: string
}

const fixtures: Fixtures = {
  schoolId: "",
  activeSessionId: "",
  activeSessionName: "Active Session",
  activeSessionCode: "FIXTURE-ACTIVE",
  fixtureClassId: "",
  fixtureClassName: "Fixture Class",
}

describe.skipIf(!TEST_DATABASE_URL)("Academic Foundation API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const teacherAgent = request.agent(app)

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

    const school = await prisma.school.create({ data: { name: "Academic Foundation School" } })
    fixtures.schoolId = school.id

    const active = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: fixtures.activeSessionName,
        code: fixtures.activeSessionCode,
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.activeSessionId = active.id

    const cls = await prisma.class.create({
      data: { schoolId: school.id, name: fixtures.fixtureClassName, sortOrder: 0 },
    })
    fixtures.fixtureClassId = cls.id

    await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })

    await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Academic Admin",
        email: "academic.admin@example.com",
        passwordHash: hashPassword("admin-secret-123"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Academic Teacher",
        email: "academic.teacher@example.com",
        passwordHash: hashPassword("teacher-secret-123"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: teacherRole.id } } }] },
      },
    })

    await login(adminAgent, "academic.admin@example.com", "admin-secret-123")
    await login(teacherAgent, "academic.teacher@example.com", "teacher-secret-123")
  })

  afterEach(async () => {
    // Clean up records created during tests (order respects foreign keys).
    await prisma.section.deleteMany({ where: { classId: { not: fixtures.fixtureClassId } } })
    await prisma.class.deleteMany({ where: { id: { not: fixtures.fixtureClassId } } })
    await prisma.academicSession.deleteMany({
      where: { id: { not: fixtures.activeSessionId } },
    })
    await prisma.subject.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  describe("sessions", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/academic-sessions")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("denies a role without the academic-sessions:view permission", async () => {
      const res = await teacherAgent.get("/api/v1/academic-sessions")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("lists sessions in start-date order", async () => {
      const res = await adminAgent.get("/api/v1/academic-sessions")
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items.some((s: { code: string }) => s.code === fixtures.activeSessionCode)).toBe(true)
    })

    it("creates a session defaulting to UPCOMING", async () => {
      const res = await adminAgent.post("/api/v1/academic-sessions").send(sessionPayload("UP"))
      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe("UPCOMING")
      expect(res.body.data.startDate).toBe("2026-04-01")
    })

    it("rejects a second ACTIVE session while one is already active", async () => {
      const res = await adminAgent
        .post("/api/v1/academic-sessions")
        .send({ ...sessionPayload("SECOND"), status: "ACTIVE" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("validates the payload before writing", async () => {
      const res = await adminAgent
        .post("/api/v1/academic-sessions")
        .send({ name: "", code: "", startDate: "not-a-date", endDate: "2026-01-01" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("rejects a duplicate session code", async () => {
      const res = await adminAgent
        .post("/api/v1/academic-sessions")
        .send(sessionPayload("", fixtures.activeSessionCode))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("updates a session opened to ACTIVE after the existing one is closed", async () => {
      const created = await adminAgent
        .post("/api/v1/academic-sessions")
        .send({ ...sessionPayload("OPEN"), status: "CLOSED" })
      const id = created.body.data.id

      await adminAgent.patch(`/api/v1/academic-sessions/${fixtures.activeSessionId}`).send({ status: "CLOSED" })
      const res = await adminAgent.patch(`/api/v1/academic-sessions/${id}`).send({ status: "ACTIVE" })
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("ACTIVE")
    })

    it("returns NOT_FOUND for an unknown session", async () => {
      const res = await adminAgent.get("/api/v1/academic-sessions/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("classes", () => {
    it("requires the classes:view permission", async () => {
      const res = await teacherAgent.get("/api/v1/classes")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("creates a class with a sort order", async () => {
      const res = await adminAgent.post("/api/v1/classes").send({ name: "6", sortOrder: 3 })
      expect(res.status).toBe(201)
      expect(res.body.data.name).toBe("6")
      expect(res.body.data.sortOrder).toBe(3)
    })

    it("rejects a duplicate class name", async () => {
      await adminAgent.post("/api/v1/classes").send({ name: "7" })
      const res = await adminAgent.post("/api/v1/classes").send({ name: "7" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("validates the payload", async () => {
      const res = await adminAgent.post("/api/v1/classes").send({ name: "  " })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("lists classes with section/student counts", async () => {
      const res = await adminAgent.get("/api/v1/classes")
      expect(res.status).toBe(200)
      expect(res.body.data.items.some((c: { name: string }) => c.name === fixtures.fixtureClassName)).toBe(true)
      expect(typeof res.body.data.items[0].sectionCount).toBe("number")
    })

    it("returns NOT_FOUND for an unknown class", async () => {
      const res = await adminAgent.get("/api/v1/classes/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
    })
  })

  describe("sections", () => {
    it("requires the sections:view permission", async () => {
      const res = await teacherAgent.get("/api/v1/sections")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("creates a section under an existing class", async () => {
      const res = await adminAgent
        .post("/api/v1/sections")
        .send({ classId: fixtures.fixtureClassId, name: "A" })
      expect(res.status).toBe(201)
      expect(res.body.data.className).toBe(fixtures.fixtureClassName)
      expect(res.body.data.name).toBe("A")
    })

    it("rejects a section whose class does not exist", async () => {
      const res = await adminAgent
        .post("/api/v1/sections")
        .send({ classId: "ffffffff-ffff-ffff-ffff-ffffffffffff", name: "B" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects a duplicate section name within the same class", async () => {
      await adminAgent.post("/api/v1/sections").send({ classId: fixtures.fixtureClassId, name: "C" })
      const res = await adminAgent
        .post("/api/v1/sections")
        .send({ classId: fixtures.fixtureClassId, name: "C" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("filters sections by class", async () => {
      await adminAgent.post("/api/v1/sections").send({ classId: fixtures.fixtureClassId, name: "D" })
      const res = await adminAgent.get(
        `/api/v1/sections?classId=${fixtures.fixtureClassId}`,
      )
      expect(res.status).toBe(200)
      const names = res.body.data.items.map((s: { name: string }) => s.name)
      expect(names).toContain("D")
      expect(typeof res.body.data.items[0].className).toBe("string")
    })

    it("returns NOT_FOUND for an unknown section", async () => {
      const res = await adminAgent.get("/api/v1/sections/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
    })
  })

  describe("subjects", () => {
    it("requires the subjects:view permission", async () => {
      const res = await teacherAgent.get("/api/v1/subjects")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("creates a subject, normalizing the code to uppercase", async () => {
      const res = await adminAgent.post("/api/v1/subjects").send({ code: "  mat ", name: "Mathematics", sortOrder: 1 })
      expect(res.status).toBe(201)
      expect(res.body.data.code).toBe("MAT")
      expect(res.body.data.name).toBe("Mathematics")
    })

    it("rejects a duplicate subject code", async () => {
      const res = await adminAgent.post("/api/v1/subjects").send({ code: "ENG", name: "English" })
      expect(res.status).toBe(201)
      const dup = await adminAgent.post("/api/v1/subjects").send({ code: " eng ", name: "English Two" })
      expect(dup.status).toBe(400)
      expect(dup.body.error.code).toBe("BAD_REQUEST")
    })

    it("validates the payload", async () => {
      const res = await adminAgent.post("/api/v1/subjects").send({ code: "", name: "" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("lists subjects in sort-order order", async () => {
      await adminAgent.post("/api/v1/subjects").send({ code: "SCI", name: "Science", sortOrder: 0 })
      await adminAgent.post("/api/v1/subjects").send({ code: "HIN", name: "Hindi", sortOrder: 5 })
      const res = await adminAgent.get("/api/v1/subjects")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(2)
      expect(res.body.data.items[0].code).toBe("SCI")
    })

    it("returns NOT_FOUND for an unknown subject", async () => {
      const res = await adminAgent.get("/api/v1/subjects/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.subject.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.studentEnrollment.deleteMany()
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

function sessionPayload(prefix: string, code?: string): Record<string, string> {
  const token = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  return {
    name: `Session ${token}`,
    code: code ?? `S-${token}`,
    startDate: "2026-04-01",
    endDate: "2027-03-31",
  }
}
