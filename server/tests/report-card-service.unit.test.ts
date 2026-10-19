// Database-free service tests for the Annual Report Card generation surface
// (docs/report-card.md §2, §3, §4, §5, §8). The Prisma access layer is mocked at
// `lib/database.js`, exactly as the Results transaction tests do, so these suites
// never import a live client, never connect, and never touch the database.
//
// They assert behaviour the specification requires — tenant scoping, scheme
// precedence, fail-closed NOT_FINAL handling under both aggregation policies,
// missing-mark projection to PENDING (never ABSENT/zero), weight projection by
// concrete exam id, version allocation / duplicate-draft conflict, and snapshot
// hash determinism — rather than re-testing pure helpers.

import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { ApiError } from "../src/lib/ApiError.js"
import {
  generateReportCard,
  getReportCard,
  listReportCards,
} from "../src/modules/report-cards/report-card.service.js"
import type { GenerateReportCardInput } from "../src/modules/report-cards/report-card.api.schema.js"

const mockGetPrisma = vi.mocked(getPrisma)

const SCHOOL_ID = "00000000-0000-4000-8000-0000000000a1"
const OTHER_SCHOOL_ID = "00000000-0000-4000-8000-0000000000a2"
const SESSION_ID = "00000000-0000-4000-8000-0000000000b1"
const CLASS_ID = "00000000-0000-4000-8000-0000000000c1"
const SECTION_ID = "00000000-0000-4000-8000-0000000000c2"
const STUDENT_ID = "00000000-0000-4000-8000-0000000000d1"
const ENROLLMENT_ID = "00000000-0000-4000-8000-0000000000d2"
const ACTOR_ID = "00000000-0000-4000-8000-0000000000e1"
const TYPE_1 = "00000000-0000-4000-8000-0000000000f1"
const TYPE_2 = "00000000-0000-4000-8000-0000000000f2"
const EXAM_1 = "00000000-0000-4000-8000-0000000010f1"
const EXAM_2 = "00000000-0000-4000-8000-0000000010f2"
const SUBJECT_1 = "00000000-0000-4000-8000-0000000020f1"

const ACTOR = {
  schoolId: SCHOOL_ID,
  userId: ACTOR_ID,
  name: "Registrar",
  email: "registrar@example.com",
  roles: ["PRINCIPAL"],
}

const INPUT: GenerateReportCardInput = {
  studentId: STUDENT_ID,
  academicSessionId: SESSION_ID,
  classId: CLASS_ID,
  sectionId: null,
}

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

interface SchemeExamRow {
  examTypeId: string
  weight: Prisma.Decimal
  sortOrder: number
  examType: { name: string }
}

interface SchemeRow {
  id: string
  scopeKey: string
  aggregationPolicy: string
  absencePolicy: string
  overallPassMode: string
  annualSubjectPassPercent: Prisma.Decimal
  overallPassPercent: Prisma.Decimal | null
  maxFailedSubjects: number | null
  coreSubjectIds: string[]
  exams: SchemeExamRow[]
}

interface MarkRow {
  status: string
  isAbsent: boolean
  obtainedMarks: Prisma.Decimal | null
  examSubject: { subjectId: string; maxMarks: Prisma.Decimal }
}

interface ExamResultRow {
  examId: string
  exam: {
    id: string
    examTypeId: string
    classId: string
    sectionId: string | null
    status: string
  }
  marks: MarkRow[]
}

interface ExamInstanceRow {
  id: string
  examTypeId: string
  classId: string
  sectionId: string | null
  status: string
  name: string
  startDate: Date
  endDate: Date
}

interface ExamSubjectRow {
  examId: string
  subjectId: string
  maxMarks: Prisma.Decimal
}

interface GradingBandRow {
  minPercent: number
  maxPercent: number
  grade: string
}

function schemeExam(examTypeId: string, weight: number, name: string): SchemeExamRow {
  return { examTypeId, weight: dec(weight), sortOrder: 0, examType: { name } }
}function scheme(overrides: Partial<SchemeRow> = {}): SchemeRow {
  return {
    id: "scheme-1",
    scopeKey: "class",
    aggregationPolicy: "RAW",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "ALL_SUBJECTS",
    annualSubjectPassPercent: dec(40),
    overallPassPercent: null,
    maxFailedSubjects: null,
    coreSubjectIds: [],
    exams: [],
    ...overrides,
  }
}

