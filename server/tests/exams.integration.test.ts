import { execFileSync } from "node:child_process"
import { Prisma, PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
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
  examTypeId: string
  otherExamTypeId: string
  classSixId: string
  sectionAId: string
  sectionBId: string
  classSevenId: string
  matSubjectId: string
  sciSubjectId: string
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
  examTypeId: "",
  otherExamTypeId: "",
  classSixId: "",
  sectionAId: "",
  sectionBId: "",
  classSevenId: "",
  matSubjectId: "",
  sciSubjectId: "",
  teacherLinkedId: "",
  teacherOtherId: "",
  otherTeacherId: "",
  linkedUserId: "",
  adminPassword: "exams-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Exams API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const otherAgent = request.agent(app)
  const teacherAgent = request.agent(app)
  const noPermsAgent = request.agent(app)

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

    const school = await prisma.school.create({ data: { name: "Exams School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Exams Year",
        code: "EX2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    const examType = await prisma.examType.create({
      data: { schoolId: school.id, code: "TERM_1", name: "Term 1", sortOrder: 1 },
    })
    fixtures.examTypeId = examType.id
    const otherExamType = await prisma.examType.create({
      data: { schoolId: school.id, code: "TERM_2", name: "Term 2", sortOrder: 2 },
    })
    fixtures.otherExamTypeId = otherExamType.id

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
        employeeId: "T-EX-0002",
        firstName: "Helena",
        lastName: "Other",
        gender: "FEMALE",
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
      data: { name: "ACCOUNTANT", description: "Test role without exam permissions" },
    })
    const permissionCodes = ["exams:view", "exams:create", "exams:update", "exams:delete"]
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
        name: "Exams Admin",
        email: "exams.admin@example.com",
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
        email: "exams.linked@example.com",
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
        email: "exams.noperms@example.com",
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

    // Linked TEACHER actor with MAT + class 6 section A coverage.
    fixtures.teacherLinkedId = (
      await prisma.teacher.create({
        data: {
          schoolId: school.id,
          employeeId: "T-EX-0001",
          firstName: "Tara",
          lastName: "Teacher",
          gender: "FEMALE",
          designation: "Class Teacher",
          joiningDate: new Date("2026-04-01T00:00:00.000Z"),
          status: "ACTIVE",
          userId: linkedUser.id,
          teacherSubjects: {
            create: { subjectId: mat.id },
          },
          teacherClasses: {
            create: { classId: classSix.id, sectionId: sectionA.id },
          },
        },
      })
    ).id

    const otherSchool = await prisma.school.create({ data: { name: "Other Exams School" } })
    fixtures.otherSchoolId = otherSchool.id
    const otherSession = await prisma.academicSession.create({
      data: {
        schoolId: otherSchool.id,
        name: "Other Year",
        code: "OE2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.otherSessionId = otherSession.id
    const otherSubject = await prisma.subject.create({
      data: { schoolId: otherSchool.id, code: "ENG", name: "English" },
    })
    const otherTeacher = await prisma.teacher.create({
      data: {
        schoolId: otherSchool.id,
        employeeId: "T-OE-0001",
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
        email: "exams.other@example.com",
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

    void otherSubject
    void otherExamType

    await login(adminAgent, "exams.admin@example.com", fixtures.adminPassword)
    await login(otherAgent, "exams.other@example.com", "other-secret-123")
    await login(teacherAgent, "exams.linked@example.com", "linked-secret-123")
    await login(noPermsAgent, "exams.noperms@example.com", "noperms-secret-123")
  })

  beforeEach(async () => {
    await prisma.examSubject.deleteMany()
    await prisma.exam.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  function examPayload(overrides: Record<string, unknown> = {}) {
    return {
      academicSessionId: fixtures.sessionId,
      examTypeId: fixtures.examTypeId,
      name: "Term 1 Examination",
      classId: fixtures.classSixId,
      sectionId: fixtures.sectionAId,
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      subjects: [
        {
          subjectId: fixtures.matSubjectId,
          teacherId: fixtures.teacherLinkedId,
          maxMarks: 100,
          passMarks: 40,
        },
        {
          subjectId: fixtures.sciSubjectId,
          teacherId: fixtures.teacherOtherId,
          maxMarks: 50,
          passMarks: 25,
        },
      ],
      ...overrides,
    }
  }

  function createdId(res: request.Response): string {
    return res.body.data.id as string
  }

  describe("index", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/exams")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("denies an authenticated user without exams:view", async () => {
      const res = await noPermsAgent.get("/api/v1/exams")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("returns an empty list before any exams exist", async () => {
      const res = await adminAgent.get("/api/v1/exams")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it("filters by status/class/examType and searches by name", async () => {
      await adminAgent.post("/api/v1/exams").send(
        examPayload({
          name: "Term 1 Mathematics",
          subjects: [{ subjectId: fixtures.matSubjectId, teacherId: fixtures.teacherLinkedId, maxMarks: 100, passMarks: 40 }],
        }),
      )
      await adminAgent.post("/api/v1/exams").send(
        examPayload({
          name: "Term 1 English",
          examTypeId: fixtures.otherExamTypeId,
          sectionId: null,
          subjects: [{ subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 }],
          status: "PUBLISHED",
        }),
      )

      const published = await adminAgent.get("/api/v1/exams").query({ status: "PUBLISHED" })
      expect(published.body.data.total).toBe(1)
      expect(published.body.data.items[0].name).toBe("Term 1 English")

      const mathClass = await adminAgent
        .get("/api/v1/exams")
        .query({ classId: fixtures.classSixId, examTypeId: fixtures.examTypeId })
      expect(mathClass.body.data.total).toBe(1)
      expect(mathClass.body.data.items[0].name).toBe("Term 1 Mathematics")

      const search = await adminAgent.get("/api/v1/exams").query({ search: "English" })
      expect(search.body.data.items[0].name).toBe("Term 1 English")
    })

    it("paginates and reports totalPages", async () => {
      await adminAgent.post("/api/v1/exams").send(
        examPayload({ name: "One", subjects: [{ subjectId: fixtures.matSubjectId, teacherId: fixtures.teacherLinkedId, maxMarks: 100, passMarks: 40 }] }),
      )
      await adminAgent.post("/api/v1/exams").send(
        examPayload({ name: "Two", sectionId: fixtures.sectionBId, subjects: [{ subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 }] }),
      )
      const res = await adminAgent.get("/api/v1/exams").query({ page: 2, pageSize: 1 })
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.pagination.totalPages).toBe(2)
    })

    it("keeps tenants isolated", async () => {
      const res = await otherAgent.get("/api/v1/exams")
      expect(res.status).toBe(200)
      expect(res.body.data.items).toEqual([])
    })
  })

  describe("context", () => {
    it("gives an admin the full assignable context", async () => {
      const res = await adminAgent.get("/api/v1/exams/context")
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.examTypes.some((t: { code: string }) => t.code === "TERM_1")).toBe(true)
      expect((data.subjects as Array<{ id: string }>).length).toBe(2)
      const classes = data.classes as Array<{ id: string; sections: Array<{ name: string }> }>
      const six = classes.find((c) => c.id === fixtures.classSixId)
      expect(six?.sections.map((s) => s.name).sort()).toEqual(["A", "B"])
      expect((data.teachers as Array<{ id: string }>).length).toBe(2)
      expect((data.academicSessions as Array<{ id: string }>).length).toBeGreaterThan(0)
    })

    it("restricts a teacher to their own profile, subjects, classes, and self", async () => {
      const res = await teacherAgent.get("/api/v1/exams/context")
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.teacherId).toBeUndefined()
      const subjects = data.subjects as Array<{ code: string }>
      expect(subjects.map((s) => s.code)).toEqual(["MAT"])
      expect((data.teachers as Array<{ id: string }>).map((t) => t.id)).toEqual([
        fixtures.teacherLinkedId,
      ])
      const classes = data.classes as Array<{ id: string; sections: Array<{ name: string }> }>
      expect(classes.length).toBe(1)
      expect(classes[0].id).toBe(fixtures.classSixId)
      expect(classes[0].sections.map((s) => s.name)).toEqual(["A"])
    })
  })

  describe("create", () => {
    it("creates a draft exam with its subject list", async () => {
      const res = await adminAgent.post("/api/v1/exams").send(examPayload())
      expect(res.status).toBe(201)
      const data = res.body.data
      expect(data.status).toBe("DRAFT")
      expect(data.className).toBe("Six")
      expect(data.sectionName).toBe("A")
      expect(data.examTypeCode).toBe("TERM_1")
      expect(data.subjects).toHaveLength(2)
      expect(data.subjects[0].sortOrder).toBe(0)
      expect(data.subjects.map((s: { subjectCode: string }) => s.subjectCode).sort()).toEqual([
        "MAT",
        "SCI",
      ])
      expect(data.startDate).toBe("2026-09-01")
    })

    it("supports a PUBLISHED shortcut with a publish timestamp", async () => {
      const res = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ status: "PUBLISHED" }))
      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe("PUBLISHED")
      expect(res.body.data.publishedAt).toBeTruthy()
    })

    it("supports a whole-class exam (null section equals class-wide)", async () => {
      const res = await adminAgent.post("/api/v1/exams").send(examPayload({ sectionId: null }))
      expect(res.status).toBe(201)
      expect(res.body.data.sectionName).toBeNull()
    })

    it("rejects a duplicate exam instance for the same session/type/class/section", async () => {
      await adminAgent.post("/api/v1/exams").send(examPayload({ name: "First" }))
      const dup = await adminAgent.post("/api/v1/exams").send(examPayload({ name: "Second" }))
      expect(dup.status).toBe(400)
      expect(dup.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects a duplicate whole-class instance (nullable section pre-check)", async () => {
      await adminAgent.post("/api/v1/exams").send(examPayload({ name: "Whole A", sectionId: null }))
      const dup = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ name: "Whole B", sectionId: null }))
      expect(dup.status).toBe(400)
      expect(dup.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects cross-school references", async () => {
      await expect(
        adminAgent.post("/api/v1/exams").send(examPayload({ examTypeId: "00000000-0000-4000-8000-000000000001" })),
      ).resolves.toMatchObject({ status: 400 })
      await expect(
        adminAgent
          .post("/api/v1/exams")
          .send(examPayload({ subjects: [{ subjectId: "00000000-0000-4000-8000-000000000002", teacherId: fixtures.teacherLinkedId, maxMarks: 100, passMarks: 40 }] })),
      ).resolves.toMatchObject({ status: 400 })
    })

    it("rejects a section that does not belong to the class", async () => {
      const res = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ classId: fixtures.classSevenId, sectionId: fixtures.sectionAId }))
      expect(res.status).toBe(400)
    })

    it("rejects passMarks above maxMarks and a backwards date range", async () => {
      const badMarks = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ subjects: [{ subjectId: fixtures.matSubjectId, teacherId: fixtures.teacherLinkedId, maxMarks: 50, passMarks: 60 }] }))
      expect(badMarks.status).toBe(400)
      expect(badMarks.body.error.code).toBe("VALIDATION_ERROR")

      const badDates = await adminAgent.post("/api/v1/exams").send(examPayload({ startDate: "2026-09-10" }))
      expect(badDates.status).toBe(400)
    })

    it("rejects an empty subject list and ARCHIVED on create", async () => {
      const empty = await adminAgent.post("/api/v1/exams").send(examPayload({ subjects: [] }))
      expect(empty.status).toBe(400)

      const archived = await adminAgent.post("/api/v1/exams").send(examPayload({ status: "ARCHIVED" }))
      expect(archived.status).toBe(400)
    })

    it("scopes teacher-created exams to their own profile and coverage", async () => {
      const foreign = await teacherAgent
        .post("/api/v1/exams")
        .send(examPayload({ subjects: [{ subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 }] }))
      expect(foreign.status).toBe(403)

      const own = await teacherAgent
        .post("/api/v1/exams")
        .send(examPayload({ subjects: [{ subjectId: fixtures.matSubjectId, teacherId: fixtures.teacherLinkedId, maxMarks: 100, passMarks: 40 }] }))
      expect(own.status).toBe(201)
      expect(own.body.data.subjects[0].teacherId).toBe(fixtures.teacherLinkedId)
    })

    it("forbids a teacher from creating an exam for a subject they do not teach", async () => {
      const res = await teacherAgent
        .post("/api/v1/exams")
        .send(examPayload({ subjects: [{ subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherLinkedId, maxMarks: 100, passMarks: 40 }] }))
      expect(res.status).toBe(403)
    })
  })

  describe("get", () => {
    it("returns the exam detail with its subject list ordered by sortOrder", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const res = await adminAgent.get(`/api/v1/exams/${createdId(created)}`)
      expect(res.status).toBe(200)
      expect(res.body.data.subjects.map((s: { sortOrder: number }) => s.sortOrder)).toEqual([0, 1])
      expect(res.body.data.subjects[0].teacherName).toBe("Tara Teacher")
    })

    it("returns 404 for an unknown or cross-tenant exam", async () => {
      const missing = await adminAgent.get("/api/v1/exams/00000000-0000-4000-8000-000000000099")
      expect(missing.status).toBe(404)

      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const foreign = await otherAgent.get(`/api/v1/exams/${createdId(created)}`)
      expect(foreign.status).toBe(404)
    })
  })

  describe("update (metadata)", () => {
    it("renames a draft exam and moves it to another section", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const id = createdId(created)
      const res = await adminAgent
        .patch(`/api/v1/exams/${id}`)
        .send({ name: "Renamed Term 1", sectionId: fixtures.sectionBId })
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe("Renamed Term 1")
      expect(res.body.data.sectionName).toBe("B")
    })

    it("clears a section via empty string (whole class)", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const res = await adminAgent.patch(`/api/v1/exams/${createdId(created)}`).send({ sectionId: "" })
      expect(res.status).toBe(200)
      expect(res.body.data.sectionName).toBeNull()
    })

    it("forbids editing after publication", async () => {
      const created = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ status: "PUBLISHED" }))
      const res = await adminAgent.patch(`/api/v1/exams/${createdId(created)}`).send({ name: "Too late" })
      expect(res.status).toBe(400)
    })

    it("forbids a teacher from editing an exam they are not on", async () => {
      const created = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ subjects: [{ subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 }] }))
      const res = await teacherAgent.patch(`/api/v1/exams/${createdId(created)}`).send({ name: "Hijack" })
      expect(res.status).toBe(403)
    })
  })

  describe("status", () => {
    it("publishes a draft and sets the publish timestamp once", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const id = createdId(created)
      const first = await adminAgent.patch(`/api/v1/exams/${id}/status`).send({ status: "PUBLISHED" })
      expect(first.status).toBe(200)
      expect(first.body.data.status).toBe("PUBLISHED")
      expect(first.body.data.publishedAt).toBeTruthy()
      const res = await adminAgent.get(`/api/v1/exams/${id}`)
      expect(res.body.data.publishedAt).toBe(first.body.data.publishedAt)
    })

    it("archives a draft and a published exam, rejects a re-publish or a no-op", async () => {
      const draft = await adminAgent.post("/api/v1/exams").send(examPayload())
      const archivedDraft = await adminAgent
        .patch(`/api/v1/exams/${createdId(draft)}/status`)
        .send({ status: "ARCHIVED" })
      expect(archivedDraft.status).toBe(200)
      expect(archivedDraft.body.data.status).toBe("ARCHIVED")

      const published = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ sectionId: fixtures.sectionBId, status: "PUBLISHED" }))
      const archivedPublished = await adminAgent
        .patch(`/api/v1/exams/${createdId(published)}/status`)
        .send({ status: "ARCHIVED" })
      expect(archivedPublished.status).toBe(200)

      const republish = await adminAgent
        .patch(`/api/v1/exams/${createdId(published)}/status`)
        .send({ status: "PUBLISHED" })
      expect(republish.status).toBe(400)
    })

    it("rejects FINAL through the exam-status route (finalize lives under results:publish)", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const res = await adminAgent
        .patch(`/api/v1/exams/${createdId(created)}/status`)
        .send({ status: "FINAL" })
      expect(res.status).toBe(400)
    })

    it("forbids a teacher from changing the status of an exam they are not on", async () => {
      const created = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ subjects: [{ subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 }] }))
      const res = await teacherAgent
        .patch(`/api/v1/exams/${createdId(created)}/status`)
        .send({ status: "PUBLISHED" })
      expect(res.status).toBe(403)
    })
  })

  describe("subjects (replace)", () => {
    it("replaces the subject list in a draft", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const res = await adminAgent.put(`/api/v1/exams/${createdId(created)}/subjects`).send({
        subjects: [
          { subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 },
        ],
      })
      expect(res.status).toBe(200)
      expect(res.body.data.subjects).toHaveLength(1)
      expect(res.body.data.subjects[0].subjectCode).toBe("SCI")
    })

    it("rejects replacing subjects after publication", async () => {
      const created = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ status: "PUBLISHED" }))
      const res = await adminAgent
        .put(`/api/v1/exams/${createdId(created)}/subjects`)
        .send({ subjects: [{ subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 }] })
      expect(res.status).toBe(400)
    })

    it("forbids a teacher from assigning another teacher's subject", async () => {
      const created = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ subjects: [{ subjectId: fixtures.matSubjectId, teacherId: fixtures.teacherLinkedId, maxMarks: 100, passMarks: 40 }] }))
      const res = await teacherAgent.put(`/api/v1/exams/${createdId(created)}/subjects`).send({
        subjects: [
          { subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 },
        ],
      })
      expect(res.status).toBe(403)
    })
  })

  describe("delete", () => {
    it("deletes a draft exam", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const res = await adminAgent.delete(`/api/v1/exams/${createdId(created)}`)
      expect(res.status).toBe(200)
      expect(res.body.data.deleted).toBe(true)
      const after = await adminAgent.get(`/api/v1/exams/${createdId(created)}`)
      expect(after.status).toBe(404)
    })

    it("forbids deleting a published exam", async () => {
      const created = await adminAgent
        .post("/api/v1/exams")
        .send(examPayload({ status: "PUBLISHED" }))
      const res = await adminAgent.delete(`/api/v1/exams/${createdId(created)}`)
      expect(res.status).toBe(400)
    })

    it("returns 404 for a cross-tenant delete", async () => {
      const created = await adminAgent.post("/api/v1/exams").send(examPayload())
      const res = await otherAgent.delete(`/api/v1/exams/${createdId(created)}`)
      expect(res.status).toBe(404)
    })
  })

  describe("schema presence (database-free within suite)", () => {
    it("exposes the phase 6 models on the generated client", () => {
      expect(Object.keys(Prisma.ExamScalarFieldEnum)).toEqual(
        expect.arrayContaining([
          "academicSessionId",
          "examTypeId",
          "classId",
          "sectionId",
          "status",
          "publishedAt",
          "finalizedAt",
        ]),
      )
      expect(Object.keys(Prisma.ExamSubjectScalarFieldEnum)).toEqual(
        expect.arrayContaining(["examId", "subjectId", "teacherId", "maxMarks", "passMarks"]),
      )
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
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
  await prisma.examType.deleteMany()
  await prisma.gradingBand.deleteMany()
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