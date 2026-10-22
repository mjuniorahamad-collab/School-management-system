// Integration coverage for the Phase 1 master-data lifecycle (deactivate /
// reactivate) and the Phase 0 safety fixes that depend on it.
//
// The contract this suite pins down:
//   - a retired master record is hidden from the default list but reachable
//     through `includeInactive=true`;
//   - a retired record can no longer be picked for NEW entries (exams, report
//     card schemes, fee structures, timetable entries);
//   - a retired record that an EXISTING record already references stays usable,
//     so retiring it never freezes historical data;
//   - reactivating a grading band re-checks the overlap rules, and a band
//     created as inactive is not subject to the active-overlap rule.
//
// DB-backed: runs only when TEST_DATABASE_URL points at a disposable test
// database (the vitest global setup enforces that).

import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

interface Fixtures {
  schoolId: string
  sessionId: string
  classId: string
  sectionId: string
  subjectId: string
  teacherId: string
  periodSlotId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  sessionId: "",
  classId: "",
  sectionId: "",
  subjectId: "",
  teacherId: "",
  periodSlotId: "",
  adminPassword: "lifecycle-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Master-data lifecycle (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)

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

    const school = await prisma.school.create({ data: { name: "Lifecycle School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Lifecycle Year",
        code: "LY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    const cls = await prisma.class.create({
      data: { schoolId: school.id, name: "5", sortOrder: 5 },
    })
    fixtures.classId = cls.id
    const section = await prisma.section.create({ data: { classId: cls.id, name: "A" } })
    fixtures.sectionId = section.id

    const subject = await prisma.subject.create({
      data: { schoolId: school.id, code: "SCI", name: "Science" },
    })
    fixtures.subjectId = subject.id

    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "T-LC-0001",
        firstName: "Lena",
        lastName: "Lifecycle",
        gender: "FEMALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.teacherId = teacher.id

    const slot = await prisma.periodSlot.create({
      data: {
        schoolId: school.id,
        name: "Period 1",
        startTime: "08:00",
        endTime: "08:45",
        sortOrder: 1,
      },
    })
    fixtures.periodSlotId = slot.id

    const superAdminRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" },
    })
    const adminUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Lifecycle Admin",
        email: "lifecycle.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: adminUser.id, schoolId: school.id, roleId: superAdminRole.id, status: "ACTIVE" },
    })

    const login = await adminAgent
      .post("/api/v1/auth/login")
      .send({ email: "lifecycle.admin@example.com", password: fixtures.adminPassword })
    expect(login.status).toBe(200)
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  // ---------------------------------------------------------------- helpers

  async function createGradingBand(overrides: Record<string, unknown> = {}) {
    const res = await adminAgent.post("/api/v1/grading-bands").send({
      minPercent: 0,
      maxPercent: 100,
      grade: "A",
      ...overrides,
    })
    return res
  }

  async function createExamType(overrides: Record<string, unknown> = {}) {
    const res = await adminAgent.post("/api/v1/exam-types").send({
      code: "ET1",
      name: "Term 1",
      ...overrides,
    })
    return res
  }

  async function createFeeHead(overrides: Record<string, unknown> = {}) {
    const res = await adminAgent.post("/api/v1/fee-heads").send({
      code: "FH1",
      name: "Tuition",
      ...overrides,
    })
    return res
  }

  async function createPeriodSlot(overrides: Record<string, unknown> = {}) {
    const res = await adminAgent.post("/api/v1/period-slots").send({
      name: "Period 9",
      startTime: "15:00",
      endTime: "15:45",
      sortOrder: 9,
      ...overrides,
    })
    return res
  }

  // ------------------------------------------------------- grading bands

  describe("grading bands", () => {
    it("creates a band as active by default", async () => {
      const res = await createGradingBand({ minPercent: 80, maxPercent: 89, grade: "B" })
      expect(res.status).toBe(201)
      expect(res.body.data.isActive).toBe(true)
    })

    it("hides a deactivated band from the default list and reveals it with includeInactive", async () => {
      const created = await createGradingBand({ minPercent: 70, maxPercent: 79, grade: "C" })
      const id = created.body.data.id

      const deactivated = await adminAgent.patch(`/api/v1/grading-bands/${id}`).send({ isActive: false })
      expect(deactivated.status).toBe(200)
      expect(deactivated.body.data.isActive).toBe(false)

      const active = await adminAgent.get("/api/v1/grading-bands")
      expect(active.body.data.items.map((b: { id: string }) => b.id)).not.toContain(id)

      const all = await adminAgent.get("/api/v1/grading-bands?includeInactive=true")
      expect(all.body.data.items.map((b: { id: string }) => b.id)).toContain(id)
    })

    it("rejects a NEW active band that overlaps an active band", async () => {
      const res = await createGradingBand({ minPercent: 85, maxPercent: 95, grade: "A+" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/overlap/i)
    })

    it("allows adjacent bands and bands with a gap", async () => {
      const adjacent = await createGradingBand({ minPercent: 90, maxPercent: 99, grade: "A+" })
      expect(adjacent.status).toBe(201)

      const gap = await createGradingBand({ minPercent: 60, maxPercent: 69, grade: "D" })
      expect(gap.status).toBe(201)
    })

    it("allows an INACTIVE band to overlap an active band", async () => {
      const res = await createGradingBand({
        minPercent: 92,
        maxPercent: 95,
        grade: "RET",
        isActive: false,
      })
      expect(res.status).toBe(201)
      expect(res.body.data.isActive).toBe(false)
    })

    it("re-checks the overlap when a band is reactivated", async () => {
      const retired = await createGradingBand({
        minPercent: 40,
        maxPercent: 45,
        grade: "E",
        isActive: false,
      })
      expect(retired.status).toBe(201)
      const id = retired.body.data.id

      // An active band now occupies the same range.
      const active = await createGradingBand({ minPercent: 43, maxPercent: 49, grade: "E2" })
      expect(active.status).toBe(201)

      const reactivated = await adminAgent.patch(`/api/v1/grading-bands/${id}`).send({ isActive: true })
      expect(reactivated.status).toBe(400)
      expect(reactivated.body.error.message).toMatch(/overlap/i)
    })

    it("reactivates a band whose range is free", async () => {
      const retired = await createGradingBand({
        minPercent: 10,
        maxPercent: 19,
        grade: "F",
        isActive: false,
      })
      const id = retired.body.data.id
      const reactivated = await adminAgent.patch(`/api/v1/grading-bands/${id}`).send({ isActive: true })
      expect(reactivated.status).toBe(200)
      expect(reactivated.body.data.isActive).toBe(true)
    })
  })

  // ---------------------------------------------------------- exam types

  describe("exam types", () => {
    it("deactivates and reactivates an exam type", async () => {
      const created = await createExamType({ code: "ET_LC_1", name: "Term One" })
      expect(created.status).toBe(201)
      expect(created.body.data.isActive).toBe(true)
      const id = created.body.data.id

      const deactivated = await adminAgent.patch(`/api/v1/exam-types/${id}`).send({ isActive: false })
      expect(deactivated.status).toBe(200)
      expect(deactivated.body.data.isActive).toBe(false)

      const active = await adminAgent.get("/api/v1/exam-types")
      expect(active.body.data.items.map((t: { id: string }) => t.id)).not.toContain(id)

      const all = await adminAgent.get("/api/v1/exam-types?includeInactive=true")
      expect(all.body.data.items.map((t: { id: string }) => t.id)).toContain(id)

      const reactivated = await adminAgent.patch(`/api/v1/exam-types/${id}`).send({ isActive: true })
      expect(reactivated.status).toBe(200)
      expect(reactivated.body.data.isActive).toBe(true)
    })

    it("rejects a NEW exam that uses a retired exam type", async () => {
      const type = await createExamType({ code: "ET_LC_2", name: "Retired Type" })
      const typeId = type.body.data.id
      await adminAgent.patch(`/api/v1/exam-types/${typeId}`).send({ isActive: false })

      const res = await adminAgent.post("/api/v1/exams").send({
        academicSessionId: fixtures.sessionId,
        examTypeId: typeId,
        name: "Retired Type Exam",
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        startDate: "2026-05-01",
        endDate: "2026-05-10",
        subjects: [
          {
            subjectId: fixtures.subjectId,
            teacherId: fixtures.teacherId,
            maxMarks: 100,
            passMarks: 40,
          },
        ],
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/inactive/i)
    })

    it("keeps an EXISTING exam editable after its exam type is retired", async () => {
      const type = await createExamType({ code: "ET_LC_3", name: "Legacy Type" })
      const typeId = type.body.data.id

      const created = await adminAgent.post("/api/v1/exams").send({
        academicSessionId: fixtures.sessionId,
        examTypeId: typeId,
        name: "Legacy Exam",
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        subjects: [
          {
            subjectId: fixtures.subjectId,
            teacherId: fixtures.teacherId,
            maxMarks: 100,
            passMarks: 40,
          },
        ],
      })
      expect(created.status).toBe(201)
      const examId = created.body.data.id

      await adminAgent.patch(`/api/v1/exam-types/${typeId}`).send({ isActive: false })

      const renamed = await adminAgent.patch(`/api/v1/exams/${examId}`).send({ name: "Legacy Exam (renamed)" })
      expect(renamed.status).toBe(200)
      expect(renamed.body.data.name).toBe("Legacy Exam (renamed)")
    })
  })

  // ------------------------------------------------------------ fee heads

  describe("fee heads", () => {
    it("deactivates and reactivates a fee head", async () => {
      const created = await createFeeHead({ code: "FH_LC_1", name: "Laboratory" })
      const id = created.body.data.id

      const deactivated = await adminAgent.patch(`/api/v1/fee-heads/${id}`).send({ isActive: false })
      expect(deactivated.status).toBe(200)
      expect(deactivated.body.data.isActive).toBe(false)

      const active = await adminAgent.get("/api/v1/fee-heads")
      expect(active.body.data.items.map((h: { id: string }) => h.id)).not.toContain(id)

      const all = await adminAgent.get("/api/v1/fee-heads?includeInactive=true")
      expect(all.body.data.items.map((h: { id: string }) => h.id)).toContain(id)

      const reactivated = await adminAgent.patch(`/api/v1/fee-heads/${id}`).send({ isActive: true })
      expect(reactivated.status).toBe(200)
      expect(reactivated.body.data.isActive).toBe(true)
    })

    it("rejects a NEW fee structure that uses a retired fee head", async () => {
      const head = await createFeeHead({ code: "FH_LC_2", name: "Retired Head" })
      const headId = head.body.data.id
      await adminAgent.patch(`/api/v1/fee-heads/${headId}`).send({ isActive: false })

      const res = await adminAgent.post("/api/v1/fees/structures").send({
        name: "Structure With Retired Head",
        sessionId: fixtures.sessionId,
        classId: fixtures.classId,
        items: [{ feeHeadId: headId, amount: 100, sortOrder: 0 }],
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/inactive/i)
    })

    it("keeps an EXISTING fee structure editable after its fee head is retired", async () => {
      const head = await createFeeHead({ code: "FH_LC_3", name: "Legacy Head" })
      const headId = head.body.data.id

      const created = await adminAgent.post("/api/v1/fees/structures").send({
        name: "Structure With Legacy Head",
        sessionId: fixtures.sessionId,
        classId: fixtures.classId,
        items: [{ feeHeadId: headId, amount: 100, sortOrder: 0 }],
      })
      expect(created.status).toBe(201)
      const structureId = created.body.data.id

      await adminAgent.patch(`/api/v1/fee-heads/${headId}`).send({ isActive: false })

      const renamed = await adminAgent
        .patch(`/api/v1/fees/structures/${structureId}`)
        .send({
          name: "Structure With Legacy Head (renamed)",
          items: [{ feeHeadId: headId, amount: 120, sortOrder: 0 }],
        })
      expect(renamed.status).toBe(200)
      expect(renamed.body.data.name).toBe("Structure With Legacy Head (renamed)")
    })
  })

  // --------------------------------------------------------- period slots

  describe("period slots", () => {
    it("deactivates and reactivates a period slot", async () => {
      const created = await createPeriodSlot({ name: "Period 5", sortOrder: 5 })
      const id = created.body.data.id

      const deactivated = await adminAgent.patch(`/api/v1/period-slots/${id}`).send({ isActive: false })
      expect(deactivated.status).toBe(200)
      expect(deactivated.body.data.isActive).toBe(false)

      const active = await adminAgent.get("/api/v1/period-slots")
      expect(active.body.data.items.map((s: { id: string }) => s.id)).not.toContain(id)

      const all = await adminAgent.get("/api/v1/period-slots?includeInactive=true")
      expect(all.body.data.items.map((s: { id: string }) => s.id)).toContain(id)

      const reactivated = await adminAgent.patch(`/api/v1/period-slots/${id}`).send({ isActive: true })
      expect(reactivated.status).toBe(200)
      expect(reactivated.body.data.isActive).toBe(true)
    })

    it("rejects a NEW timetable entry that uses a retired period slot", async () => {
      const slot = await createPeriodSlot({ name: "Period 6", sortOrder: 6 })
      const slotId = slot.body.data.id
      await adminAgent.patch(`/api/v1/period-slots/${slotId}`).send({ isActive: false })

      const res = await adminAgent.post("/api/v1/timetable").send({
        academicSessionId: fixtures.sessionId,
        dayOfWeek: "MONDAY",
        periodSlotId: slotId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        subjectId: fixtures.subjectId,
        teacherId: fixtures.teacherId,
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/inactive/i)
    })

    it("keeps an EXISTING timetable entry editable after its period slot is retired", async () => {
      const slot = await createPeriodSlot({ name: "Period 7", sortOrder: 7 })
      const slotId = slot.body.data.id

      const created = await adminAgent.post("/api/v1/timetable").send({
        academicSessionId: fixtures.sessionId,
        dayOfWeek: "TUESDAY",
        periodSlotId: slotId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        subjectId: fixtures.subjectId,
        teacherId: fixtures.teacherId,
      })
      expect(created.status).toBe(201)
      const entryId = created.body.data.id

      await adminAgent.patch(`/api/v1/period-slots/${slotId}`).send({ isActive: false })

      const moved = await adminAgent
        .patch(`/api/v1/timetable/${entryId}`)
        .send({ dayOfWeek: "WEDNESDAY" })
      expect(moved.status).toBe(200)
      expect(moved.body.data.dayOfWeek).toBe("WEDNESDAY")
    })

    it("accepts the full form payload that resubmits the entry's own retired period slot", async () => {
      const slot = await createPeriodSlot({ name: "Period 8", sortOrder: 8 })
      const slotId = slot.body.data.id

      const created = await adminAgent.post("/api/v1/timetable").send({
        academicSessionId: fixtures.sessionId,
        dayOfWeek: "MONDAY",
        periodSlotId: slotId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        subjectId: fixtures.subjectId,
        teacherId: fixtures.teacherId,
      })
      expect(created.status).toBe(201)
      const entryId = created.body.data.id

      await adminAgent.patch(`/api/v1/period-slots/${slotId}`).send({ isActive: false })

      // The client always re-submits the whole form, retired slot included, so
      // the stored (unchanged) retired slot must stay acceptable.
      const res = await adminAgent.patch(`/api/v1/timetable/${entryId}`).send({
        academicSessionId: fixtures.sessionId,
        dayOfWeek: "TUESDAY",
        periodSlotId: slotId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        subjectId: fixtures.subjectId,
        teacherId: fixtures.teacherId,
      })
      expect(res.status).toBe(200)
      expect(res.body.data.periodSlotId).toBe(slotId)
      expect(res.body.data.dayOfWeek).toBe("TUESDAY")
    })

    it("rejects moving an existing entry onto a DIFFERENT retired period slot", async () => {
      const own = await createPeriodSlot({ name: "Period 10", sortOrder: 10 })
      const other = await createPeriodSlot({ name: "Period 11", sortOrder: 11 })

      const created = await adminAgent.post("/api/v1/timetable").send({
        academicSessionId: fixtures.sessionId,
        dayOfWeek: "MONDAY",
        periodSlotId: own.body.data.id,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        subjectId: fixtures.subjectId,
        teacherId: fixtures.teacherId,
      })
      expect(created.status).toBe(201)

      await adminAgent.patch(`/api/v1/period-slots/${own.body.data.id}`).send({ isActive: false })
      await adminAgent.patch(`/api/v1/period-slots/${other.body.data.id}`).send({ isActive: false })

      const res = await adminAgent
        .patch(`/api/v1/timetable/${created.body.data.id}`)
        .send({ periodSlotId: other.body.data.id })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/inactive/i)
    })
  })

  // --------------------------------------------------- report card schemes

  describe("report card schemes", () => {
    it("rejects a NEW scheme that binds a retired exam type", async () => {
      const type = await createExamType({ code: "ET_LC_4", name: "Scheme Retired Type" })
      const typeId = type.body.data.id
      await adminAgent.patch(`/api/v1/exam-types/${typeId}`).send({ isActive: false })

      const res = await adminAgent.put("/api/v1/report-card-schemes").send({
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        aggregationPolicy: "RAW",
        overallPassMode: "ALL_SUBJECTS",
        annualSubjectPassPercent: 40,
        exams: [{ examTypeId: typeId, sortOrder: 0 }],
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/inactive/i)
    })

    it("keeps an EXISTING scheme bound to a retired exam type", async () => {
      const type = await createExamType({ code: "ET_LC_5", name: "Scheme Legacy Type" })
      const typeId = type.body.data.id

      const created = await adminAgent.put("/api/v1/report-card-schemes").send({
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        aggregationPolicy: "RAW",
        overallPassMode: "ALL_SUBJECTS",
        annualSubjectPassPercent: 40,
        exams: [{ examTypeId: typeId, sortOrder: 0 }],
      })
      expect(created.status).toBe(200)

      await adminAgent.patch(`/api/v1/exam-types/${typeId}`).send({ isActive: false })

      const updated = await adminAgent.put("/api/v1/report-card-schemes").send({
        academicSessionId: fixtures.sessionId,
        classId: fixtures.classId,
        sectionId: fixtures.sectionId,
        aggregationPolicy: "RAW",
        overallPassMode: "ALL_SUBJECTS",
        annualSubjectPassPercent: 45,
        exams: [{ examTypeId: typeId, sortOrder: 0 }],
      })
      expect(updated.status).toBe(200)
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