function resultRow(opts: {
  examId: string
  examTypeId: string
  classId?: string
  sectionId?: string | null
  status: string
  marks: MarkRow[]
}): ExamResultRow {
  return {
    examId: opts.examId,
    exam: {
      id: opts.examId,
      examTypeId: opts.examTypeId,
      classId: opts.classId ?? CLASS_ID,
      sectionId: opts.sectionId ?? null,
      status: opts.status,
    },
    marks: opts.marks,
  }
}

function mark(opts: {
  subjectId?: string
  maxMarks: number
  obtained?: number | null
  isAbsent?: boolean
  status?: string
}): MarkRow {
  return {
    status: opts.status ?? "SCORED",
    isAbsent: opts.isAbsent ?? false,
    obtainedMarks: opts.obtained === undefined || opts.obtained === null ? null : dec(opts.obtained),
    examSubject: { subjectId: opts.subjectId ?? SUBJECT_1, maxMarks: dec(opts.maxMarks) },
  }
}

function instance(
  id: string,
  examTypeId: string,
  status: string,
  classId = CLASS_ID,
  sectionId: string | null = null,
): ExamInstanceRow {
  return {
    id,
    examTypeId,
    classId,
    sectionId,
    status,
    name: `Exam ${id.slice(-2)}`,
    startDate: new Date("2026-03-01T00:00:00.000Z"),
    endDate: new Date("2026-03-05T00:00:00.000Z"),
  }
}

function resolvedExam(
  examId: string,
  examTypeId: string,
  marks: MarkRow[],
): { result: ExamResultRow; instance: ExamInstanceRow } {
  return {
    result: resultRow({ examId, examTypeId, status: "FINAL", marks }),
    instance: instance(examId, examTypeId, "FINAL"),
  }
}

interface HarnessOptions {
  student?: (Record<string, unknown> & { id: string }) | null
  enrollment?: { id: string; classId: string; sectionId: string | null } | null
  school?: { id: string; name: string } | null
  schoolSettings?: Array<{ key: string; value: string }>
  signatories?: string | null
  subjectNames?: Record<string, string>
  sectionScheme?: SchemeRow | null
  classScheme?: SchemeRow | null
  examResults?: ExamResultRow[]
  examInstances?: ExamInstanceRow[]
  examSubjects?: ExamSubjectRow[]
  gradingBands?: GradingBandRow[]
  activeDraft?: { id: string; version: number } | null
  previous?: { id: string; version: number } | null
  foundCard?: Record<string, unknown> | null
  listTotal?: number
  listRows?: Array<Record<string, unknown>>
  createError?: unknown
}

interface Call {
  op: string
  args: Record<string, unknown>
}

interface Harness {
  calls: Call[]
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const calls: Call[] = []
  const rec = (op: string, args: Record<string, unknown>): void => {
    calls.push({ op, args })
  }

  const student =
    options.student === undefined
      ? {
          id: STUDENT_ID,
          admissionNumber: "ADM-0001",
          firstName: "Aria",
          middleName: null,
          lastName: "Khan",
        }
      : options.student
  const enrollment =
    options.enrollment === undefined
      ? { id: ENROLLMENT_ID, classId: CLASS_ID, sectionId: null }
      : options.enrollment
  const schoolRow =
    options.school === undefined
      ? { id: SCHOOL_ID, name: "Bright Future International School" }
      : options.school
  const sessionRow = { id: SESSION_ID, name: "2026-2027" }
  const classRow = { id: CLASS_ID, name: "Grade 1" }
  const brandingRows = options.schoolSettings ?? []
  const signatoryValue =
    options.signatories === undefined
      ? JSON.stringify([{ role: "Class Teacher", name: "Ms. A. Sharma" }])
      : options.signatories
  const subjectNames = options.subjectNames ?? {}
  const sectionScheme = options.sectionScheme ?? null
  const classScheme = options.classScheme ?? null
  const examResults = options.examResults ?? []
  const examInstances = options.examInstances ?? []
  const examSubjects = options.examSubjects ?? []
  const gradingBands = options.gradingBands ?? [{ minPercent: 0, maxPercent: 100, grade: "A" }]
  const activeDraft = options.activeDraft ?? null
  const previous = options.previous ?? null
  const foundCard = options.foundCard === undefined ? { id: "rc-found" } : options.foundCard

