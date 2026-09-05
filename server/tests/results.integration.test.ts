import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
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
  examTypeId: string
  classSixId: string
  sectionAId: string
  sectionBId: string
  matSubjectId: string
  sciSubjectId: string
  teacherLinkedId: string
  teacherOtherId: string
  studentAId: string
  enrollmentAId: string
  studentBId: string
  enrollmentBId: string
  studentCId: string
  enrollmentCId: string
  crossSectionEnrollmentId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  otherSchoolId: "",
  sessionId: "",
  examTypeId: "",
  classSixId: "",
  sectionAId: "",
  sectionBId: "",
  matSubjectId: "",
  sciSubjectId: "",
  teacherLinkedId: "",
  teacherOtherId: "",
  studentAId: "",
  enrollmentAId: "",
  studentBId: "",
  enrollmentBId: "",
  studentCId: "",
  enrollmentCId: "",
  crossSectionEnrollmentId: "",
  adminPassword: "results-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Results API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const otherAgent = request.agent(app)
  const teacherAgent = request.agent(app)
  const principalAgent = request.agent(app)
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

    const school = await prisma.school.create({ data: { name: "Results School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Results Year",
        code: "RS2026",
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

    const bands: Array<[number, number, string]> = [
      [90, 100, "A+"],
      [80, 89, "A"],
      [70, 79, "B"],
      [60, 69, "C"],
      [50, 59, "D"],
      [0, 49, "F"],
    ]
    for (const [min, max, grade] of bands) {
      await prisma.gradingBand.create({
        data: { schoolId: school.id, minPercent: min, maxPercent: max, grade, sortOrder: 100 - max },
      })
    }

    const classSix = await prisma.class.create({
      data: { schoolId: school.id, name: "Six", sortOrder: 6 },
    })
    fixtures.classSixId = classSix.id
    const sectionA = await prisma.section.create({ data: { classId: classSix.id, name: "A" } })
    fixtures.sectionAId = sectionA.id
    const sectionB = await prisma.section.create({ data: { classId: classSix.id, name: "B" } })
    fixtures.sectionBId = sectionB.id

    const mat = await prisma.subject.create({
      data: { schoolId: school.id, code: "MAT", name: "Mathematics" },
    })
    fixtures.matSubjectId = mat.id
    const sci = await prisma.subject.create({
      data: { schoolId: school.id, code: "SCI", name: "Science" },
    })
    fixtures.sciSubjectId = sci.id

    const superRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })
    const principalRole = await prisma.role.create({
      data: { name: "PRINCIPAL", description: "Test principal" },
    })
    const noPermsRole = await prisma.role.create({
      data: { name: "ACCOUNTANT", description: "Test role without result permissions" },
    })

    await grantPermissions(prisma, teacherRole.id, [
      "exams:view",
      "results:view",
      "results:update",
    ])
    await grantPermissions(prisma, principalRole.id, [
      "exams:view",
      "results:view",
      "results:publish",
    ])

    await createUser(prisma, "Results Admin", "results.admin@example.com", fixtures.adminPassword, superRole.id, school.id)
    await createUser(prisma, "Linked Teacher", "results.linked@example.com", "linked-secret-123", teacherRole.id, school.id)
    await createUser(prisma, "Principal", "results.principal@example.com", "principal-secret-123", principalRole.id, school.id)
    await createUser(prisma, "No Perms", "results.noperms@example.com", "noperms-secret-123", noPermsRole.id, school.id)

    const linkedUser = await prisma.user.findUniqueOrThrow({ where: { email: "results.linked@example.com" } })
    fixtures.teacherLinkedId = (
      await prisma.teacher.create({
        data: {
          schoolId: school.id,
          employeeId: "T-RS-0001",
          firstName: "Tara",
          lastName: "Teacher",
          gender: "FEMALE",
          designation: "Class Teacher",
          joiningDate: new Date("2026-04-01T00:00:00.000Z"),
          status: "ACTIVE",
          userId: linkedUser.id,
          teacherSubjects: { create: { subjectId: mat.id } },
          teacherClasses: { create: { classId: classSix.id, sectionId: sectionA.id } },
        },
      })
    ).id
    fixtures.teacherOtherId = (
      await prisma.teacher.create({
        data: {
          schoolId: school.id,
          employeeId: "T-RS-0002",
          firstName: "Helena",
          lastName: "Other",
          gender: "FEMALE",
          designation: "Senior Teacher",
          joiningDate: new Date("2026-04-01T00:00:00.000Z"),
          status: "ACTIVE",
          teacherSubjects: { create: { subjectId: sci.id } },
          teacherClasses: { create: { classId: classSix.id, sectionId: sectionA.id } },
        },
      })
    ).id

    const results: Array<{ firstName: string; admission: string }> = [
      { firstName: "Alpha", admission: "ADM-EX-2026-001" },
      { firstName: "Bravo", admission: "ADM-EX-2026-002" },
      { firstName: "Charlie", admission: "ADM-EX-2026-003" },
      { firstName: "Delta", admission: "ADM-EX-2026-004" },
    ]
    const studentIds: string[] = []
    const enrollmentIds: string[] = []
    for (const seed of results) {
      const student = await prisma.student.create({
        data: {
          schoolId: school.id,
          admissionNumber: seed.admission,
          firstName: seed.firstName,
          lastName: "Student",
          gender: "MALE",
          dateOfBirth: new Date("2013-01-01T00:00:00.000Z"),
          admissionDate: new Date("2026-04-01T00:00:00.000Z"),
          status: "ACTIVE",
        },
      })
      studentIds.push(student.id)
      const enrollment = await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicSessionId: session.id,
          classId: classSix.id,
          sectionId: sectionA.id,
        },
      })
      enrollmentIds.push(enrollment.id)
    }
    fixtures.studentAId = studentIds[0]
    fixtures.enrollmentAId = enrollmentIds[0]
    fixtures.studentBId = studentIds[1]
    fixtures.enrollmentBId = enrollmentIds[1]
    fixtures.studentCId = studentIds[2]
    fixtures.enrollmentCId = enrollmentIds[2]
    fixtures.crossSectionEnrollmentId = enrollmentIds[3]
    await prisma.studentEnrollment.update({
      where: { id: fixtures.crossSectionEnrollmentId },
      data: { sectionId: sectionB.id },
    })

    const otherSchool = await prisma.school.create({ data: { name: "Other Results School" } })
    fixtures.otherSchoolId = otherSchool.id
    const otherAdmin = await prisma.user.create({
      data: {
        name: "Other Admin",
        email: "results.other@example.com",
        passwordHash: hashPassword("other-secret-123"),
        status: "ACTIVE",
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: otherAdmin.id, schoolId: otherSchool.id, roleId: superRole.id, status: "ACTIVE" },
    })

    await login(adminAgent, "results.admin@example.com", fixtures.adminPassword)
    await login(otherAgent, "results.other@example.com", "other-secret-123")
    await login(teacherAgent, "results.linked@example.com", "linked-secret-123")
    await login(principalAgent, "results.principal@example.com", "principal-secret-123")
    await login(noPermsAgent, "results.noperms@example.com", "noperms-secret-123")
  })

  beforeEach(async () => {
    await prisma.examMark.deleteMany()
    await prisma.examResult.deleteMany()
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
      status: "PUBLISHED",
      subjects: [
        { subjectId: fixtures.matSubjectId, teacherId: fixtures.teacherLinkedId, maxMarks: 100, passMarks: 40 },
        { subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherOtherId, maxMarks: 50, passMarks: 25 },
      ],
      ...overrides,
    }
  }

  async function createExam(overrides: Record<string, unknown> = {}) {
    const res = await adminAgent.post("/api/v1/exams").send(examPayload(overrides))
    expect(res.status).toBe(201)
    return res.body.data as {
      id: string
      subjects: Array<{ id: string; subjectCode: string; canEdit?: boolean; teacherId: string }>
      status: string
    }
  }

  function subjectByCode(
    exam: { subjects: Array<{ subjectCode: string }> },
    code: string,
  ) {
    const found = exam.subjects.find((s) => s.subjectCode === code)
    expect(found).toBeDefined()
    return found as { id: string }
  }

  interface MarkRow {
    enrollmentId: string
    obtainedMarks?: number | null
    isAbsent?: boolean
  }

  function putMarks(
    agent: ReturnType<typeof request.agent>,
    examId: string,
    examSubjectId: string,
    rows: MarkRow[],
  ) {
    return agent
      .put(`/api/v1/results/exams/${examId}/subjects/${examSubjectId}/marks`)
      .send({ rows })
  }

  function fullMarks() {
    return [
      { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 80 },
      { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 50 },
      { enrollmentId: fixtures.enrollmentCId, obtainedMarks: 90 },
    ]
  }

  describe("sheet", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/results/exams/deadbeef/sheet")
      expect(res.status).toBe(401)
    })

    it("denies an authenticated user without results:view", async () => {
      const exam = await createExam()
      const res = await noPermsAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      expect(res.status).toBe(403)
    })

    it("returns the roster with empty marks for a published exam", async () => {
      const exam = await createExam()
      const res = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.exam.className).toBe("Six")
      expect(data.exam.sectionName).toBe("A")
      expect(data.exam.status).toBe("PUBLISHED")
      expect(data.canFinalize).toBe(true)
      expect(data.canReopen).toBe(false)
      expect(data.subjects).toHaveLength(2)
      expect(data.subjects.every((subject: { canEdit: boolean }) => subject.canEdit)).toBe(true)
      expect(data.rows).toHaveLength(3)
      const first = data.rows[0]
      expect(first.studentName).toBe("Alpha Student")
      expect(first.marks).toHaveLength(2)
      expect(first.marks.every((mark: { obtainedMarks: string | null }) => mark.obtainedMarks === null)).toBe(true)
      expect(first.isComplete).toBe(false)
      expect(first.rank).toBeNull()
      expect(data.pagination.total).toBe(3)
    })

    it("returns 404 when the exam belongs to another tenant", async () => {
      const exam = await createExam()
      const res = await otherAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      expect(res.status).toBe(404)
    })
  })

  describe("teacher scoping", () => {
    it("restricts the sheet to the teacher's own subjects but shows the full roster", async () => {
      const exam = await createExam()
      const res = await teacherAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.subjects.map((s: { subjectCode: string }) => s.subjectCode)).toEqual(["MAT"])
      expect(data.subjects[0].canEdit).toBe(true)
      expect(data.rows).toHaveLength(3)
    })
  })

  describe("marks entry", () => {
    it("saves marks for one subject and derives percentage/grade/pass cells", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      const res = await putMarks(adminAgent, exam.id, mat.id, fullMarks())
      expect(res.status).toBe(200)
      expect(res.body.data.saved).toBe(3)

      const sheet = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      const alpha = sheet.body.data.rows.find((row: { studentName: string }) => row.studentName === "Alpha Student")
      const alphaMat = alpha.marks.find((mark: { examSubjectId: string }) => mark.examSubjectId === mat.id)
      expect(alphaMat.obtainedMarks).toBe("80")
      expect(alphaMat.percentage).toBe("80")
      expect(alphaMat.grade).toBe("A")
      expect(alphaMat.isPass).toBe(true)
      // One subject in → totals are withheld until the set is complete.
      expect(alpha.totalObtained).toBeNull()
      expect(alpha.isComplete).toBe(false)
    })

    it("aggregates a complete set with totals, overall grade, and pass", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      const sci = subjectByCode(exam, "SCI")
      await putMarks(adminAgent, exam.id, mat.id, fullMarks())
      await putMarks(adminAgent, exam.id, sci.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 40 },
        { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 30 },
        { enrollmentId: fixtures.enrollmentCId, obtainedMarks: 20 },
      ])

      const sheet = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      const byName = new Map(
        sheet.body.data.rows.map((row: { studentName: string }) => [row.studentName, row]),
      )
      const alpha = byName.get("Alpha Student")
      // 80/100 + 40/50 = 120/150 = 80% → A, pass.
      expect(alpha.isComplete).toBe(true)
      expect(alpha.totalObtained).toBe("120")
      expect(alpha.totalMaxMarks).toBe("150")
      expect(alpha.totalPercentage).toBe("80")
      expect(alpha.grade).toBe("A")
      expect(alpha.isPass).toBe(true)

      // Charlie fails Science (20 < 25): overall result is a fail.
      const charlie = byName.get("Charlie Student")
      expect(charlie.isComplete).toBe(true)
      expect(charlie.totalPercentage).toBeCloseTo(73.33, 2)
      expect(charlie.isPass).toBe(false)

      // Bravo: 50 + 30 = 80/150 = 53.33 → D, pass.
      const bravo = byName.get("Bravo Student")
      expect(bravo.grade).toBe("D")
      expect(bravo.isPass).toBe(true)
    })

    it("never penalizes an absent subject as zero", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      const sci = subjectByCode(exam, "SCI")
      await putMarks(adminAgent, exam.id, mat.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 80 },
      ])
      await putMarks(adminAgent, exam.id, sci.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: null, isAbsent: true },
      ])

      const sheet = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      const alpha = sheet.body.data.rows.find((row: { studentName: string }) => row.studentName === "Alpha Student")
      const alphaSci = alpha.marks.find((mark: { examSubjectId: string }) => mark.examSubjectId === sci.id)
      expect(alphaSci.isAbsent).toBe(true)
      expect(alphaSci.obtainedMarks).toBeNull()
      expect(alphaSci.percentage).toBeNull()
      // Incomplete set → excluded from aggregates and ranking.
      expect(alpha.isComplete).toBe(false)
      expect(alpha.totalObtained).toBeNull()
    })

    it("clears a previously entered mark when a cell is blanked", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      await putMarks(adminAgent, exam.id, mat.id, fullMarks())
      const cleared = await putMarks(adminAgent, exam.id, mat.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: null },
      ])
      expect(cleared.status).toBe(200)
      const sheet = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      const alpha = sheet.body.data.rows.find((row: { studentName: string }) => row.studentName === "Alpha Student")
      expect(alpha.marks[0].obtainedMarks).toBeNull()
    })

    it("rejects marks for a draft or finalized exam", async () => {
      const draft = await createExam({ status: "DRAFT" })
      const mat = subjectByCode(draft, "MAT")
      const onDraft = await putMarks(adminAgent, draft.id, mat.id, fullMarks())
      expect(onDraft.status).toBe(400)

      const finalized = await createExam({ sectionId: fixtures.sectionBId })
      await adminAgent.post(`/api/v1/results/exams/${finalized.id}/finalize`)
      const matFinal = subjectByCode(finalized, "MAT")
      const onFinal = await putMarks(adminAgent, finalized.id, matFinal.id, fullMarks())
      expect(onFinal.status).toBe(400)
    })

    it("rejects an unknown subject and out-of-cohort students", async () => {
      const exam = await createExam()
      const wrong = await putMarks(adminAgent, exam.id, "00000000-0000-4000-8000-000000000123", [{ enrollmentId: fixtures.enrollmentAId, obtainedMarks: 50 }])
      expect(wrong.status).toBe(404)

      const outside = await putMarks(adminAgent, exam.id, subjectByCode(exam, "MAT").id, [
        { enrollmentId: fixtures.crossSectionEnrollmentId, obtainedMarks: 50 },
      ])
      expect(outside.status).toBe(400)
    })

    it("denies a teacher from editing another teacher's subject and a principal without results:update", async () => {
      const exam = await createExam()
      const sci = subjectByCode(exam, "SCI")
      const byTeacher = await putMarks(teacherAgent, exam.id, sci.id, fullMarks())
      expect(byTeacher.status).toBe(403)

      const mat = subjectByCode(exam, "MAT")
      const byPrincipal = await putMarks(principalAgent, exam.id, mat.id, fullMarks())
      expect(byPrincipal.status).toBe(403)
    })

    it("allows a teacher to enter marks for their own subject", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      const res = await putMarks(teacherAgent, exam.id, mat.id, fullMarks())
      expect(res.status).toBe(200)
      expect(res.body.data.saved).toBe(3)
    })
  })

  describe("finalize", () => {
    it("rejects finalizing a draft exam", async () => {
      const draft = await createExam({ status: "DRAFT" })
      const res = await adminAgent.post(`/api/v1/results/exams/${draft.id}/finalize`)
      expect(res.status).toBe(400)
    })

    it("freezes a published exam and computes competition ranks", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      const sci = subjectByCode(exam, "SCI")
      // A: 100%, B: 100% (tie), C: 60%.
      await putMarks(adminAgent, exam.id, mat.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 100 },
        { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 100 },
        { enrollmentId: fixtures.enrollmentCId, obtainedMarks: 60 },
      ])
      await putMarks(adminAgent, exam.id, sci.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 50 },
        { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 50 },
        { enrollmentId: fixtures.enrollmentCId, obtainedMarks: 30 },
      ])

      const before = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      expect(before.body.data.canFinalize).toBe(true)

      const res = await adminAgent.post(`/api/v1/results/exams/${exam.id}/finalize`)
      expect(res.status).toBe(200)
      expect(res.body.data.finalized).toBe(true)
      expect(res.body.data.ranked).toBe(3)

      const sheet = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      const data = sheet.body.data
      expect(data.exam.status).toBe("FINAL")
      expect(data.exam.finalizedAt).toBeTruthy()
      expect(data.canFinalize).toBe(false)
      expect(data.canReopen).toBe(true)
      expect(data.subjects.every((subject: { canEdit: boolean }) => subject.canEdit === false)).toBe(true)

      const byName = new Map(
        data.rows.map((row: { studentName: string }) => [row.studentName, row]),
      )
      expect(byName.get("Alpha Student").rank).toBe(1)
      expect(byName.get("Bravo Student").rank).toBe(1)
      expect(byName.get("Charlie Student").rank).toBe(3)
      expect(byName.get("Charlie Student").totalPercentage).toBe("60")
    })

    it("excludes incomplete students from ranking", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      const sci = subjectByCode(exam, "SCI")
      await putMarks(adminAgent, exam.id, mat.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 100 },
        { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 90 },
        { enrollmentId: fixtures.enrollmentCId, obtainedMarks: 95 },
      ])
      await putMarks(adminAgent, exam.id, sci.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 50 },
        { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 45 },
      ])
      await adminAgent.post(`/api/v1/results/exams/${exam.id}/finalize`)

      const sheet = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      const byName = new Map(
        sheet.body.data.rows.map((row: { studentName: string }) => [row.studentName, row]),
      )
      expect(byName.get("Alpha Student").rank).toBe(1)
      expect(byName.get("Bravo Student").rank).toBe(2)
      expect(byName.get("Charlie Student").isComplete).toBe(false)
      expect(byName.get("Charlie Student").rank).toBeNull()
    })

    it("denies finalize to a teacher but allows it for a principal", async () => {
      const exam = await createExam()
      const byTeacher = await teacherAgent.post(`/api/v1/results/exams/${exam.id}/finalize`)
      expect(byTeacher.status).toBe(403)

      const byPrincipal = await principalAgent.post(`/api/v1/results/exams/${exam.id}/finalize`)
      expect(byPrincipal.status).toBe(200)
    })
  })

  describe("reopen", () => {
    it("rejects reopening a draft or published exam", async () => {
      const draft = await createExam({ status: "DRAFT" })
      const onDraft = await adminAgent.post(`/api/v1/results/exams/${draft.id}/reopen`)
      expect(onDraft.status).toBe(400)

      const published = await createExam({ sectionId: fixtures.sectionBId })
      const onPublished = await adminAgent.post(`/api/v1/results/exams/${published.id}/reopen`)
      expect(onPublished.status).toBe(400)
    })

    it("reopens a finalized exam, clears ranks, and allows re-entry and re-finalize", async () => {
      const exam = await createExam()
      const mat = subjectByCode(exam, "MAT")
      const sci = subjectByCode(exam, "SCI")
      await putMarks(adminAgent, exam.id, mat.id, fullMarks())
      await putMarks(adminAgent, exam.id, sci.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 40 },
        { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 30 },
        { enrollmentId: fixtures.enrollmentCId, obtainedMarks: 20 },
      ])
      await adminAgent.post(`/api/v1/results/exams/${exam.id}/finalize`)

      const res = await principalAgent.post(`/api/v1/results/exams/${exam.id}/reopen`)
      expect(res.status).toBe(200)
      expect(res.body.data.reopened).toBe(true)

      const reopened = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      expect(reopened.body.data.exam.status).toBe("PUBLISHED")
      expect(reopened.body.data.exam.finalizedAt).toBeNull()
      expect(reopened.body.data.rows.every((row: { rank: number | null }) => row.rank === null)).toBe(true)
      expect(reopened.body.data.canFinalize).toBe(true)

      // Correct the grade, then re-finalize: rank recomputes from the new totals.
      const corrected = await putMarks(adminAgent, exam.id, mat.id, [
        { enrollmentId: fixtures.enrollmentAId, obtainedMarks: 50 },
        { enrollmentId: fixtures.enrollmentBId, obtainedMarks: 90 },
        { enrollmentId: fixtures.enrollmentCId, obtainedMarks: 80 },
      ])
      expect(corrected.status).toBe(200)
      await adminAgent.post(`/api/v1/results/exams/${exam.id}/finalize`)

      const sheet = await adminAgent.get(`/api/v1/results/exams/${exam.id}/sheet`)
      const byName = new Map(
        sheet.body.data.rows.map((row: { studentName: string }) => [row.studentName, row]),
      )
      expect(byName.get("Alpha Student").rank).toBe(3)
      expect(byName.get("Bravo Student").rank).toBe(1)
      expect(byName.get("Charlie Student").rank).toBe(2)
    })
  })
})

async function grantPermissions(
  prisma: PrismaClient,
  roleId: string,
  codes: string[],
): Promise<void> {
  for (const code of codes) {
    const [resource, action] = code.split(":")
    const permission = await prisma.permission.upsert({
      where: { code },
      create: { code, resource, action, description: `Test ${code}` },
      update: {},
    })
    await prisma.rolePermission.create({
      data: { roleId, permissionId: permission.id },
    })
  }
}

async function createUser(
  prisma: PrismaClient,
  name: string,
  email: string,
  password: string,
  roleId: string,
  schoolId: string,
): Promise<void> {
  const user = await prisma.user.create({
    data: { name, email, passwordHash: hashPassword(password), status: "ACTIVE" },
  })
  await prisma.tenantMembership.create({
    data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
  })
}

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