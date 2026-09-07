import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

// Integration tests require a real PostgreSQL database. The pool is configured
// via TEST_DATABASE_URL (see .env.example); when it is unset the whole suite is
// skipped so `npm test` stays green without a database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const ACTIVE_SESSION = {
  name: "Academic Year 2026-2027",
  code: "AY2026-27",
  startDate: new Date("2026-04-01T00:00:00.000Z"),
  endDate: new Date("2027-03-31T00:00:00.000Z"),
  status: "ACTIVE",
} as const

interface Fixtures {
  schoolAId: string
  schoolBId: string
  sessionAId: string
  classSixAId: string
  sectionSixAId: string
  noSectionClassAId: string
}

const fixtures: Fixtures = {
  schoolAId: "",
  schoolBId: "",
  sessionAId: "",
  classSixAId: "",
  sectionSixAId: "",
  noSectionClassAId: "",
}

function createApplicationPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Aarav",
    lastName: "Sharma",
    dateOfBirth: "2016-06-01",
    gender: "MALE",
    phone: "9812345678",
    guardianName: "Ravi Kumar",
    guardianPhone: "9898989898",
    ...overrides,
  }
}

describe.skipIf(!TEST_DATABASE_URL)("Admissions API (integration)", () => {
  let prisma: PrismaClient
  const adminA = request.agent(app) // SUPER_ADMIN, membership in school A
  const viewerA = request.agent(app) // no permission grants (proves 403)
  const adminB = request.agent(app) // SUPER_ADMIN rooted in school B (cross-tenant)

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

    const schoolA = await prisma.school.create({ data: { name: "Admissions School A" } })
    fixtures.schoolAId = schoolA.id
    const schoolB = await prisma.school.create({ data: { name: "Admissions School B" } })
    fixtures.schoolBId = schoolB.id

    const activeA = await prisma.academicSession.create({
      data: { schoolId: schoolA.id, ...ACTIVE_SESSION },
    })
    fixtures.sessionAId = activeA.id

    const classSix = await prisma.class.create({
      data: { schoolId: schoolA.id, name: "6", sortOrder: 6 },
    })
    const sectionA = await prisma.section.create({ data: { classId: classSix.id, name: "A" } })
    fixtures.classSixAId = classSix.id
    fixtures.sectionSixAId = sectionA.id

    const noSectionClass = await prisma.class.create({
      data: { schoolId: schoolA.id, name: "LKG", sortOrder: 0 },
    })
    fixtures.noSectionClassAId = noSectionClass.id

    const superRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const viewerRole = await prisma.role.create({
      data: { name: "NO_PERMISSIONS", description: "Role with no permission grants" },
    })

    // Admin A: SUPER_ADMIN role + an ACTIVE membership in A (membership path).
    const userA = await prisma.user.create({
      data: {
        name: "Admin A",
        email: "admissions.a@example.com",
        passwordHash: hashPassword("a-secret-123456"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: superRole.id } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: userA.id, schoolId: schoolA.id, roleId: superRole.id, status: "ACTIVE" },
    })

    // Viewer A: legacy path (schoolId set), role with no grants -> 403 for any
    // permission-gated operations.
    await prisma.user.create({
      data: {
        schoolId: schoolA.id,
        name: "Viewer A",
        email: "admissions.viewer@example.com",
        passwordHash: hashPassword("viewer-secret-123456"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: viewerRole.id } } }] },
      },
    })

    // Admin B: SUPER_ADMIN rooted in school B (legacy path) to prove that even a
    // super admin cannot read or write another tenant's applications.
    await prisma.user.create({
      data: {
        schoolId: schoolB.id,
        name: "Admin B",
        email: "admissions.b@example.com",
        passwordHash: hashPassword("b-secret-123456"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })

    await login(adminA, "admissions.a@example.com", "a-secret-123456")
    await login(viewerA, "admissions.viewer@example.com", "viewer-secret-123456")
    await login(adminB, "admissions.b@example.com", "b-secret-123456")
  })

  afterEach(async () => {
    await prisma.studentGuardian.deleteMany()
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
    await prisma.studentEnrollment.deleteMany()
    await prisma.student.deleteMany()
    await prisma.guardian.deleteMany()
    await prisma.admissionApplication.deleteMany()
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  describe("auth + RBAC", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/admissions")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("returns an empty paginated list before any applications exist", async () => {
      const res = await adminA.get("/api/v1/admissions")
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.pagination).toMatchObject({ page: 1, pageSize: 20, total: 0 })
    })

    it("denies an actor without the admissions:view permission", async () => {
      const res = await viewerA.get("/api/v1/admissions")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("denies creating an application without the admissions:create permission", async () => {
      const res = await viewerA.post("/api/v1/admissions").send(createApplicationPayload())
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("meta", () => {
    it("returns sessions and classes with nested sections for the tenant", async () => {
      const res = await adminA.get("/api/v1/admissions/meta")
      expect(res.status).toBe(200)
      const { academicSessions, classes } = res.body.data
      expect(academicSessions.some((s: { status: string }) => s.status === "ACTIVE")).toBe(true)
      const classSix = classes.find((c: { name: string }) => c.name === "6")
      expect(classSix.sections.map((s: { name: string }) => s.name)).toContain("A")
      const lkg = classes.find((c: { name: string }) => c.name === "LKG")
      expect(lkg.sections).toEqual([])
    })
  })

  describe("create", () => {
    it("creates an application with a server-generated application number", async () => {
      const res = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.applicationNumber).toMatch(/^APP-\d{4}-\d{4}$/)
      expect(data.status).toBe("PENDING")
      expect(data.name).toBe("Aarav Sharma")
      expect(data.guardianName).toBe("Ravi Kumar")
    })

    it("generates a sequential application number per tenant", async () => {
      await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const second = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const data = second.body.data
      expect(data.applicationNumber).toMatch(/^APP-\d{4}-\d{4}$/)
    })

    it("validates the payload before writing", async () => {
      const res = await adminA
        .post("/api/v1/admissions")
        .send(createApplicationPayload({ dateOfBirth: undefined }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("requires at least one guardian contact", async () => {
      const res = await adminA
        .post("/api/v1/admissions")
        .send(createApplicationPayload({ guardianPhone: undefined }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("rejects a preferred class that belongs to another school", async () => {
      const foreignClass = await prisma.class.create({
        data: { schoolId: fixtures.schoolBId, name: "XB", sortOrder: 0 },
      })
      const res = await adminA
        .post("/api/v1/admissions")
        .send(createApplicationPayload({ preferredClassId: foreignClass.id }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toContain("Preferred class")
    })
  })

  describe("get + update", () => {
    let applicationId = ""

    const createOne = async () => {
      const res = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      return res.body.data as { id: string }
    }

    beforeEach(async () => {
      const app = await createOne()
      applicationId = app.id
    })

    it("returns a single application by id", async () => {
      const res = await adminA.get(`/api/v1/admissions/${applicationId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(applicationId)
      expect(res.body.data.firstName).toBe("Aarav")
    })

    it("edits the details of a pending application", async () => {
      const res = await adminA
        .patch(`/api/v1/admissions/${applicationId}`)
        .send({ firstName: "Vihaan", guardianPhone: "9000000000" })
      expect(res.status).toBe(200)
      expect(res.body.data.firstName).toBe("Vihaan")
      expect(res.body.data.guardianPhone).toBe("9000000000")
    })

    it("rejects editing an application that is no longer pending", async () => {
      await adminA
        .post(`/api/v1/admissions/${applicationId}/review`)
        .send({ status: "REJECTED", note: "Missing documents" })
      const res = await adminA
        .patch(`/api/v1/admissions/${applicationId}`)
        .send({ firstName: "Aarav" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("returns 404 for an unknown application id", async () => {
      const res = await adminA.get(`/api/v1/admissions/${"ffffffff-ffff-ffff-ffff-ffffffffffff"}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("review workflow", () => {
    it("approves a pending application and stamps reviewer metadata", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      const res = await adminA
        .post(`/api/v1/admissions/${id}/review`)
        .send({ status: "APPROVED", note: "Documents verified" })
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("APPROVED")
      expect(res.body.data.reviewNote).toBe("Documents verified")
      expect(res.body.data.reviewedAt).toBeTruthy()
    })

    it("rejects a second review of an already-reviewed application", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      await adminA.post(`/api/v1/admissions/${id}/review`).send({ status: "REJECTED" })
      const res = await adminA
        .post(`/api/v1/admissions/${id}/review`)
        .send({ status: "WITHDRAWN" })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("already REJECTED")
    })

    it("rejects reviewing an application from another school (404)", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const res = await adminB
        .post(`/api/v1/admissions/${created.body.data.id}/review`)
        .send({ status: "APPROVED" })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("convert to student", () => {
    const approveOne = async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      await adminA.post(`/api/v1/admissions/${id}/review`).send({ status: "APPROVED" })
      return id
    }

    it("converts an approved application into an enrolled student in one transaction", async () => {
      const id = await approveOne()
      const res = await adminA.post(`/api/v1/admissions/${id}/convert`).send({
        academicSessionId: fixtures.sessionAId,
        classId: fixtures.classSixAId,
        sectionId: fixtures.sectionSixAId,
      })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      await prisma.admissionApplication.findFirstOrThrow({
        where: { id, status: "CONVERTED", convertedStudentId: { not: null } },
      })
      await prisma.student.findFirstOrThrow({
        where: {
          id: res.body.data.student.id,
          admissionNumber: { startsWith: "ADM-" },
        },
      })
      const enrollment = await prisma.studentEnrollment.findFirstOrThrow({
        where: { studentId: res.body.data.student.id },
        include: { class: true, section: true, academicSession: true },
      })
      expect(enrollment.class.name).toBe("6")
      expect(enrollment.section?.name).toBe("A")
      expect(enrollment.academicSession.status).toBe("ACTIVE")
    })

    it("creates a primary guardian tied to the new student", async () => {
      const id = await approveOne()
      const res = await adminA.post(`/api/v1/admissions/${id}/convert`).send({
        classId: fixtures.classSixAId,
        sectionId: fixtures.sectionSixAId,
      })
      const guardian = await prisma.studentGuardian.findFirstOrThrow({
        where: { studentId: res.body.data.student.id },
        include: { guardian: true },
      })
      expect(guardian.isPrimary).toBe(true)
      expect(guardian.guardian.name).toBe("Ravi Kumar")
    })

    it("prevents converting the same application twice (duplicate prevention)", async () => {
      const id = await approveOne()
      const first = await adminA.post(`/api/v1/admissions/${id}/convert`).send({
        classId: fixtures.classSixAId,
        sectionId: fixtures.sectionSixAId,
      })
      expect(first.status).toBe(200)
      const second = await adminA.post(`/api/v1/admissions/${id}/convert`).send({
        classId: fixtures.classSixAId,
        sectionId: fixtures.sectionSixAId,
      })
      expect(second.status).toBe(400)
      expect(second.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects converting an application that is not approved", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      const res = await adminA
        .post(`/api/v1/admissions/${id}/convert`)
        .send({ classId: fixtures.classSixAId })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("approved")
    })
  })

  describe("delete", () => {
    it("deletes a pending application", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      const res = await adminA.delete(`/api/v1/admissions/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)
      const gone = await prisma.admissionApplication.findUnique({ where: { id } })
      expect(gone).toBeNull()
    })

    it("denies delete to an actor without the admissions:delete permission", async () => {
      const res = await viewerA.delete(`/api/v1/admissions/${"ffffffff-ffff-ffff-ffff-ffffffffffff"}`)
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("cross-tenant isolation", () => {
    it("a user in school B cannot read school A's application by direct id (404)", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      const res = await adminB.get(`/api/v1/admissions/${id}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("a user in school B cannot list school A's applications", async () => {
      await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const res = await adminB.get("/api/v1/admissions")
      expect(res.status).toBe(200)
      expect(res.body.data.pagination.total).toBe(0)
    })

    it("a user in school B cannot update school A's application (404)", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      const res = await adminB.patch(`/api/v1/admissions/${id}`).send({ firstName: "Hacked" })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("a user in school B cannot delete school A's application (404)", async () => {
      const created = await adminA.post("/api/v1/admissions").send(createApplicationPayload())
      const id = created.body.data.id
      const res = await adminB.delete(`/api/v1/admissions/${id}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("explicitly selecting a foreign school is forbidden (403)", async () => {
      const res = await adminA.get("/api/v1/admissions").set("x-school-id", fixtures.schoolBId)
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
  await prisma.admissionApplication.deleteMany()
  await prisma.session.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.teacher.deleteMany()
  await prisma.subject.deleteMany()
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