  const reportCard = {
    findFirst: vi.fn(async (args: Record<string, unknown>) => {
      rec("reportCard.findFirst", args)
      const where = (args.where ?? {}) as Record<string, unknown>
      if (where.status === "DRAFT") return activeDraft
      if (args.orderBy) return previous
      return foundCard
    }),
    count: vi.fn(async (args: Record<string, unknown>) => {
      rec("reportCard.count", args)
      return options.listTotal ?? 0
    }),
    findMany: vi.fn(async (args: Record<string, unknown>) => {
      rec("reportCard.findMany", args)
      return options.listRows ?? []
    }),
    create: vi.fn(async (args: Record<string, unknown>) => {
      rec("reportCard.create", args)
      if (options.createError) throw options.createError
      return { id: "rc-created", ...(args.data as Record<string, unknown>) }
    }),
  }

  const reportCardScheme = {
    findFirst: vi.fn(async (args: Record<string, unknown>) => {
      rec("reportCardScheme.findFirst", args)
      const where = (args.where ?? {}) as Record<string, unknown>
      if (where.sectionId !== null && where.sectionId !== undefined) return sectionScheme
      return classScheme
    }),
  }

  const tx = {
    student: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("student.findFirst", args)
        return student
      }),
    },
    studentEnrollment: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("studentEnrollment.findFirst", args)
        return enrollment
      }),
    },
    school: {
      findUnique: vi.fn(async (args: Record<string, unknown>) => {
        rec("school.findUnique", args)
        return schoolRow
      }),
    },
    academicSession: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("academicSession.findFirst", args)
        return sessionRow
      }),
    },
    class: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("class.findFirst", args)
        return classRow
      }),
    },
    section: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("section.findFirst", args)
        const id = (args.where as { id?: string } | undefined)?.id
        return id ? { id, name: "Section A" } : null
      }),
    },
    subject: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("subject.findMany", args)
        const ids = ((args.where as { id?: { in?: string[] } } | undefined)?.id?.in ?? []) as string[]
        return ids.map((id) => ({ id, name: subjectNames[id] ?? `Subject ${id.slice(-2)}` }))
      }),
    },
    schoolSetting: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("schoolSetting.findMany", args)
        return brandingRows
      }),
      findUnique: vi.fn(async (args: Record<string, unknown>) => {
        rec("schoolSetting.findUnique", args)
        const key = (args.where as { schoolId_key?: { key?: string } } | undefined)?.schoolId_key?.key
        if (key !== "reportCardSignatories") return null
        return signatoryValue === null ? null : { value: signatoryValue }
      }),
    },
    reportCardScheme,
    examResult: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("examResult.findMany", args)
        return examResults
      }),
    },
    exam: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("exam.findMany", args)
        return examInstances
      }),
    },
    examSubject: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("examSubject.findMany", args)
        return examSubjects
      }),
    },
    gradingBand: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("gradingBand.findMany", args)
        return gradingBands
      }),
    },
    reportCard,
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      rec("lock", { sql: String((args[0] as string[]).join("?")) })
      return []
    }),
  }

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") return (arg as (client: unknown) => unknown)(tx)
      return Promise.all(arg as Array<Promise<unknown>>)
    }),
  }

  mockGetPrisma.mockResolvedValue(prisma as unknown as Awaited<ReturnType<typeof getPrisma>>)
  return { calls }
}

function callsOf(calls: Call[], op: string): Record<string, unknown>[] {
  return calls.filter((call) => call.op === op).map((call) => call.args)
}

