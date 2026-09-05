import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

interface Fixtures {
  schoolId: string
  otherSchoolId: string
  sessionId: string
  otherSessionId: string
  classSixId: string
  sectionAId: string
  classSevenId: string
  otherClassId: string
  matSubjectId: string
  sciSubjectId: string
  otherSubjectId: string
  teacherLinkedId: string
  teacherOtherId: string
  otherTeacherId: string
  linkedUserId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  otherSchoolId: "",
  sessionId: "",
  otherSessionId: "",
  classSixId: "",
  sectionAId: "",
  classSevenId: "",
  otherClassId: "",
  matSubjectId: "",
  sciSubjectId: "",
  otherSubjectId: "",
  teacherLinkedId: "",
  teacherOtherId: "",
  otherTeacherId: "",
  linkedUserId: "",
  adminPassword: "assignment-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Assignments API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const adminOtherAgent = request.agent(app)
  const teacherAgent = request.agent(app)
  const teacherNoPermsAgent = request.agent(app)

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

    const school = await prisma.school.create({ data: { name: "Assignment School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Assignment Year",
        code: "AS2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    const classSix = await prisma.class.create({
      data: { schoolId: school.id, name: "Six", sortOrder: 6 },
    })
    fixtures.classSixId = classSix.id
    const sectionA = await prisma.section.create({ data: { classId: classSix.id, name: "A" } })
    fixtures.sectionAId = sectionA.id
    const classSeven = await prisma.class.create({
      data: { schoolId: school.id, name: "Seven", sortOrder: 7 },
    })
    fixtures.classSevenId = classSeven.id

    const mat = await prisma.subject.create({
      data: { schoolId: school.id, code: "MAT", name: "Mathematics" },
    })
    fixtures.matSubjectId = mat.id
    const sci = await prisma.subject.create({
      data: { schoolId: school.id, code: "SCI", name: "Science" },
    })
    fixtures.sciSubjectId = sci.id

    const teacherOther = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "T-AS-0001",
        firstName: "Adam",
        lastName: "Other",
        gender: "MALE",
        designation: "Senior Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.teacherOtherId = teacherOther.id

    const superRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })
    const noPermsRole = await prisma.role.create({
      data: { name: "ACCOUNTANT", description: "Test role without assignment permissions" },
    })
    const permissionCodes = ["assignments:view", "assignments:create", "assignments:update", "assignments:delete"]
    for (const code of permissionCodes) {
      const [resource, action] = code.split(":")
      const permission = await prisma.permission.create({
        data: { code, resource, action, description: `Test ${code}` },
      })
      await prisma.rolePermission.create({
        data: { roleId: teacherRole.id, permissionId: permission.id },
      })
    }

    const admin = await prisma.user.create({
      data: {
        name: "Assignment Admin",
        email: "assignment.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: admin.id, schoolId: school.id, roleId: superRole.id, status: "ACTIVE" },
    })

    const linkedUser = await prisma.user.create({
      data: {
        name: "Linked Teacher",
        email: "assignment.linked@example.com",
        passwordHash: hashPassword("linked-secret-123"),
        status: "ACTIVE",
      },
    })
    fixtures.linkedUserId = linkedUser.id
    await prisma.tenantMembership.create({
      data: { userId: linkedUser.id, schoolId: school.id, roleId: teacherRole.id, status: "ACTIVE" },
    })

    const noPermsUser = await prisma.user.create({
      data: {
        name: "No Perms User",
        email: "assignment.noperms@example.com",
        passwordHash: hashPassword("noperms-secret-123"),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: noPermsUser.id, schoolId: school.id, roleId: noPermsRole.id, status: "ACTIVE" },
    })

    // Linked teacher profile created through the real Teachers API.
    const res = await adminAgent.post("/api/v1/auth/login").send({
      email: "assignment.admin@example.com",
      password: fixtures.adminPassword,
    })
    expect(res.status).toBe(200)
    const teacherRes = await adminAgent.post("/api/v1/teachers").send({
      firstName: "Anita",
      lastName: "Teacher",
      gender: "FEMALE",
      designation: "Class Teacher",
      joiningDate: "2026-04-01",
      status: "ACTIVE",
      userId: fixtures.linkedUserId,
      subjectIds: [fixtures.matSubjectId],
      classAssignments: [{ classId: fixtures.classSixId, sectionId: fixtures.sectionAId }],
    })
    expect(teacherRes.status).toBe(201)
    expect(teacherRes.body.data.userId).toBe(fixtures.linkedUserId)
    fixtures.teacherLinkedId = teacherRes.body.data.id

    // Second tenant for cross-tenant isolation.
    const otherSchool = await prisma.school.create({ data: { name: "Other Assignment School" } })
    fixtures.otherSchoolId = otherSchool.id
    const otherSession = await prisma.academicSession.create({
      data: {
        schoolId: otherSchool.id,
        name: "Other Year",
        code: "OA2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.otherSessionId = otherSession.id
    const otherClass = await prisma.class.create({
      data: { schoolId: otherSchool.id, name: "Nine", sortOrder: 9 },
    })
    fixtures.otherClassId = otherClass.id
    const otherSubject = await prisma.subject.create({
      data: { schoolId: otherSchool.id, code: "ENG", name: "English" },
    })
    fixtures.otherSubjectId = otherSubject.id
    const otherTeacher = await prisma.teacher.create({
      data: {
        schoolId: otherSchool.id,
        employeeId: "T-OA-0001",
        firstName: "Other",
        lastName: "Tenant",
        gender: "MALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.otherTeacherId = otherTeacher.id

    const otherAdmin = await prisma.user.create({
      data: {
        name: "Other Admin",
        email: "assignment.other@example.com",
        passwordHash: hashPassword("other-secret-123"),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: otherAdmin.id, schoolId: otherSchool.id, roleId: superRole.id, status: "ACTIVE" },
    })

    await login(adminAgent, "assignment.admin@example.com", fixtures.adminPassword)
    await login(adminOtherAgent, "assignment.other@example.com", "other-secret-123")
    await login(teacherAgent, "assignment.linked@example.com", "linked-secret-123")
    await login(teacherNoPermsAgent, "assignment.noperms@example.com", "noperms-secret-123")
  })

  afterEach(async () => {
    await prisma.assignment.deleteMany()
    await prisma.homework.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  function assignmentPayload(overrides: Record<string, unknown> = {}) {
    return {
      academicSessionId: fixtures.sessionId,
      classId: fixtures.classSixId,
      sectionId: fixtures.sectionAId,
      subjectId: fixtures.matSubjectId,
      teacherId: fixtures.teacherLinkedId,
      title: "Essay on fractions",
      instructions: "Write two paragraphs.",
      dueDate: "2027-01-20",
      ...overrides,
    }
  }

  describe("index", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/assignments")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("denies an authenticated user without assignments:view", async () => {
      const res = await teacherNoPermsAgent.get("/api/v1/assignments")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("returns an empty list before any assignments exist", async () => {
      const res = await adminAgent.get("/api/v1/assignments")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it("supports status/class/search filters and pagination", async () => {
      await adminAgent.post("/api/v1/assignments").send(assignmentPayload({ title: "First" }))
      await adminAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ title: "Second", status: "PUBLISHED" }))

      const filtered = await adminAgent.get("/api/v1/assignments").query({ status: "PUBLISHED" })
      expect(filtered.body.data.total).toBe(1)

      const search = await adminAgent.get("/api/v1/assignments").query({ search: "Second" })
      expect(search.body.data.items).toHaveLength(1)

      const paged = await adminAgent.get("/api/v1/assignments").query({ page: 1, pageSize: 1 })
      expect(paged.body.data.pagination.total).toBe(2)
      expect(paged.body.data.pagination.totalPages).toBe(2)
    })
  })

  describe("create", () => {
    it("creates an assignment with section targeting and server-set lifecycle fields", async () => {
      const res = await adminAgent.post("/api/v1/assignments").send(assignmentPayload())
      expect(res.status).toBe(201)
      const data = res.body.data
      expect(data.className).toBe("Six")
      expect(data.sectionName).toBe("A")
      expect(data.subjectCode).toBe("MAT")
      expect(data.status).toBe("DRAFT")
      expect(data.publishedAt).toBeNull()
      expect(data.instructions).toBe("Write two paragraphs.")
    })

    it("does not force a section on a sectionless class", async () => {
      const res = await adminAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ classId: fixtures.classSevenId, sectionId: null }))
      expect(res.status).toBe(201)
      expect(res.body.data.sectionName).toBeNull()
    })

    it("rejects a session from another school (FK injection)", async () => {
      const res = await adminAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ academicSessionId: fixtures.otherSessionId }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects an ARCHIVED status on create", async () => {
      const res = await adminAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ status: "ARCHIVED" }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("lets a teacher create for their own linked profile but not another teacher's", async () => {
      const own = await teacherAgent.post("/api/v1/assignments").send(assignmentPayload())
      expect(own.status).toBe(201)

      const other = await teacherAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ teacherId: fixtures.teacherOtherId }))
      expect(other.status).toBe(403)
      expect(other.body.error.code).toBe("FORBIDDEN")
    })

    it("forbids a teacher from targeting a subject they do not teach", async () => {
      const res = await teacherAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ subjectId: fixtures.sciSubjectId }))
      expect(res.status).toBe(403)
    })

    it("lets an admin create for a teacher whose coverage does not fit", async () => {
      const res = await adminAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ subjectId: fixtures.sciSubjectId }))
      expect(res.status).toBe(201)
    })
  })

  describe("context", () => {
    it("scopes an admin context to all school subjects/classes", async () => {
      const res = await adminAgent.get("/api/v1/assignments/context")
      expect(res.status).toBe(200)
      expect(res.body.data.teacherId).toBeNull()
      expect((res.body.data.subjects as Array<{ id: string }>).length).toBe(2)
    })

    it("scopes a teacher context to their own coverage", async () => {
      const res = await teacherAgent.get("/api/v1/assignments/context")
      expect(res.status).toBe(200)
      expect(res.body.data.teacherId).toBe(fixtures.teacherLinkedId)
      const subjects = res.body.data.subjects as Array<{ code: string }>
      expect(subjects.map((s) => s.code)).toEqual(["MAT"])
    })
  })

  describe("detail / update / delete", () => {
    async function createAssignment(overrides: Record<string, unknown> = {}) {
      const res = await adminAgent.post("/api/v1/assignments").send(assignmentPayload(overrides))
      expect(res.status).toBe(201)
      return res.body.data as { id: string; status: string }
    }

    it("gets an assignment by id and returns 404 for an unknown one", async () => {
      const created = await createAssignment({ title: "Lookup me" })
      const res = await adminAgent.get(`/api/v1/assignments/${created.id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe("Lookup me")

      const missing = await adminAgent.get("/api/v1/assignments/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(missing.status).toBe(404)
    })

    it("updates fields and performs lifecycle transitions", async () => {
      const created = await createAssignment()
      const updated = await adminAgent
        .patch(`/api/v1/assignments/${created.id}`)
        .send({ title: "Revised essay", dueDate: "2027-02-01" })
      expect(updated.status).toBe(200)
      expect(updated.body.data.title).toBe("Revised essay")
      // An unrelated edit must not clear an existing section.
      expect(updated.body.data.sectionName).toBe("A")

      const invalid = await adminAgent
        .patch(`/api/v1/assignments/${created.id}`)
        .send({ status: "ARCHIVED" })
      expect(invalid.status).toBe(200)
      expect(invalid.body.data.status).toBe("ARCHIVED")

      const reopen = await adminAgent
        .patch(`/api/v1/assignments/${created.id}`)
        .send({ status: "PUBLISHED" })
      expect(reopen.status).toBe(400)
    })

    it("deletes only DRAFT assignments", async () => {
      const draft = await createAssignment()
      const deleted = await adminAgent.delete(`/api/v1/assignments/${draft.id}`)
      expect(deleted.status).toBe(200)
      expect(deleted.body.data.deleted).toBe(true)

      const published = await createAssignment({ status: "PUBLISHED" })
      const rejected = await adminAgent.delete(`/api/v1/assignments/${published.id}`)
      expect(rejected.status).toBe(400)
    })

    it("forbids a teacher from deleting another teacher's assignment", async () => {
      const ownedByOther = await adminAgent
        .post("/api/v1/assignments")
        .send(assignmentPayload({ teacherId: fixtures.teacherOtherId }))
      const id = ownedByOther.body.data.id
      const res = await teacherAgent.delete(`/api/v1/assignments/${id}`)
      expect(res.status).toBe(403)
    })
  })

  describe("tenant isolation", () => {
    beforeAll(async () => {
      const otherAdmin = await prisma.user.findFirst({
        where: { email: "assignment.other@example.com" },
        select: { id: true },
      })
      await prisma.assignment.create({
        data: {
          schoolId: fixtures.otherSchoolId,
          academicSessionId: fixtures.otherSessionId,
          classId: fixtures.otherClassId,
          sectionId: null,
          subjectId: fixtures.otherSubjectId,
          teacherId: fixtures.otherTeacherId,
          title: "Other tenant's assignment",
          dueDate: new Date("2027-03-01T00:00:00.000Z"),
          status: "PUBLISHED",
          createdBy: otherAdmin?.id ?? null,
          updatedBy: otherAdmin?.id ?? null,
        },
      })
    })

    it("hides another tenant's assignment on read, update and delete", async () => {
      const otherRow = await prisma.assignment.findFirst({
        where: { schoolId: fixtures.otherSchoolId },
        select: { id: true },
      })
      if (!otherRow) throw new Error("Expected other-tenant assignment")

      expect((await adminAgent.get(`/api/v1/assignments/${otherRow.id}`)).status).toBe(404)
      expect(
        (await adminAgent.patch(`/api/v1/assignments/${otherRow.id}`).send({ title: "nope" })).status,
      ).toBe(404)
      expect((await adminAgent.delete(`/api/v1/assignments/${otherRow.id}`)).status).toBe(404)
    })

    it("never lists another tenant's assignments", async () => {
      const res = await adminAgent.get("/api/v1/assignments")
      const rows = await prisma.assignment.findMany({ where: { schoolId: fixtures.otherSchoolId } })
      for (const row of rows) {
        expect(
          (res.body.data.items as Array<{ id: string }>).some((item) => item.id === row.id),
        ).toBe(false)
      }
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.assignmentSubmission.deleteMany()
  await prisma.homeworkSubmission.deleteMany()
  await prisma.assignment.deleteMany()
  await prisma.homework.deleteMany()
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

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}