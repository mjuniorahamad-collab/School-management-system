import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { REPORT_CARD_DRAFT_EXISTS } from "../src/lib/ApiError.js"
import { REPORT_CARD_SIGNATORIES_SETTING_KEY } from "../src/lib/school-settings.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"
import {
  enrollmentPeriodOverlapError,
  isEnrollmentPeriodOverlapError,
} from "../src/modules/enrollment-history/enrollment-history.errors.js"

// DB-gated: runs only when TEST_DATABASE_URL points at a disposable database.
// Authoring note — this suite was written alongside the Phase 1B correctness
// fixes and has NOT been executed in this environment (TEST_DATABASE_URL unset),
// so it must be run and, where needed, adjusted against a real database before
// the fixes are considered closed.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

interface Fixtures {
  schoolId: string
  sessionId: string
  classId: string
  sectionId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  sessionId: "",
  classId: "",
  sectionId: "",
  adminPassword: "foundation-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Report-card foundation concurrency (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const studentA = { id: "" }

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

    const school = await prisma.school.create({ data: { name: "Foundation School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Foundation Year",
        code: "FY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    const cls = await prisma.class.create({ data: { schoolId: school.id, name: "6", sortOrder: 6 } })
    fixtures.classId = cls.id
    const section = await prisma.section.create({ data: { classId: cls.id, name: "A" } })
    fixtures.sectionId = section.id

    const sA = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "ADM-FY-0001",
        firstName: "Ada",
        lastName: "Lovelace",
        dateOfBirth: new Date("2015-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        status: "ACTIVE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    })
    studentA.id = sA.id
    const enrollment = await prisma.studentEnrollment.create({
      data: {
        studentId: sA.id,
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
      },
    })
    await prisma.studentEnrollmentPeriod.create({
      data: {
        schoolId: school.id,
        studentId: sA.id,
        academicSessionId: fixtures.sessionId,
        enrollmentId: enrollment.id,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
        effectiveTo: null,
        source: "AUTHORED",
      },
    })

    const superAdminRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const adminUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Foundation Admin",
        email: "foundation.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: superAdminRole.id } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: adminUser.id, schoolId: school.id, roleId: superAdminRole.id, status: "ACTIVE" },
    })

    const loginRes = await adminAgent
      .post("/api/v1/auth/login")
      .send({ email: "foundation.admin@example.com", password: fixtures.adminPassword })
    expect(loginRes.status).toBe(200)
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  async function openRegister(date: string): Promise<string> {
    const res = await adminAgent.post("/api/v1/attendance/registers").send({
      academicSessionId: fixtures.sessionId,
      classId: fixtures.classId,
      sectionId: fixtures.sectionId,
      date,
    })
    expect(res.status).toBe(201)
    return res.body.data.id as string
  }

  async function mark(date: string): Promise<void> {
    const res = await adminAgent.post("/api/v1/attendance").send({
      academicSessionId: fixtures.sessionId,
      classId: fixtures.classId,
      sectionId: fixtures.sectionId,
      date,
      studentId: studentA.id,
      status: "PRESENT",
    })
    expect(res.status).toBe(201)
  }

  it("maps a real exclusion-constraint violation to the safe 400 domain error", async () => {
    // A second period for the same student+session that overlaps the existing
    // one must be rejected by the EXCLUDE constraint, and our matcher must
    // recognise the raw database error (so the service returns 400, not 500).
    let caught: unknown
    try {
      await prisma.studentEnrollmentPeriod.create({
        data: {
          schoolId: fixtures.schoolId,
          studentId: studentA.id,
          academicSessionId: fixtures.sessionId,
          enrollmentId: (
            await prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: studentA.id } })
          ).id,
          classId: fixtures.classId,
          sectionId: fixtures.sectionId,
          effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
          effectiveTo: null,
          source: "AUTHORED",
        },
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeDefined()
    expect(isEnrollmentPeriodOverlapError(caught)).toBe(true)
    const mapped = enrollmentPeriodOverlapError()
    expect(mapped.statusCode).toBe(400)
    expect(mapped.code).toBe("BAD_REQUEST")
  })