function whereOf(calls: Call[], op: string): Record<string, unknown> {
  const first = callsOf(calls, op)[0]
  return (first?.where ?? {}) as Record<string, unknown>
}

function createData(calls: Call[]): Record<string, unknown> {
  const args = callsOf(calls, "reportCard.create")[0]
  return (args?.data ?? {}) as Record<string, unknown>
}

interface CreatedSubject {
  subjectId: string
  outcome: string
  percentage: string | null
  reason: string | null
  includedExamIds: string[]
  absentExamIds: string[]
}

function createdSubjects(calls: Call[]): CreatedSubject[] {
  const subjects = createData(calls).subjects as { create?: CreatedSubject[] } | undefined
  return subjects?.create ?? []
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

beforeEach(() => {
  mockGetPrisma.mockReset()
  vi.clearAllMocks()
})

describe("generateReportCard — happy path and persistence (database-free)", () => {
  it("resolves a RAW scheme and freezes the computed outcomes", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 75 }),
    ])
    const harness = makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    const created = await generateReportCard(INPUT, ACTOR)

    expect((created as { id: string }).id).toBe("rc-created")
    const data = createData(harness.calls)
    expect(data.version).toBe(1)
    expect(data.supersedesReportCardId).toBeNull()
    expect(data.overallResult).toBe("PASS")
    expect(data.overallPercentage).toBe("75.00")
    expect(typeof data.snapshotHash).toBe("string")
    expect(data.snapshotHash).toMatch(/^[0-9a-f]{64}$/)

    const subjects = createdSubjects(harness.calls)
    expect(subjects).toHaveLength(1)
    expect(subjects[0]!.subjectId).toBe(SUBJECT_1)
    expect(subjects[0]!.outcome).toBe("PASS")
    expect(subjects[0]!.percentage).toBe("75.00")
    expect(subjects[0]!.includedExamIds).toEqual([EXAM_1])

    const snapshot = data.snapshot as Record<string, unknown>
    expect(snapshot.schemaVersion).toBe(2)
    expect(snapshot.studentId).toBe(STUDENT_ID)
    expect((snapshot.student as Record<string, unknown>).admissionNumber).toBe("ADM-0001")
    expect((snapshot.session as Record<string, unknown>).name).toBe("2026-2027")
    expect((snapshot.class as Record<string, unknown>).name).toBe("Grade 1")
    expect((snapshot.school as Record<string, unknown>).schoolName).toBe(
      "Bright Future International School",
    )
    expect((snapshot.examResolutions as Array<Record<string, unknown>>)[0]).toMatchObject({
      examTypeId: TYPE_1,
      examTypeName: "Term 1",
      examId: EXAM_1,
      examStartDate: "2026-03-01",
      examEndDate: "2026-03-05",
    })
    expect((snapshot.subjects as Array<Record<string, unknown>>)[0]).toMatchObject({
      subjectId: SUBJECT_1,
      marks: [{ examId: EXAM_1, maxMarks: "100", obtainedMarks: "75", status: "SCORED" }],
    })
    expect(snapshot.signatories).toEqual([{ role: "Class Teacher", name: "Ms. A. Sharma" }])
  })

  it("persists the exam resolutions as frozen rows", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 60 }),
    ])
    const harness = makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    await generateReportCard(INPUT, ACTOR)

    const resolutions = createData(harness.calls).examResolutions as {
      create?: Array<{ examTypeId: string; examId: string | null; status: string }>
    }
    expect(resolutions.create).toEqual([
      { examTypeId: TYPE_1, examId: EXAM_1, status: "RESOLVED", reason: null },
    ])
  })
})

