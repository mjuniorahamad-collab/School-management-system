// Grade-history coverage (database-backed).
//
// THE RULE: a grade is a historical fact. Retiring a grading band or re-routing
// a range must never silently rewrite a grade that was already awarded —
// otherwise saving an unrelated remark re-maps published results.
//
//   - A mark whose score did not change keeps the grade it was given.
//   - A student-level aggregate keeps its grade while the aggregate percentage
//     is unchanged.
//   - A CHANGED score is an explicit regrade: the grade is recomputed from the
//     CURRENT active bands.
//
// DB-backed: runs only when TEST_DATABASE_URL points at a disposable test
// database (the vitest global setup enforces that).

import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { resetTestDatabase } from "./helpers/reset-test-database.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const fixtures = {
  schoolId: "",
  sessionId: "",
  classId: "",
  sectionId: "",
  matSubjectId: "",
  sciSubjectId: "",
  teacherId: "",
  enrollmentId: "",
  adminPassword: "grade-history-secret-123",
}

let examTypeCounter = 0

describe.skipIf(!TEST_DATABASE_URL)("Results grade history (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")

    prisma = new PrismaClient()
    await resetTestDatabase(prisma)

    const school = await prisma.school.create({ data: { name: "Grade History School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Grade History Year",
        code: "GH2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    // A+ 90-100, B 80-89, C 70-79, F 0-69.
    for (const [min, max, grade] of [
      [90, 100, "A+"],
      [80, 89, "B"],
      [70, 79, "C"],
      [0, 69, "F"],
    ] as Array<[number, number, string]>) {
      await prisma.gradingBand.create({
        data: { schoolId: school.id, minPercent: min, maxPercent: max, grade, sortOrder: 100 - max },
      })
    }

    const cls = await prisma.class.create({ data: { schoolId: school.id, name: "8", sortOrder: 8 } })
    fixtures.classId = cls.id
    const section = await prisma.section.create({ data: { classId: cls.id, name: "A" } })
    fixtures.sectionId = section.id

    const mat = await prisma.subject.create({
      data: { schoolId: school.id, code: "MAT", name: "Mathematics" },
    })
    fixtures.matSubjectId = mat.id
    const sci = await prisma.subject.create({
      data: { schoolId: school.id, code: "SCI", name: "Science" },
    })
    fixtures.sciSubjectId = sci.id

    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "T-GH-0001",
        firstName: "Gita",
        lastName: "Grader",
        gender: "FEMALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
        teacherSubjects: { create: [{ subjectId: mat.id }, { subjectId: sci.id }] },
        teacherClasses: { create: [{ classId: cls.id, sectionId: section.id }] },
      },
    })
    fixtures.teacherId = teacher.id

    const superAdminRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const adminUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Grade History Admin",
        email: "gradehistory.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: adminUser.id, schoolId: school.id, roleId: superAdminRole.id, status: "ACTIVE" },
    })

    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "ADM-GH-0001",
        firstName: "Grace",
        lastName: "History",
        gender: "FEMALE",
        dateOfBirth: new Date("2013-01-01T00:00:00.000Z"),
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    const enrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        academicSessionId: session.id,
        classId: cls.id,
        sectionId: section.id,
      },
    })
    fixtures.enrollmentId = enrollment.id

    const login = await adminAgent
      .post("/api/v1/auth/login")
      .send({ email: "gradehistory.admin@example.com", password: fixtures.adminPassword })
    expect(login.status).toBe(200)
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  // ---------------------------------------------------------------- helpers

  /** One exam per exam type is allowed per class/section, so every test gets its own. */
  async function createExam(name: string) {
    examTypeCounter += 1
    const examType = await prisma.examType.create({
      data: {
        schoolId: fixtures.schoolId,
        code: `GH_${examTypeCounter}`,
        name: `Grade History Type ${examTypeCounter}`,
        sortOrder: examTypeCounter,
      },
    })
    const res = await adminAgent.post("/api/v1/exams").send({
      academicSessionId: fixtures.sessionId,
      examTypeId: examType.id,
      name,
      classId: fixtures.classId,
      sectionId: fixtures.sectionId,
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      status: "PUBLISHED",
      subjects: [
        { subjectId: fixtures.matSubjectId, teacherId: fixtures.teacherId, maxMarks: 100, passMarks: 40 },
        { subjectId: fixtures.sciSubjectId, teacherId: fixtures.teacherId, maxMarks: 100, passMarks: 40 },
      ],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const subjects = res.body.data.subjects as Array<{ id: string; subjectCode: string }>
    const mat = subjects.find((s) => s.subjectCode === "MAT")
    const sci = subjects.find((s) => s.subjectCode === "SCI")
    expect(mat).toBeDefined()
    expect(sci).toBeDefined()
    return { id: res.body.data.id as string, matId: mat!.id, sciId: sci!.id }
  }

  async function putMarks(
    examId: string,
    examSubjectId: string,
    obtainedMarks: number,
    remarks: string | null = null,
  ) {
    const res = await adminAgent
      .put(`/api/v1/results/exams/${examId}/subjects/${examSubjectId}/marks`)
      .send({ rows: [{ enrollmentId: fixtures.enrollmentId, obtainedMarks, remarks }] })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
  }

  async function readStoredResult(examId: string) {
    return prisma.examResult.findFirstOrThrow({
      where: { examId, enrollmentId: fixtures.enrollmentId },
      include: { marks: true },
    })
  }

  /** The grade the CURRENTLY active bands award for the given percentage. */
  async function currentBandGrade(percent: number): Promise<string | null> {
    const band = await prisma.gradingBand.findFirst({
      where: {
        schoolId: fixtures.schoolId,
        isActive: true,
        minPercent: { lte: percent },
        maxPercent: { gte: percent },
      },
      orderBy: { minPercent: "desc" },
    })
    return band?.grade ?? null
  }

  /**
   * Retires the active band covering 85% and puts a differently graded band on
   * (almost) the same range — the "the school re-routes its grading scale"
   * scenario. The new band starts one percent later because a retired band
   * keeps its range forever (`minPercent` is unique per school).
   */
  async function rerouteBBand(newGrade: string): Promise<void> {
    const band = await prisma.gradingBand.findFirstOrThrow({
      where: {
        schoolId: fixtures.schoolId,
        isActive: true,
        minPercent: { lte: 85 },
        maxPercent: { gte: 85 },
      },
    })
    const deactivated = await adminAgent
      .patch(`/api/v1/grading-bands/${band.id}`)
      .send({ isActive: false })
    expect(deactivated.status, JSON.stringify(deactivated.body)).toBe(200)

    const created = await adminAgent.post("/api/v1/grading-bands").send({
      minPercent: band.minPercent + 1,
      maxPercent: band.maxPercent,
      grade: newGrade,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
  }

  // ------------------------------------------------------------------ tests

  it("keeps the awarded grade when the same score is saved again after the bands changed", async () => {
    const exam = await createExam("History Exam A")
    await putMarks(exam.id, exam.matId, 88)
    await putMarks(exam.id, exam.sciId, 84)

    const before = await readStoredResult(exam.id)
    const awarded = await currentBandGrade(88)
    expect(awarded).not.toBeNull()
    expect(before.marks.find((m) => m.examSubjectId === exam.matId)?.grade).toBe(awarded)
    expect(before.marks.find((m) => m.examSubjectId === exam.sciId)?.grade).toBe(awarded)
    expect(before.grade).toBe(awarded)

    // The school re-routes the 80-89 band to a different letter.
    await rerouteBBand("B2")
    expect(await currentBandGrade(88)).toBe("B2")

    // Saving the SAME scores again must not re-map the awarded grades.
    await putMarks(exam.id, exam.matId, 88)
    await putMarks(exam.id, exam.sciId, 84)

    const after = await readStoredResult(exam.id)
    expect(after.marks.find((m) => m.examSubjectId === exam.matId)?.grade).toBe(awarded)
    expect(after.marks.find((m) => m.examSubjectId === exam.sciId)?.grade).toBe(awarded)
    expect(after.grade).toBe(awarded)
  })

  it("regrades a mark whose score changed and keeps the unchanged mark's grade", async () => {
    const exam = await createExam("History Exam B")
    await putMarks(exam.id, exam.matId, 88)
    await putMarks(exam.id, exam.sciId, 84)
    const awarded = await currentBandGrade(88)

    // The school re-routes the 80-89 band to a different letter.
    await rerouteBBand("B3")
    const rerouted = await currentBandGrade(88)
    expect(rerouted).not.toBe(awarded)
    const topBand = await currentBandGrade(95)

    // A CHANGED score is an explicit regrade against the current bands.
    await putMarks(exam.id, exam.matId, 95)
    await putMarks(exam.id, exam.sciId, 84)

    const after = await readStoredResult(exam.id)
    // 95% → the 90-100 band.
    expect(after.marks.find((m) => m.examSubjectId === exam.matId)?.grade).toBe(topBand)
    // 84% did not change → the awarded grade survives the re-routed band.
    expect(after.marks.find((m) => m.examSubjectId === exam.sciId)?.grade).toBe(awarded)
    // (95 + 84) / 200 = 89.5% → 90 → the 90-100 band. The total moved, so the
    // aggregate is an explicit regrade.
    expect(after.grade).toBe(topBand)
  })

  it("keeps the aggregate grade when finalizing an exam whose scores did not change", async () => {
    const exam = await createExam("History Exam C")
    await putMarks(exam.id, exam.matId, 88)
    await putMarks(exam.id, exam.sciId, 84)
    const awarded = await currentBandGrade(88)

    await rerouteBBand("B4")
    expect(await currentBandGrade(88)).not.toBe(awarded)

    const finalized = await adminAgent.post(`/api/v1/results/exams/${exam.id}/finalize`)
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(200)

    const after = await readStoredResult(exam.id)
    expect(after.grade).toBe(awarded)
    expect(after.marks.find((m) => m.examSubjectId === exam.matId)?.grade).toBe(awarded)
  })

  it("keeps a mark's grade when only its remark changes", async () => {
    const exam = await createExam("History Exam D")
    await putMarks(exam.id, exam.matId, 88)
    const awarded = await currentBandGrade(88)

    await rerouteBBand("B5")
    expect(await currentBandGrade(88)).not.toBe(awarded)

    const res = await adminAgent
      .put(`/api/v1/results/exams/${exam.id}/subjects/${exam.matId}/marks`)
      .send({ rows: [{ enrollmentId: fixtures.enrollmentId, obtainedMarks: 88, remarks: "Nice work" }] })
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const after = await readStoredResult(exam.id)
    const mark = after.marks.find((m) => m.examSubjectId === exam.matId)
    expect(mark?.grade).toBe(awarded)
    expect(mark?.remarks).toBe("Nice work")
  })
})
