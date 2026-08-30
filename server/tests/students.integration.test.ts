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
  sessionId: string
  classSixId: string
  sectionSixAId: string
  adminUserId: string
  adminPassword: string
  teacherPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  sessionId: "",
  classSixId: "",
  sectionSixAId: "",
  adminUserId: "",
  adminPassword: "super-secret-123",
  teacherPassword: "teacher-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Students API (integration)", () => {
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

    // Minimal school + academic structure + actors. Roles carry no permission
    // records: SUPER_ADMIN bypasses checks by role, TEACHER proves the 403 path.
    const school = await prisma.school.create({ data: { name: "Integration School" } })
    fixtures.schoolId = school.id

    await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Academic Year 2026-2027",
        code: "AY2026-27",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Academic Year 2027-2028",
        code: "AY2027-28",
        startDate: new Date("2027-04-01T00:00:00.000Z"),
        endDate: new Date("2028-03-31T00:00:00.000Z"),
        status: "UPCOMING",
      },
    })

    const activeSession = await prisma.academicSession.findFirstOrThrow({
      where: { schoolId: school.id, status: "ACTIVE" },
    })
    fixtures.sessionId = activeSession.id

    for (const name of ["6", "7"]) {
      const cls = await prisma.class.create({
        data: { schoolId: school.id, name, sortOrder: Number(name) },
      })
      const section = await prisma.section.create({ data: { classId: cls.id, name: "A" } })
      if (name === "6") {
        fixtures.classSixId = cls.id
        fixtures.sectionSixAId = section.id
      }
    }

    await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })

    const admin = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Integration Admin",
        email: "integration.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    fixtures.adminUserId = admin.id

    await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Integration Teacher",
        email: "integration.teacher@example.com",
        passwordHash: hashPassword(fixtures.teacherPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: teacherRole.id } } }] },
      },
    })

    await login(adminAgent, "integration.admin@example.com", fixtures.adminPassword)
    await login(teacherAgent, "integration.teacher@example.com", fixtures.teacherPassword)
  })

  afterEach(async () => {
    // Students and guardians are test-scoped; the school/session/class/user
    // fixtures survive for reuse. Order respects foreign keys.
    await prisma.studentGuardian.deleteMany()
    await prisma.studentEnrollment.deleteMany()
    await prisma.student.deleteMany()
    await prisma.guardian.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  describe("index", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/students")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("returns an empty, correctly-paginated result before any students exist", async () => {
      const res = await adminAgent.get("/api/v1/students?pageSize=10")
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.pagination).toMatchObject({ page: 1, pageSize: 10, total: 0, totalPages: 0 })
    })

    it("rejects an unknown academic session filter", async () => {
      const res = await adminAgent.get(
        "/api/v1/students?sessionId=ffffffff-ffff-ffff-ffff-ffffffffffff",
      )
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("denies a role without the students:view permission", async () => {
      const res = await teacherAgent.get("/api/v1/students")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("meta", () => {
    it("returns sessions and classes with nested sections", async () => {
      const res = await adminAgent.get("/api/v1/students/meta")
      expect(res.status).toBe(200)
      const { academicSessions, classes } = res.body.data
      expect(academicSessions.some((s: { status: string }) => s.status === "ACTIVE")).toBe(true)
      expect(classes).toHaveLength(2)
      expect(classes[0].sections.map((s: { name: string }) => s.name)).toContain("A")
    })
  })

  describe("create", () => {
    it("creates a student with a server-generated admission number and default placement", async () => {
      const res = await adminAgent.post("/api/v1/students").send(createStudentPayload({}))
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.admissionNumber).toMatch(/^ADM-\d{4}-\d{4}$/)
      expect(data.status).toBe("ACTIVE")
      expect(data.enrollment.academicSession.id).toBe(fixtures.sessionId)
      expect(data.enrollment.class.name).toBe("6")
      expect(data.enrollment.section.name).toBe("A")
      expect(data.guardians).toHaveLength(1)
      expect(data.guardians[0].name).toBe("Ravi Kumar")
      expect(data.guardians[0].isPrimary).toBe(true)
    })

    it("validates the payload before writing", async () => {
      const res = await adminAgent
        .post("/api/v1/students")
        .send(createStudentPayload({ classId: undefined }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
      expect(res.body.error.details.issues.some((issue: { path: string }) => issue.path === "classId")).toBe(true)
    })

    it("rejects placement into a non-active session", async () => {
      const upcoming = await prisma.academicSession.findFirstOrThrow({
        where: { schoolId: fixtures.schoolId, status: "UPCOMING" },
      })
      const res = await adminAgent
        .post("/api/v1/students")
        .send(createStudentPayload({ academicSessionId: upcoming.id }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects more than one primary guardian", async () => {
      const payload = createStudentPayload({
        guardians: [
          { name: "Ravi Kumar", relationshipType: "PARENT", isPrimary: true, phone: "111" },
          { name: "Sunita Kumar", relationshipType: "MOTHER", isPrimary: true, phone: "222" },
        ],
      })
      const res = await adminAgent.post("/api/v1/students").send(payload)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })
  })

  describe("detail", () => {
    it("returns the full student record including guardians", async () => {
      const created = await createStudent(adminAgent)
      const res = await adminAgent.get(`/api/v1/students/${created.id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe(created.name)
      expect(res.body.data.admissionNumber).toBe(created.admissionNumber)
      expect(res.body.data.guardians[0]).toMatchObject({
        name: "Ravi Kumar",
        relationshipType: "PARENT",
        isPrimary: true,
      })
    })

    it("returns NOT_FOUND for an unknown student", async () => {
      const res = await adminAgent.get(
        "/api/v1/students/ffffffff-ffff-ffff-ffff-ffffffffffff",
      )
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("update", () => {
    it("changes placement only when both class and section are provided", async () => {
      const created = await createStudent(adminAgent)
      const cls7 = await prisma.class.findFirstOrThrow({
        where: { schoolId: fixtures.schoolId, name: "7" },
      })
      const sec7 = await prisma.section.findFirstOrThrow({ where: { classId: cls7.id } })

      const moved = await adminAgent
        .patch(`/api/v1/students/${created.id}`)
        .send({ classId: cls7.id, sectionId: sec7.id })
      expect(moved.status).toBe(200)
      expect(moved.body.data.enrollment.class.name).toBe("7")
      expect(moved.body.data.enrollment.section.name).toBe("A")
    })

    it("rejects a placement update that omits the section", async () => {
      const created = await createStudent(adminAgent)
      const cls7 = await prisma.class.findFirstOrThrow({
        where: { schoolId: fixtures.schoolId, name: "7" },
      })
      const res = await adminAgent
        .patch(`/api/v1/students/${created.id}`)
        .send({ classId: cls7.id })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("updates the status lifecycle without touching identity fields", async () => {
      const created = await createStudent(adminAgent)
      const res = await adminAgent
        .patch(`/api/v1/students/${created.id}`)
        .send({ status: "INACTIVE", city: "Dallas" })
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("INACTIVE")
      expect(res.body.data.city).toBe("Dallas")
      expect(res.body.data.admissionNumber).toBe(created.admissionNumber)
    })

    it("replaces the guardian list when provided", async () => {
      const created = await createStudent(adminAgent)
      const res = await adminAgent.patch(`/api/v1/students/${created.id}`).send({
        guardians: [
          { name: "Sunita Sharma", relationshipType: "MOTHER", isPrimary: true, phone: "222" },
        ],
      })
      expect(res.status).toBe(200)
      expect(res.body.data.guardians).toHaveLength(1)
      expect(res.body.data.guardians[0].name).toBe("Sunita Sharma")
      expect(res.body.data.guardians[0].relationshipType).toBe("MOTHER")
    })

    it("returns NOT_FOUND when updating an unknown student", async () => {
      const res = await adminAgent
        .patch("/api/v1/students/ffffffff-ffff-ffff-ffff-ffffffffffff")
        .send({ city: "Dallas" })
      expect(res.status).toBe(404)
    })
  })

  describe("export", () => {
    it("streams a BOM-prefixed CSV of the current students", async () => {
      const created = await createStudent(adminAgent)
      const res = await adminAgent.get("/api/v1/students/export")
      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("text/csv")
      expect(res.text.startsWith("\uFEFF")).toBe(true)
      expect(res.text).toContain("Admission No.")
      expect(res.text).toContain(created.admissionNumber)
    })

    it("requires the students:export permission", async () => {
      const res = await teacherAgent.get("/api/v1/students/export")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("search and filters", () => {
    it("filters to the current academic session by default", async () => {
      await createStudent(adminAgent)
      const every = await prisma.student.count()
      expect(every).toBe(1)
      const res = await adminAgent.get("/api/v1/students")
      expect(res.body.data.pagination.total).toBe(1)
    })

    it("searches across names, admission numbers, and guardians", async () => {
      await createStudent(adminAgent)
      const byName = await adminAgent.get(
        `/api/v1/students?search=${encodeURIComponent("Ravi")}`,
      )
      expect(byName.body.data.pagination.total).toBe(1)
      const byAdmission = await adminAgent.get(
        `/api/v1/students?search=${encodeURIComponent("ADM-")}`,
      )
      expect(byAdmission.body.data.pagination.total).toBe(1)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.studentGuardian.deleteMany()
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
  await prisma.session.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.academicSession.deleteMany()
  await prisma.section.deleteMany()
  await prisma.class.deleteMany()
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

interface StudentPayload {
  [key: string]: unknown
}

function createStudentPayload(overrides: StudentPayload): Record<string, unknown> {
  return {
    firstName: "Aditya",
    lastName: "Kumar",
    dateOfBirth: "2015-05-01",
    gender: "MALE",
    classId: fixtures.classSixId,
    sectionId: fixtures.sectionSixAId,
    email: `student-${Date.now()}@example.com`,
    guardians: [
      { name: "Ravi Kumar", relationshipType: "PARENT", isPrimary: true, phone: "9876543210" },
    ],
    ...overrides,
  }
}

async function createStudent(
  agent: ReturnType<typeof request.agent>,
): Promise<{ id: string; admissionNumber: string; name: string }> {
  const res = await agent.post("/api/v1/students").send(createStudentPayload({}))
  expect(res.status).toBe(201)
  return {
    id: res.body.data.id,
    admissionNumber: res.body.data.admissionNumber,
    name: res.body.data.name,
  }
}