describe("generateReportCard — generation lock (database-free)", () => {
  // The DB-free harness cannot prove PostgreSQL row-lock serialization (only a
  // real database can — see the DB-gated concurrency suite in
  // report-card-foundation.integration.test.ts). What it CAN prove is the
  // critical-section contract: exactly one lock, taken after the tenant check
  // and before every eligibility/version read that the decision relies on.
  it("takes the enrollment anchor after the tenant check and before every eligibility/version read", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 75 }),
    ])
    const harness = makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    await generateReportCard(INPUT, ACTOR)

    const indexes = harness.calls.map((call, index) => ({ ...call, index }))
    const lockCalls = indexes.filter((call) => call.op === "lock")
    expect(lockCalls).toHaveLength(1)
    const lockAt = lockCalls[0]!.index

    const firstAt = (predicate: (call: { op: string; args: Record<string, unknown> }) => boolean) => {
      const found = indexes.find(predicate)
      expect(found).toBeDefined()
      return found!.index
    }

    const tenantAt = firstAt((call) => call.op === "student.findFirst")
    const enrollmentAt = firstAt((call) => call.op === "studentEnrollment.findFirst")
    const draftAt = firstAt(
      (call) =>
        call.op === "reportCard.findFirst" &&
        (call.args.where as Record<string, unknown> | undefined)?.status === "DRAFT",
    )
    const previousAt = firstAt(
      (call) =>
        call.op === "reportCard.findFirst" &&
        (call.args.where as Record<string, unknown> | undefined)?.status === undefined &&
        call.args.orderBy !== undefined,
    )
    const createAt = firstAt((call) => call.op === "reportCard.create")

    expect(tenantAt).toBeLessThan(lockAt)
    expect(lockAt).toBeLessThan(enrollmentAt)
    expect(lockAt).toBeLessThan(draftAt)
    expect(lockAt).toBeLessThan(previousAt)
    expect(lockAt).toBeLessThan(createAt)
  })
})

describe("generateReportCard — tenant scoping (database-free)", () => {
  it("scopes every read to the actor's school", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 50 }),
    ])
    const harness = makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    await generateReportCard(INPUT, ACTOR)

    expect(whereOf(harness.calls, "student.findFirst").schoolId).toBe(SCHOOL_ID)
    expect(whereOf(harness.calls, "reportCardScheme.findFirst").schoolId).toBe(SCHOOL_ID)
    expect(whereOf(harness.calls, "examResult.findMany").schoolId).toBe(SCHOOL_ID)
    expect(whereOf(harness.calls, "exam.findMany").schoolId).toBe(SCHOOL_ID)
    expect(whereOf(harness.calls, "gradingBand.findMany").schoolId).toBe(SCHOOL_ID)

    const enrollmentWhere = whereOf(harness.calls, "studentEnrollment.findFirst")
    expect((enrollmentWhere.student as Record<string, unknown>).schoolId).toBe(SCHOOL_ID)

    const draftWhere = whereOf(harness.calls, "reportCard.findFirst")
    expect(draftWhere.schoolId).toBe(SCHOOL_ID)
    expect(draftWhere.status).toBe("DRAFT")

    expect(createData(harness.calls).schoolId).toBe(SCHOOL_ID)
    expect(createData(harness.calls).schoolId).not.toBe(OTHER_SCHOOL_ID)
  })
})

