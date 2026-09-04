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
  sectionBId: string
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
  sectionBId: "",
  classSevenId: "",
  otherClassId: "",
  matSubjectId: "",
  sciSubjectId: "",
  otherSubjectId: "",
  teacherLinkedId: "",
  teacherOtherId: "",
  otherTeacherId: "",
  linkedUserId: "",
  adminPassword: "homework-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Homework API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const adminOtherAgent = request.agent(app)
  const teacherAgent = request.agent(app)
  const teacherNoPermsAgent = request.agent(app)
  let otherHomeworkId = ""

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

    const school = await prisma.school.create({ data: { name: "Homework School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Homework Year",
        code: "HW2026",
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
    const sectionB = await prisma.section.create({ data: { classId: classSix.id, name: "B" } })
    fixtures.sectionBId = sectionB.id
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
        employeeId: "T-HW-0001",
        firstName: "Helena",
        lastName: "Other",
        gender: "FEMALE",
        designation: "Senior Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.teacherOtherId = teacherOther.id

    // RBAC fixtures (users + tenant memberships).
    const superRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })
    const noPermsRole = await prisma.role.create({
      data: { name: "ACCOUNTANT", description: "Test role without homework permissions" },
    })
    const permissionCodes = ["homework:view", "homework:create", "homework:update", "homework:delete"]
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
        name: "Homework Admin",
        email: "homework.admin@example.com",
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
        email: "homework.linked@example.com",
        passwordHash: hashPassword("linked-secret-123"),
        status: "ACTIVE",
      },
    })
    fixtures.linkedUserId = linkedUser.id
    await prisma.tenantMembership.create({
      data: {
        userId: linkedUser.id,
        schoolId: school.id,
        roleId: teacherRole.id,
        status: "ACTIVE",
      },
    })

    const noPermsUser = await prisma.user.create({
      data: {
        name: "No Perms Teacher",
        email: "homework.noperms@example.com",
        passwordHash: hashPassword("noperms-secret-123"),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: {
        userId: noPermsUser.id,
        schoolId: school.id,
        roleId: noPermsRole.id,
        status: "ACTIVE",
      },
    })

    // Teacher linked to the login account, with MAT + class 6 section A coverage.
    const linked = await adminAgentSetup()
    fixtures.teacherLinkedId = linked.id

    // Second tenant for cross-tenant isolation.
    const otherSchool = await prisma.school.create({ data: { name: "Other Homework School" } })
    fixtures.otherSchoolId = otherSchool.id
    const otherSession = await prisma.academicSession.create({
      data: {
        schoolId: otherSchool.id,
        name: "Other Year",
        code: "OH2026",
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
        employeeId: "T-OT-0001",
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
        email: "homework.other@example.com",
        passwordHash: hashPassword("other-secret-123"),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: {
        userId: otherAdmin.id,
        schoolId: otherSchool.id,
        roleId: superRole.id,
        status: "ACTIVE",
      },
    })

    await login(adminAgent, "homework.admin@example.com", fixtures.adminPassword)
    await login(adminOtherAgent, "homework.other@example.com", "other-secret-123")
    await login(teacherAgent, "homework.linked@example.com", "linked-secret-123")
    await login(teacherNoPermsAgent, "homework.noperms@example.com", "noperms-secret-123")
  })

  /** Boot helper: the linked teacher profile is created through the real Teachers API. */
  async function adminAgentSetup() {
    await login(adminAgent, "homework.admin@example.com", fixtures.adminPassword)
    const res = await adminAgent.post("/api/v1/teachers").send({
      firstName: "Tara",
      lastName: "Teacher",
      gender: "FEMALE",
      designation: "Class Teacher",
      joiningDate: "2026-04-01",
      status: "ACTIVE",
      userId: fixtures.linkedUserId,
      subjectIds: [fixtures.matSubjectId],
      classAssignments: [{ classId: fixtures.classSixId, sectionId: fixtures.sectionAId }],
    })
    expect(res.status).toBe(201)
    expect(res.body.data.userId).toBe(fixtures.linkedUserId)
    return { id: res.body.data.id }
  }

  afterEach(async () => {
    await prisma.homework.deleteMany()
    await prisma.assignment.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  function homeworkPayload(overrides: Record<string, unknown> = {}) {
    return {
      academicSessionId: fixtures.sessionId,
      classId: fixtures.classSixId,
      sectionId: fixtures.sectionAId,
      subjectId: fixtures.matSubjectId,
      teacherId: fixtures.teacherLinkedId,
      title: "Multiplication drill",
      dueDate: "2027-01-15",
      ...overrides,
    }
  }

  describe("index", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/homework")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("denies an authenticated user without homework:view", async () => {
      const res = await teacherNoPermsAgent.get("/api/v1/homework")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("returns an empty list before any homework exists", async () => {
      const res = await adminAgent.get("/api/v1/homework")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it("filters by status, class, subject and searches by title", async () => {
      await adminAgent.post("/api/v1/homework").send(homeworkPayload({ title: "Algebra basics" }))
      await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ title: "Multiplication drill", status: "PUBLISHED" }))
      await adminAgent
        .post("/api/v1/homework")
        .send(
          homeworkPayload({
            title: "Science lab report",
            subjectId: fixtures.sciSubjectId,
            classId: fixtures.classSevenId,
            sectionId: null,
            teacherId: fixtures.teacherOtherId,
          }),
        )

      const published = await adminAgent.get("/api/v1/homework").query({ status: "PUBLISHED" })
      expect(published.body.data.total).toBe(1)
      expect(published.body.data.items[0].title).toBe("Multiplication drill")

      const mathClass = await adminAgent
        .get("/api/v1/homework")
        .query({ classId: fixtures.classSixId, subjectId: fixtures.matSubjectId })
      expect(mathClass.body.data.total).toBe(2)

      const search = await adminAgent.get("/api/v1/homework").query({ search: "drill" })
      expect(search.body.data.items[0].title).toBe("Multiplication drill")
    })

    it("paginates with page/pageSize and reports totalPages", async () => {
      await adminAgent.post("/api/v1/homework").send(homeworkPayload({ title: "One" }))
      await adminAgent.post("/api/v1/homework").send(homeworkPayload({ title: "Two" }))
      const res = await adminAgent.get("/api/v1/homework").query({ page: 2, pageSize: 1 })
      expect(res.status).toBe(200)
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.pagination.page).toBe(2)
      expect(res.body.data.pagination.pageSize).toBe(1)
      expect(res.body.data.pagination.total).toBe(2)
      expect(res.body.data.pagination.totalPages).toBe(2)
    })

    it("exposes the overdue flag for a past due date", async () => {
      await adminAgent.post("/api/v1/homework").send(homeworkPayload({ dueDate: "2026-01-15" }))
      const res = await adminAgent.get("/api/v1/homework").query({ dueDateTo: "2026-12-31" })
      expect(res.body.data.items[0].isOverdue).toBe(true)
    })
  })

  describe("context", () => {
    it("gives an admin the full assignable context with no acting-teacher restriction", async () => {
      const res = await adminAgent.get("/api/v1/homework/context")
      expect(res.status).toBe(200)
      expect(res.body.data.teacherId).toBeNull()
      const classes = res.body.data.classes as Array<{ id: string; name: string; sections: Array<{ id: string; name: string }> }>
      const six = classes.find((c) => c.id === fixtures.classSixId)
      expect(six?.sections.map((s) => s.name).sort()).toEqual(["A", "B"])
      expect((res.body.data.subjects as Array<{ id: string }>).length).toBe(2)
    })

    it("restricts a teacher to their own profile, subjects and classes", async () => {
      const res = await teacherAgent.get("/api/v1/homework/context")
      expect(res.status).toBe(200)
      expect(res.body.data.teacherId).toBe(fixtures.teacherLinkedId)
      const subjects = res.body.data.subjects as Array<{ code: string }>
      const matSubject = subjects.find((s) => s.code === "MAT")
      expect(matSubject).toBeDefined()
      expect(subjects.some((s) => s.code === "SCI")).toBe(false)
      const classes = res.body.data.classes as Array<{ id: string; sections: Array<{ name: string }> }>
      expect(classes.length).toBe(1)
      expect(classes[0].id).toBe(fixtures.classSixId)
      expect(classes[0].sections.map((s) => s.name)).toEqual(["A"])
    })
  })

  describe("create", () => {
    it("creates homework with section targeting and snapshotted names", async () => {
      const res = await adminAgent.post("/api/v1/homework").send(homeworkPayload())
      expect(res.status).toBe(201)
      const data = res.body.data
      expect(data.status).toBe("DRAFT")
      expect(data.className).toBe("Six")
      expect(data.sectionName).toBe("A")
      expect(data.subjectCode).toBe("MAT")
      expect(data.teacherName).toBe("Tara Teacher")
      expect(data.publishedAt).toBeNull()
      expect(data.isOverdue).toBe(false)
    })

    it("does not force a section on a sectionless class (whole-class target)", async () => {
      const res = await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ classId: fixtures.classSevenId, sectionId: null }))
      expect(res.status).toBe(201)
      expect(res.body.data.className).toBe("Seven")
      expect(res.body.data.sectionName).toBeNull()
    })

    it("creates directly as PUBLISHED and sets publishedAt server-side", async () => {
      const res = await adminAgent.post("/api/v1/homework").send(homeworkPayload({ status: "PUBLISHED" }))
      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe("PUBLISHED")
      expect(res.body.data.publishedAt).not.toBeNull()
    })

    it("rejects ARCHIVED on create", async () => {
      const res = await adminAgent.post("/api/v1/homework").send(homeworkPayload({ status: "ARCHIVED" }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("rejects a session from another school (FK injection)", async () => {
      const res = await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ academicSessionId: fixtures.otherSessionId }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects a subject from another school", async () => {
      const res = await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ subjectId: fixtures.otherSubjectId }))
      expect(res.status).toBe(400)
    })

    it("rejects a teacher from another school", async () => {
      const res = await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ teacherId: fixtures.otherTeacherId }))
      expect(res.status).toBe(400)
    })

    it("rejects a section that does not belong to the class", async () => {
      const wrongSection = await prisma.section.create({
        data: { classId: fixtures.classSevenId, name: "C" },
      })
      const res = await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ sectionId: wrongSection.id }))
      expect(res.status).toBe(400)
    })

    it("lets a teacher create for their own linked profile", async () => {
      const res = await teacherAgent.post("/api/v1/homework").send(homeworkPayload())
      expect(res.status).toBe(201)
      expect(res.body.data.teacherId).toBe(fixtures.teacherLinkedId)
    })

    it("forbids a teacher from creating for another teacher's profile", async () => {
      const res = await teacherAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ teacherId: fixtures.teacherOtherId }))
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("forbids a teacher from targeting a subject they do not teach", async () => {
      const res = await teacherAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ subjectId: fixtures.sciSubjectId }))
      expect(res.status).toBe(403)
    })

    it("forbids a teacher from targeting a section they do not cover", async () => {
      const res = await teacherAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ sectionId: fixtures.sectionBId }))
      expect(res.status).toBe(403)
    })

    it("lets an admin create for a teacher even when the teacher's coverage does not fit", async () => {
      const res = await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ subjectId: fixtures.sciSubjectId }))
      expect(res.status).toBe(201)
    })
  })

  describe("detail / update / delete", () => {
    async function createHomework(overrides: Record<string, unknown> = {}) {
      const res = await adminAgent.post("/api/v1/homework").send(homeworkPayload(overrides))
      expect(res.status).toBe(201)
      return res.body.data as { id: string; status: string }
    }

    it("gets a homework by id", async () => {
      const created = await createHomework({ title: "Lookup me" })
      const res = await adminAgent.get(`/api/v1/homework/${created.id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe("Lookup me")
    })

    it("returns 404 for an unknown homework", async () => {
      const res = await adminAgent.get("/api/v1/homework/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
    })

    it("updates fields", async () => {
      const created = await createHomework()
      const res = await adminAgent
        .patch(`/api/v1/homework/${created.id}`)
        .send({ title: "Revised title", dueDate: "2027-02-01" })
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe("Revised title")
      expect(res.body.data.dueDate).toBe("2027-02-01")
      // An unrelated edit must not clear an existing section.
      expect(res.body.data.sectionName).toBe("A")
    })

    it("publishes a draft and sets publishedAt server-side (kept across later edits)", async () => {
      const created = await createHomework()
      const res = await adminAgent.patch(`/api/v1/homework/${created.id}`).send({ status: "PUBLISHED" })
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("PUBLISHED")
      const firstPublishedAt = res.body.data.publishedAt
      expect(firstPublishedAt).not.toBeUndefined()

      const edited = await adminAgent
        .patch(`/api/v1/homework/${created.id}`)
        .send({ title: "Edited after publish" })
      expect(edited.status).toBe(200)
      expect(edited.body.data.publishedAt).toBe(firstPublishedAt)
    })

    it("accepts DRAFT→ARCHIVED and PUBLISHED→ARCHIVED but rejects reopening", async () => {
      const archivedDraft = await createHomework()
      const toArchived = await adminAgent
        .patch(`/api/v1/homework/${archivedDraft.id}`)
        .send({ status: "ARCHIVED" })
      expect(toArchived.status).toBe(200)
      expect(toArchived.body.data.status).toBe("ARCHIVED")

      const reopen = await adminAgent.patch(`/api/v1/homework/${archivedDraft.id}`).send({ status: "PUBLISHED" })
      expect(reopen.status).toBe(400)

      const published = await createHomework({ status: "PUBLISHED" })
      const closed = await adminAgent.patch(`/api/v1/homework/${published.id}`).send({ status: "ARCHIVED" })
      expect(closed.status).toBe(200)
      expect(closed.body.data.status).toBe("ARCHIVED")
    })

    it("deletes only DRAFT homework", async () => {
      const draft = await createHomework()
      const deleted = await adminAgent.delete(`/api/v1/homework/${draft.id}`)
      expect(deleted.status).toBe(200)
      expect(deleted.body.data.deleted).toBe(true)
      const after = await adminAgent.get(`/api/v1/homework/${draft.id}`)
      expect(after.status).toBe(404)

      const published = await createHomework({ status: "PUBLISHED" })
      const rejected = await adminAgent.delete(`/api/v1/homework/${published.id}`)
      expect(rejected.status).toBe(400)
    })

    it("forbids a teacher from updating/deleting another teacher's homework", async () => {
      const ownedByOther = await adminAgent
        .post("/api/v1/homework")
        .send(homeworkPayload({ teacherId: fixtures.teacherOtherId }))
      const id = ownedByOther.body.data.id

      const update = await teacherAgent.patch(`/api/v1/homework/${id}`).send({ title: "hijack" })
      expect(update.status).toBe(403)

      const del = await teacherAgent.delete(`/api/v1/homework/${id}`)
      expect(del.status).toBe(403)
    })
  })

  describe("tenant isolation", () => {
    beforeAll(async () => {
      const otherHomework = await prisma.homework.create({
        data: {
          schoolId: fixtures.otherSchoolId,
          academicSessionId: fixtures.otherSessionId,
          classId: fixtures.otherClassId,
          sectionId: null,
          subjectId: fixtures.otherSubjectId,
          teacherId: fixtures.otherTeacherId,
          title: "Other tenant's homework",
          dueDate: new Date("2027-03-01T00:00:00.000Z"),
          status: "PUBLISHED",
        },
      })
      otherHomeworkId = otherHomework.id
    })

    it("hides another tenant's homework on read, update and delete", async () => {
      const read = await adminAgent.get(`/api/v1/homework/${otherHomeworkId}`)
      expect(read.status).toBe(404)

      const update = await adminAgent.patch(`/api/v1/homework/${otherHomeworkId}`).send({ title: "nope" })
      expect(update.status).toBe(404)

      const del = await adminAgent.delete(`/api/v1/homework/${otherHomeworkId}`)
      expect(del.status).toBe(404)
    })

    it("never lists another tenant's homework", async () => {
      const res = await adminAgent.get("/api/v1/homework")
      for (const item of res.body.data.items as Array<{ id: string }>) {
        expect(item.id).not.toBe(otherHomeworkId)
      }
    })
  })

  it("co-locates submissions on the schema so the portal phase needs no redesign", async () => {
    const count = await prisma.homeworkSubmission.count()
    expect(count).toBe(0)
    const model = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('HomeworkSubmission', 'AssignmentSubmission')
    `
    expect(model.map((m) => m.table_name).sort()).toEqual(["AssignmentSubmission", "HomeworkSubmission"])
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
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

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}