  it("blocks attendance-record mutations on a SUBMITTED register (409)", async () => {
    const registerId = await openRegister("2026-05-04")
    const submit = await adminAgent.post(`/api/v1/attendance/registers/${registerId}/submit`)
    expect(submit.status).toBe(200)
    expect(submit.body.data.status).toBe("SUBMITTED")

    const blocked = await adminAgent.post("/api/v1/attendance").send({
      academicSessionId: fixtures.sessionId,
      classId: fixtures.classId,
      sectionId: fixtures.sectionId,
      date: "2026-05-04",
      studentId: studentA.id,
      status: "PRESENT",
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe("ATTENDANCE_REGISTER_LOCKED")
  })

  it("does not verify over a gap and verifies atomically once complete", async () => {
    // Gap: a SUBMITTED register with a missing definitive record must not be
    // verified; the failed attempt leaves it SUBMITTED (never silently verified
    // over an expected student's missing row).
    const gapRegisterId = await openRegister("2026-05-05")
    await adminAgent.post(`/api/v1/attendance/registers/${gapRegisterId}/submit`)

    const premature = await adminAgent.post(
      `/api/v1/attendance/registers/${gapRegisterId}/verify`,
    )
    expect(premature.status).toBe(400)
    const afterPremature = await prisma.attendanceRegister.findUniqueOrThrow({
      where: { id: gapRegisterId },
    })
    expect(afterPremature.status).toBe("SUBMITTED")

    // Complete: records are frozen at submit (a SUBMITTED register rejects
    // mutations — see the sibling 409 test), so a register must be marked BEFORE
    // it is submitted. Once complete, verification succeeds atomically.
    const completeRegisterId = await openRegister("2026-05-07")
    await mark("2026-05-07")
    await adminAgent.post(`/api/v1/attendance/registers/${completeRegisterId}/submit`)
    const verified = await adminAgent.post(
      `/api/v1/attendance/registers/${completeRegisterId}/verify`,
    )
    expect(verified.status).toBe(200)
    expect(verified.body.data.status).toBe("VERIFIED")
  })

  it("reopens a VERIFIED register when the date's calendar day changes", async () => {
    const date = "2026-05-06"
    const registerId = await openRegister(date)
    await mark(date)
    await adminAgent.post(`/api/v1/attendance/registers/${registerId}/submit`)
    const verified = await adminAgent.post(`/api/v1/attendance/registers/${registerId}/verify`)
    expect(verified.status).toBe(200)

    const created = await adminAgent.post("/api/v1/academic-calendar/days").send({
      academicSessionId: fixtures.sessionId,
      date,
      kind: "NON_INSTRUCTIONAL",
      instructionalValue: 0,
      label: "Holiday",
    })
    expect(created.status).toBe(201)

    const reopened = await prisma.attendanceRegister.findUniqueOrThrow({ where: { id: registerId } })
    expect(reopened.status).toBe("OPEN")
  })

  it("reopens VERIFIED registers when the working-weekday set changes", async () => {
    const date = "2026-05-08" // Friday

    // Precondition: author a confirmed working week that INCLUDES Friday, so the
    // date is authoritatively instructional before the flip. An absent calendar
    // leaves every date UNKNOWN and never instructional (docs §3/§4), so the
    // "Friday was instructional" premise must be established explicitly — a
    // working-weekday *set change* (MON..FRI -> MON..THU) is what reopens.
    const authored = await adminAgent.put(`/api/v1/academic-calendar/${fixtures.sessionId}`).send({
      workingWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    })
    expect(authored.status).toBe(200)
    expect(authored.body.data.workingWeekdays).toContain("FRIDAY")

    const registerId = await openRegister(date)
    await mark(date)
    await adminAgent.post(`/api/v1/attendance/registers/${registerId}/submit`)
    const verified = await adminAgent.post(`/api/v1/attendance/registers/${registerId}/verify`)
    expect(verified.status).toBe(200)
    expect(verified.body.data.status).toBe("VERIFIED")

    // Mon–Thu only: Friday is no longer instructional, so the register reopens.
    const upsert = await adminAgent.put(`/api/v1/academic-calendar/${fixtures.sessionId}`).send({
      workingWeekdays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
    })
    expect(upsert.status).toBe(200)
    expect(upsert.body.data.workingWeekdays).not.toContain("FRIDAY")

    const reopened = await prisma.attendanceRegister.findUniqueOrThrow({ where: { id: registerId } })
    expect(reopened.status).toBe("OPEN")
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Report-card generation serialization (A3).
  //
  // Generation INSERTs a DRAFT and therefore takes no ReportCard scope lock —
  // that lock only covers rows that already exist, and a scope with no rows yet
  // has nothing to lock. Concurrent generations are serialized on the
  // always-existing StudentEnrollment anchor row instead. This suite proves the
  // real-PostgreSQL behaviour the DB-free unit tests cannot: two concurrent
  // requests for one scope yield exactly one new version and one conflict, and
  // the winner's supersession lineage is never corrupted by the loser.
  //
  // NOTE: DB-gated (`TEST_DATABASE_URL`) and NOT executed during the A3 change;
  // it must be run against a disposable database before the change is closed.
  // ──────────────────────────────────────────────────────────────────────────
  describe("report-card generation concurrency", () => {
    let enrollmentId = ""
    let examId = ""

    beforeAll(async () => {
      if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")

      const examType = await prisma.examType.create({
        data: { schoolId: fixtures.schoolId, code: "FINAL", name: "Final", sortOrder: 1 },
      })
      const subject = await prisma.subject.create({
        data: { schoolId: fixtures.schoolId, code: "MATH", name: "Mathematics", sortOrder: 1 },
      })
      const teacher = await prisma.teacher.create({
        data: {
          schoolId: fixtures.schoolId,
          employeeId: "TCH-FY-0001",
          firstName: "Grace",
          lastName: "Hopper",
          gender: "FEMALE",
          designation: "Class Teacher",
          joiningDate: new Date("2026-04-01T00:00:00.000Z"),
          status: "ACTIVE",
        },
      })

      const enrollment = await prisma.studentEnrollment.findFirstOrThrow({
        where: { studentId: studentA.id, academicSessionId: fixtures.sessionId },
      })
      enrollmentId = enrollment.id

      const exam = await prisma.exam.create({
        data: {
          schoolId: fixtures.schoolId,
          academicSessionId: fixtures.sessionId,
          examTypeId: examType.id,
          name: "Final 2026",
          classId: fixtures.classId,
          sectionId: fixtures.sectionId,
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-09-10T00:00:00.000Z"),
          status: "FINAL",
        },
      })
      examId = exam.id

      const examSubject = await prisma.examSubject.create({
        data: {
          examId: exam.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          maxMarks: 100,
          passMarks: 40,
          sortOrder: 1,
        },
      })
      const examResult = await prisma.examResult.create({
        data: {
          schoolId: fixtures.schoolId,
          examId: exam.id,
          studentId: studentA.id,
          enrollmentId: enrollment.id,
          totalObtained: 75,
          totalMaxMarks: 100,
          totalPercentage: 75,
          isComplete: true,
        },
      })
      await prisma.examMark.create({
        data: {
          schoolId: fixtures.schoolId,
          examResultId: examResult.id,
          examSubjectId: examSubject.id,
          obtainedMarks: 75,
          status: "SCORED",
        },
      })
      await prisma.gradingBand.create({
        data: { schoolId: fixtures.schoolId, minPercent: 0, maxPercent: 100, grade: "A" },
      })
      await prisma.schoolSetting.create({
        data: {
          schoolId: fixtures.schoolId,
          key: REPORT_CARD_SIGNATORIES_SETTING_KEY,
          value: JSON.stringify([{ role: "Principal", name: "Dr. Margaret Hamilton" }]),
        },
      })
      await prisma.reportCardScheme.create({
        data: {
          schoolId: fixtures.schoolId,
          academicSessionId: fixtures.sessionId,
          classId: fixtures.classId,
          sectionId: null,
          scopeKey: "class",
          aggregationPolicy: "RAW",
          absencePolicy: "EXCLUDE_AND_REVIEW",
          overallPassMode: "ALL_SUBJECTS",
          annualSubjectPassPercent: 40,
          coreSubjectIds: [],
          exams: { create: [{ examTypeId: examType.id, weight: 1, sortOrder: 1 }] },
        },
      })
    })

    it("serializes concurrent generation for one scope: one new version, one conflict, clean lineage", async () => {
      const input = {
        studentId: studentA.id,
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
      }

      // 1) Single generation creates v1 and publishes it to PENDING_ARCHIVE, so
      //    the concurrent pair below is the reissue case (a prior version exists
      //    to supersede — the exact condition under which the A3 race corrupted
      //    supersession bookkeeping).
      const first = await adminAgent.post("/api/v1/report-cards/generate").send(input)
      expect(first.status).toBe(201)
      expect(first.body.data.version).toBe(1)
      expect(first.body.data.status).toBe("DRAFT")
      const v1Id = first.body.data.id as string

      const publish = await adminAgent.post(`/api/v1/report-cards/${v1Id}/publish`)
      expect(publish.status).toBe(200)
      expect(publish.body.data.status).toBe("PENDING_ARCHIVE")

      // 2) Two concurrent reissue generations for the same scope.
      const reissue = { ...input, reissueReason: "Corrected term marks" }
      const [a, b] = await Promise.all([
        adminAgent.post("/api/v1/report-cards/generate").send(reissue),
        adminAgent.post("/api/v1/report-cards/generate").send(reissue),
      ])

      // The enrollment anchor serializes them: one commits, the other blocks,
      // re-reads the committed DRAFT and reports the conflict.
      const statuses = [a.status, b.status].sort((x, y) => x - y)
      expect(statuses).toEqual([201, 409])
      const conflict = a.status === 409 ? a : b
      expect(conflict.body.error.code).toBe(REPORT_CARD_DRAFT_EXISTS)

      // 3) Exactly one new DRAFT, correct version/audit lineage, and no card is
      //    ever superseded by a DRAFT (the A3 corruption).
      const cards = await prisma.reportCard.findMany({
        where: {
          schoolId: fixtures.schoolId,
          academicSessionId: fixtures.sessionId,
          studentId: studentA.id,
        },
        orderBy: { version: "asc" },
      })
      expect(cards).toHaveLength(2)

      const drafts = cards.filter((card) => card.status === "DRAFT")
      expect(drafts).toHaveLength(1)
      expect(drafts[0]!.version).toBe(2)
      expect(drafts[0]!.supersedesReportCardId).toBe(v1Id)
      expect(drafts[0]!.reissueReason).toBe("Corrected term marks")
      expect(drafts[0]!.enrollmentId).toBe(enrollmentId)
      expect(drafts[0]!.classId).toBe(fixtures.classId)

      const draftIds = new Set(drafts.map((card) => card.id))
      for (const card of cards) {
        if (card.supersedesReportCardId) {
          expect(draftIds.has(card.supersedesReportCardId)).toBe(false)
        }
      }

      // The published predecessor is untouched by the reissue draft.
      const predecessor = cards.find((card) => card.id === v1Id)
      expect(predecessor?.status).toBe("PENDING_ARCHIVE")
    })

    it("keeps the empty-scope (zero-row) race covered with a second student", async () => {
      // The case the ReportCard scope lock can never cover: a student with no
      // ReportCard row yet (nothing to lock). A concurrency run here must still
      // resolve to exactly one v1 DRAFT — only the enrollment anchor can do that.
      const studentB = await prisma.student.create({
        data: {
          schoolId: fixtures.schoolId,
          admissionNumber: "ADM-FY-0002",
          firstName: "Alan",
          lastName: "Turing",
          dateOfBirth: new Date("2015-06-11T00:00:00.000Z"),
          gender: "MALE",
          status: "ACTIVE",
          admissionDate: new Date("2026-04-01T00:00:00.000Z"),
        },
      })
      await prisma.studentEnrollment.create({
        data: {
          studentId: studentB.id,
          academicSessionId: fixtures.sessionId,
          classId: fixtures.classId,
          sectionId: fixtures.sectionId,
        },
      })

      const examResult = await prisma.examResult.create({
        data: {
          schoolId: fixtures.schoolId,
          examId,
          studentId: studentB.id,
          enrollmentId: (
            await prisma.studentEnrollment.findFirstOrThrow({ where: { studentId: studentB.id } })
          ).id,
          totalObtained: 60,
          totalMaxMarks: 100,
          totalPercentage: 60,
          isComplete: true,
        },
      })
      const examSubject = await prisma.examSubject.findFirstOrThrow({ where: { examId }, select: { id: true } })
      await prisma.examMark.create({
        data: {
          schoolId: fixtures.schoolId,
          examResultId: examResult.id,
          examSubjectId: examSubject.id,
          obtainedMarks: 60,
          status: "SCORED",
        },
      })

      const input = {
        studentId: studentB.id,
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
      }

      const [a, b] = await Promise.all([
        adminAgent.post("/api/v1/report-cards/generate").send(input),
        adminAgent.post("/api/v1/report-cards/generate").send(input),
      ])

      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409])

      const cards = await prisma.reportCard.findMany({
        where: {
          schoolId: fixtures.schoolId,
          academicSessionId: fixtures.sessionId,
          studentId: studentB.id,
        },
      })
      expect(cards).toHaveLength(1)
      expect(cards[0]!.version).toBe(1)
      expect(cards[0]!.supersedesReportCardId).toBeNull()
      expect(cards[0]!.reissueReason).toBeNull()
    })

    // ────────────────────────────────────────────────────────────────────────
    // M6a: Report Card scheme configuration is the missing path that unblocked
    // generation (G2). This authored, DB-gated test provisions a scheme through
    // the NEW `/api/v1/report-card-schemes` endpoint (not by inserting rows
    // directly) and proves generation then progresses past the "scheme not
    // found" blocker. NOT executed in this environment (TEST_DATABASE_URL unset);
    // it must be run against a disposable database before M6a is closed.
    // ────────────────────────────────────────────────────────────────────────
    it("provisions a scheme via the M6a API and generation proceeds past scheme-not-found", async () => {
      const examType = await prisma.examType.findFirstOrThrow({
        where: { schoolId: fixtures.schoolId },
        select: { id: true },
      })

      // 1) Author a SECTION-scoped scheme through the new configuration API.
      //    SUPER_ADMIN holds report-cards:manage-schemes by role bypass.
      const provision = await adminAgent.put("/api/v1/report-card-schemes").send({
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        aggregationPolicy: "RAW",
        absencePolicy: "EXCLUDE_AND_REVIEW",
        overallPassMode: "ALL_SUBJECTS",
        annualSubjectPassPercent: 40,
        coreSubjectIds: [],
        exams: [{ examTypeId: examType.id, weight: "1" }],
      })
      expect(provision.status).toBe(200)
      expect(provision.body.data.scopeKey).toBe(fixtures.sectionId)
      expect(provision.body.data.sectionId).toBe(fixtures.sectionId)
      expect(provision.body.data.exams).toHaveLength(1)

      // 2) The scheme change is audited (CREATE, then a follow-up UPDATE for the
      //    idempotent re-upsert below).
      const repeat = await adminAgent.put("/api/v1/report-card-schemes").send({
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        aggregationPolicy: "RAW",
        absencePolicy: "EXCLUDE_AND_REVIEW",
        overallPassMode: "ALL_SUBJECTS",
        annualSubjectPassPercent: 40,
        coreSubjectIds: [],
        exams: [{ examTypeId: examType.id, weight: "1" }],
      })
      expect(repeat.status).toBe(200)
      const audits = await prisma.auditLog.findMany({
        where: { entityType: "REPORT_CARD_SCHEME", schoolId: fixtures.schoolId },
        orderBy: { createdAt: "asc" },
      })
      expect(audits.length).toBeGreaterThanOrEqual(2)
      expect(audits[0]!.action).toBe("CREATE")
      expect(audits[audits.length - 1]!.action).toBe("UPDATE")

      // 3) Generation for that placement now finds a scheme and proceeds past
      //    the scheme-not-found blocker. A previous test already created a DRAFT
      //    for this student, so the correct outcome is a draft conflict (409) —
      //    NOT a 404 scheme-not-found.
      const generation = await adminAgent.post("/api/v1/report-cards/generate").send({
        studentId: studentA.id,
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
      })
      expect(generation.status).not.toBe(404)
      if (generation.status >= 400) {
        expect(generation.body.error.message).not.toMatch(/scheme/i)
      }
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  // One TRUNCATE ... CASCADE clears every school-scoped table AND the rows that
  // RESTRICT a delete (payments, receipts, adjustments, enrolments, ...). An
  // ordered list of DELETEs aborts as soon as a previously run suite left a
  // Restrict child behind: the DB-backed suites share ONE test database and
  // run one after another.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "School" CASCADE')
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
}