describe("generateReportCard — scheme precedence (database-free)", () => {
  it("prefers the section-specific scheme and never queries the class scheme", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 80 }),
    ])
    const harness = makeHarness({
      enrollment: { id: ENROLLMENT_ID, classId: CLASS_ID, sectionId: SECTION_ID },
      sectionScheme: scheme({ id: "scheme-section", exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      classScheme: scheme({ id: "scheme-class", exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    await generateReportCard({ ...INPUT, sectionId: SECTION_ID }, ACTOR)

    const schemeCalls = callsOf(harness.calls, "reportCardScheme.findFirst")
    expect(schemeCalls).toHaveLength(1)
    expect((schemeCalls[0]!.where as Record<string, unknown>).sectionId).toBe(SECTION_ID)
    expect((createData(harness.calls).snapshot as Record<string, unknown>).sectionId).toBe(
      SECTION_ID,
    )
  })

  it("falls back to the class-level scheme when no section scheme exists", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 80 }),
    ])
    const harness = makeHarness({
      enrollment: { id: ENROLLMENT_ID, classId: CLASS_ID, sectionId: SECTION_ID },
      sectionScheme: null,
      classScheme: scheme({ id: "scheme-class", exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    await generateReportCard({ ...INPUT, sectionId: SECTION_ID }, ACTOR)

    const schemeCalls = callsOf(harness.calls, "reportCardScheme.findFirst")
    expect(schemeCalls).toHaveLength(2)
    expect((schemeCalls[0]!.where as Record<string, unknown>).sectionId).toBe(SECTION_ID)
    expect((schemeCalls[1]!.where as Record<string, unknown>).sectionId).toBeNull()
  })
})

describe("generateReportCard — NOT_FINAL blocks every aggregation policy (database-free)", () => {
  it("blocks RAW generation when a scheme exam is NOT_FINAL", async () => {
    const harness = makeHarness({
      classScheme: scheme({
        aggregationPolicy: "RAW",
        exams: [schemeExam(TYPE_1, 1, "Term 1")],
      }),
      examResults: [],
      examInstances: [instance(EXAM_1, TYPE_1, "PUBLISHED")],
    })

    const error = await captureError(generateReportCard(INPUT, ACTOR))

    expect(error).toBeInstanceOf(ApiError)
    const api = error as ApiError
    expect(api.statusCode).toBe(400)
    expect(api.message).toContain("Term 1")
    expect(api.message).toContain("NOT_FINAL")
    expect(callsOf(harness.calls, "reportCard.create")).toHaveLength(0)
  })

  it("blocks PERCENTAGE_WEIGHTED generation with the exam diagnostic, not a weights error", async () => {
    const resolved = resolvedExam(EXAM_1, TYPE_1, [mark({ maxMarks: 100, obtained: 70 })])
    const harness = makeHarness({
      classScheme: scheme({
        aggregationPolicy: "PERCENTAGE_WEIGHTED",
        exams: [schemeExam(TYPE_1, 0.6, "Term 1"), schemeExam(TYPE_2, 0.4, "Midterm")],
      }),
      examResults: [resolved.result],
      examInstances: [resolved.instance, instance(EXAM_2, TYPE_2, "PUBLISHED")],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    const error = await captureError(generateReportCard(INPUT, ACTOR))

    const api = error as ApiError
    expect(api.statusCode).toBe(400)
    expect(api.message).toContain("Midterm")
    expect(api.message).toContain("NOT_FINAL")
    expect(api.message).not.toContain("weights must sum")
    expect(callsOf(harness.calls, "reportCard.create")).toHaveLength(0)
  })
})

describe("generateReportCard — missing marks vs absence (database-free)", () => {
  function forcedFailScheme(): SchemeRow {
    return scheme({
      absencePolicy: "TREAT_SUBJECT_AS_FAILED",
      exams: [schemeExam(TYPE_1, 1, "Term 1")],
    })
  }

  it("projects a missing mark as PENDING and fails closed, never as ABSENT/zero", async () => {
    // A FINAL exam + an expected subject, but the student has no ExamMark row.
    // Under TREAT_SUBJECT_AS_FAILED a wrongly-inferred ABSENT would resolve to a
    // forced FAIL and generate; correct PENDING behaviour blocks instead.
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [])
    const harness = makeHarness({
      classScheme: forcedFailScheme(),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    const error = await captureError(generateReportCard(INPUT, ACTOR))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain("require review")
    expect(callsOf(harness.calls, "reportCard.create")).toHaveLength(0)
  })

  it("treats a genuine ABSENT mark as a policy-forced fail, never as missing", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: null, isAbsent: true }),
    ])
    const harness = makeHarness({
      classScheme: forcedFailScheme(),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })

    await generateReportCard(INPUT, ACTOR)

    const subjects = createdSubjects(harness.calls)
    expect(subjects[0]!.outcome).toBe("FAIL")
    expect(subjects[0]!.reason).toBe("ABSENT_FORCED_FAIL")
    expect(subjects[0]!.absentExamIds).toEqual([EXAM_1])
    expect(createData(harness.calls).failedCount).toBe(1)
  })
})

describe("generateReportCard — weight projection by concrete exam id (database-free)", () => {
  it("projects each scheme exam's weight onto its resolved concrete exam", async () => {
    const first = resolvedExam(EXAM_1, TYPE_1, [mark({ maxMarks: 100, obtained: 60 })])
    const second = resolvedExam(EXAM_2, TYPE_2, [mark({ maxMarks: 100, obtained: 40 })])
    const harness = makeHarness({
      classScheme: scheme({
        aggregationPolicy: "PERCENTAGE_WEIGHTED",
        exams: [schemeExam(TYPE_1, 0.6, "Term 1"), schemeExam(TYPE_2, 0.4, "Term 2")],
      }),
      examResults: [first.result, second.result],
      examInstances: [first.instance, second.instance],
      examSubjects: [
        { examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) },
        { examId: EXAM_2, subjectId: SUBJECT_1, maxMarks: dec(100) },
      ],
    })

    await generateReportCard(INPUT, ACTOR)

    // 0.6 * 60% + 0.4 * 40% = 52%. A missing/incorrect weight projection would
    // surface as WEIGHTS_UNAVAILABLE and block generation entirely.
    const subjects = createdSubjects(harness.calls)
    expect(subjects[0]!.percentage).toBe("52.00")
    expect(subjects[0]!.includedExamIds).toEqual([EXAM_1, EXAM_2])
  })
})

describe("generateReportCard — version allocation and duplicate drafts (database-free)", () => {
  it("allocates the next version after a prior report and links supersedes", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 55 }),
    ])
    const harness = makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
      previous: { id: "rc-v1", version: 1 },
    })

    await generateReportCard(INPUT, ACTOR)

    const data = createData(harness.calls)
    expect(data.version).toBe(2)
    expect(data.supersedesReportCardId).toBe("rc-v1")
  })

  it("rejects generation with 409 while an active draft exists, before touching the scheme", async () => {
    const harness = makeHarness({ activeDraft: { id: "rc-draft", version: 2 } })

    const error = await captureError(generateReportCard(INPUT, ACTOR))

    const api = error as ApiError
    expect(api).toBeInstanceOf(ApiError)
    expect(api.statusCode).toBe(409)
    expect(api.code).toBe("REPORT_CARD_DRAFT_EXISTS")
    expect(callsOf(harness.calls, "reportCardScheme.findFirst")).toHaveLength(0)
    expect(callsOf(harness.calls, "reportCard.create")).toHaveLength(0)
  })

  it("maps a version unique-constraint race (P2002) to a 409 conflict", async () => {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 55 }),
    ])
    makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
      createError: new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    })

    const error = await captureError(generateReportCard(INPUT, ACTOR))

    const api = error as ApiError
    expect(api).toBeInstanceOf(ApiError)
    expect(api.statusCode).toBe(409)
    expect(api.code).toBe("REPORT_CARD_DRAFT_EXISTS")
  })
})

describe("generateReportCard — snapshot hash determinism (database-free)", () => {
  function deterministicHarness(): Harness {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 68 }),
    ])
    return makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
    })
  }

  it("produces the same hash for identical frozen data", async () => {
    const first = deterministicHarness()
    await generateReportCard(INPUT, ACTOR)
    const hash1 = createData(first.calls).snapshotHash

    const second = deterministicHarness()
    await generateReportCard(INPUT, ACTOR)
    const hash2 = createData(second.calls).snapshotHash

    expect(hash1).toBe(hash2)
    expect(String(hash1)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("generateReportCard — domain errors (database-free)", () => {
  it("returns 404 when the student is not in the school", async () => {
    makeHarness({ student: null })
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    const api = error as ApiError
    expect(api.statusCode).toBe(404)
    expect(api.code).toBe("NOT_FOUND")
  })

  it("rejects a placement that does not match the requested class", async () => {
    makeHarness({
      enrollment: { id: ENROLLMENT_ID, classId: "00000000-0000-4000-8000-0000000000c9", sectionId: null },
    })
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    const api = error as ApiError
    expect(api.statusCode).toBe(400)
    expect(api.message).toContain("class")
  })

  it("returns 404 when no scheme matches the placement", async () => {
    makeHarness({ classScheme: null, sectionScheme: null })
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    const api = error as ApiError
    expect(api.statusCode).toBe(404)
  })

  it("returns 503 when no database is configured", async () => {
    mockGetPrisma.mockResolvedValue(null)
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    const api = error as ApiError
    expect(api.statusCode).toBe(503)
    expect(api.code).toBe("SERVICE_UNAVAILABLE")
  })
})

describe("generateReportCard — signatory configuration gate (database-free)", () => {
  function happyHarness(signatories: string | null): Harness {
    const { result, instance: exam } = resolvedExam(EXAM_1, TYPE_1, [
      mark({ maxMarks: 100, obtained: 70 }),
    ])
    return makeHarness({
      classScheme: scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] }),
      examResults: [result],
      examInstances: [exam],
      examSubjects: [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: dec(100) }],
      signatories,
    })
  }

  it("blocks generation when no signatory configuration exists", async () => {
    const harness = happyHarness(null)
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).code).toBe("REPORT_CARD_SIGNATORIES_REQUIRED")
    expect(callsOf(harness.calls, "reportCard.create")).toHaveLength(0)
  })

  it("blocks generation when the signatory list is empty", async () => {
    const harness = happyHarness("[]")
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    expect((error as ApiError).code).toBe("REPORT_CARD_SIGNATORIES_REQUIRED")
    expect(callsOf(harness.calls, "reportCard.create")).toHaveLength(0)
  })

  it("blocks generation when the signatory configuration is corrupt", async () => {
    const harness = happyHarness("{not json")
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    expect((error as ApiError).code).toBe("REPORT_CARD_SIGNATORIES_INVALID")
    expect(callsOf(harness.calls, "reportCard.create")).toHaveLength(0)
  })

  it("freezes the configured signatories into the v2 snapshot", async () => {
    const harness = happyHarness(JSON.stringify([{ role: "Principal", name: "Dr. Rao" }]))
    await generateReportCard(INPUT, ACTOR)
    const snapshot = createData(harness.calls).snapshot as Record<string, unknown>
    expect(snapshot.signatories).toEqual([{ role: "Principal", name: "Dr. Rao" }])
  })
})

describe("listReportCards (database-free)", () => {
  it("scopes to the school and paginates the filtered result", async () => {
    const harness = makeHarness({ listTotal: 41, listRows: [{ id: "rc-1" }] })

    const result = await listReportCards(
      {
        page: 2,
        pageSize: 20,
        studentId: STUDENT_ID,
        academicSessionId: SESSION_ID,
        classId: CLASS_ID,
        sectionId: SECTION_ID,
        status: "ISSUED",
      },
      SCHOOL_ID,
    )

    const where = whereOf(harness.calls, "reportCard.count")
    expect(where.schoolId).toBe(SCHOOL_ID)
    expect(where.studentId).toBe(STUDENT_ID)
    expect(where.academicSessionId).toBe(SESSION_ID)
    expect(where.classId).toBe(CLASS_ID)
    expect(where.sectionId).toBe(SECTION_ID)
    expect(where.status).toBe("ISSUED")

    const findWhere = whereOf(harness.calls, "reportCard.findMany")
    expect(findWhere.schoolId).toBe(SCHOOL_ID)
    expect(callsOf(harness.calls, "reportCard.findMany")[0]!.skip).toBe(20)
    expect(callsOf(harness.calls, "reportCard.findMany")[0]!.take).toBe(20)

    expect(result.total).toBe(41)
    expect(result.items).toHaveLength(1)
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 })
  })
})

describe("getReportCard (database-free)", () => {
  it("scopes the lookup to the school and returns the card", async () => {
    const harness = makeHarness({ foundCard: { id: "rc-x" } })
    const card = await getReportCard("rc-x", SCHOOL_ID)
    expect((card as { id: string }).id).toBe("rc-x")
    const where = whereOf(harness.calls, "reportCard.findFirst")
    expect(where.id).toBe("rc-x")
    expect(where.schoolId).toBe(SCHOOL_ID)
  })

  it("returns 404 when the card is not found", async () => {
    makeHarness({ foundCard: null })
    const error = await captureError(getReportCard("missing", SCHOOL_ID))
    expect((error as ApiError).statusCode).toBe(404)
  })
})
