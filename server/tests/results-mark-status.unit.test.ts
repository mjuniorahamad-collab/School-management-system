// Database-free tests for D1: the `ExamMark.status` entry integration
// (docs/report-card.md §4). The Prisma access layer is mocked at
// `lib/database.js`, exactly as the Results transaction tests do, so this suite
// never imports a live client, never connects, and never touches the database.
//
// It asserts entry behaviour the specification requires — the effective status
// is persisted on create and update, the legacy `isAbsent`/`obtainedMarks`
// contract is preserved (missing marks are never zero or ABSENT), and
// NOT_APPLICABLE is rejected on a core subject but allowed otherwise — rather
// than re-testing the pure report-card engine (covered by its own suite).

import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { ApiError } from "../src/lib/ApiError.js"
import { putSubjectMarks } from "../src/modules/results/result.service.js"
import {
  putSubjectMarksSchema,
  type PutSubjectMarksInput,
} from "../src/modules/results/result.schema.js"

const mockGetPrisma = vi.mocked(getPrisma)

const SCHOOL_ID = "00000000-0000-4000-8000-0000000000a1"
const SESSION_ID = "00000000-0000-4000-8000-0000000000cc"
const CLASS_ID = "00000000-0000-4000-8000-0000000000dd"
const SECTION_ID = "00000000-0000-4000-8000-0000000000de"
const EXAM_ID = "00000000-0000-4000-8000-0000000000bb"
const EXAM_SUBJECT_ID = "00000000-0000-4000-8000-0000000000ee"
const SUBJECT_ID = "00000000-0000-4000-8000-0000000000e1"
const OTHER_SUBJECT_ID = "00000000-0000-4000-8000-0000000000e2"
const ENROLLMENT_ID = "00000000-0000-4000-8000-0000000000d1"
const ACTOR_ID = "00000000-0000-4000-8000-0000000000ff"

const MAX_MARKS = 100
const PASS_MARKS = 40
// ExamMark INSERT binds 15 columns per row; the mapper below indexes into that.
const COLUMNS_PER_ROW = 15

type Status = "SCORED" | "ABSENT" | "NOT_APPLICABLE" | "PENDING"

const ADMIN_ACTOR = {
  schoolId: SCHOOL_ID,
  userId: ACTOR_ID,
  roles: ["ADMIN"],
  name: "Admin User",
  email: "admin@example.com",
}

interface RowInput {
  enrollmentId: string
  obtainedMarks?: number | null
  isAbsent?: boolean
  status?: Status
}

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

interface HarnessOptions {
  sectionId?: string | null
  subjectId?: string
  rows?: RowInput[]
  sectionScheme?: { coreSubjectIds: string[] } | null
  classScheme?: { coreSubjectIds: string[] } | null
}

interface MarkInsert {
  text: string
  values: unknown[]
}

interface Harness {
  /** The exact rows handed to `putSubjectMarks`. */
  inputRows: PutSubjectMarksInput["rows"]
  /** Every `reportCardScheme.findFirst` `where` clause, in call order. */
  schemeCalls: Array<Record<string, unknown>>
  getMarkInsert: () => MarkInsert | null
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const sectionId = options.sectionId ?? null
  const subjectId = options.subjectId ?? SUBJECT_ID
  const rawRows: RowInput[] =
    options.rows ?? [{ enrollmentId: ENROLLMENT_ID, obtainedMarks: 80, isAbsent: false }]

  const inputRows: PutSubjectMarksInput["rows"] = rawRows.map((row) => ({
    enrollmentId: row.enrollmentId,
    obtainedMarks: row.obtainedMarks ?? null,
    isAbsent: row.isAbsent ?? false,
    ...(row.status ? { status: row.status } : {}),
  }))

  const enrollments = inputRows.map((row, index) => ({
    id: row.enrollmentId,
    studentId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  }))
  const existingResults = new Map<string, string>()

  const schemeCalls: Array<Record<string, unknown>> = []
  let markInsert: MarkInsert | null = null

  const tx = {
    examResult: {
      findMany: vi.fn(async (args: { where?: { enrollmentId?: { in?: string[] } } }) => {
        const ids = args.where?.enrollmentId?.in ?? []
        return ids
          .filter((id) => existingResults.has(id))
          .map((id) => ({ id: existingResults.get(id) as string, enrollmentId: id }))
      }),
      createMany: vi.fn(async () => {
        for (const enrollment of enrollments) {
          if (!existingResults.has(enrollment.id)) {
            existingResults.set(
              enrollment.id,
              `30000000-0000-4000-8000-${enrollment.id.slice(-12)}`,
            )
          }
        }
        return { count: enrollments.length }
      }),
    },
    examMark: {
      // The aggregate re-read returns nothing; the aggregate path is covered by
      // the dedicated transaction suite, not here.
      findMany: vi.fn(async () => []),
    },
    auditLog: { create: vi.fn(async () => ({ id: "audit-1" })) },
    $executeRaw: vi.fn(async (sql: Prisma.Sql) => {
      if (sql.text.includes('INSERT INTO "ExamMark"')) {
        markInsert = { text: sql.text, values: [...sql.values] }
      }
      return 1
    }),
  }

  const prisma = {
    exam: {
      findFirst: vi.fn(async () => ({
        id: EXAM_ID,
        status: "PUBLISHED",
        academicSessionId: SESSION_ID,
        classId: CLASS_ID,
        sectionId,
      })),
    },
    examSubject: {
      findFirst: vi.fn(async () => ({
        id: EXAM_SUBJECT_ID,
        subjectId,
        teacherId: null,
        subject: { code: "MAT", name: "Mathematics" },
      })),
      findMany: vi.fn(async () => [
        { id: EXAM_SUBJECT_ID, maxMarks: dec(MAX_MARKS), passMarks: dec(PASS_MARKS) },
      ]),
    },
    studentEnrollment: { findMany: vi.fn(async () => enrollments) },
    gradingBand: {
      findMany: vi.fn(async () => [
        { minPercent: 0, maxPercent: 49, grade: "F" },
        { minPercent: 50, maxPercent: 100, grade: "A" },
      ]),
    },
    reportCardScheme: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        schemeCalls.push(args.where)
        const whereSection = args.where.sectionId
        if (whereSection !== null && whereSection !== undefined) {
          return options.sectionScheme ?? null
        }
        return options.classScheme ?? null
      }),
    },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (client: unknown) => unknown)(tx)
        : Promise.all(arg as []),
    ),
  }

  mockGetPrisma.mockResolvedValue(prisma as unknown as Awaited<ReturnType<typeof getPrisma>>)

  return { inputRows, schemeCalls, getMarkInsert: () => markInsert }
}

/** Projects the captured ExamMark INSERT bindings back to their row columns. */
function persistedMarks(insert: MarkInsert): Array<{
  obtainedMarks: unknown
  isAbsent: unknown
  status: unknown
}> {
  const rows: Array<{ obtainedMarks: unknown; isAbsent: unknown; status: unknown }> = []
  for (let i = 0; i < insert.values.length; i += COLUMNS_PER_ROW) {
    rows.push({
      obtainedMarks: insert.values[i + 4],
      isAbsent: insert.values[i + 5],
      status: insert.values[i + 6],
    })
  }
  return rows
}

function requireInsert(harness: Harness): MarkInsert {
  const insert = harness.getMarkInsert()
  if (!insert) throw new Error("expected an ExamMark INSERT to have been issued")
  return insert
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

async function save(harness: Harness): Promise<unknown> {
  return putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows: harness.inputRows }, ADMIN_ACTOR)
}

beforeEach(() => {
  mockGetPrisma.mockReset()
  vi.clearAllMocks()
})

describe("putSubjectMarks — status persistence (database-free)", () => {
  it("persists an explicit SCORED status together with obtained marks", async () => {
    const harness = makeHarness({
      rows: [{ enrollmentId: ENROLLMENT_ID, obtainedMarks: 80, isAbsent: false, status: "SCORED" }],
    })

    await save(harness)

    const marks = persistedMarks(requireInsert(harness))
    expect(marks).toHaveLength(1)
    expect(marks[0].status).toBe("SCORED")
    expect(marks[0].isAbsent).toBe(false)
    expect(marks[0].obtainedMarks).toBeInstanceOf(Prisma.Decimal)
  })

  it("persists an explicit ABSENT status and coerces isAbsent to true", async () => {
    const harness = makeHarness({
      rows: [
        { enrollmentId: ENROLLMENT_ID, obtainedMarks: null, isAbsent: false, status: "ABSENT" },
      ],
    })

    await save(harness)

    const marks = persistedMarks(requireInsert(harness))
    expect(marks[0].status).toBe("ABSENT")
    expect(marks[0].isAbsent).toBe(true)
    expect(marks[0].obtainedMarks).toBeNull()
  })

  it("persists PENDING with no marks and no absence", async () => {
    const harness = makeHarness({
      rows: [
        { enrollmentId: ENROLLMENT_ID, obtainedMarks: null, isAbsent: false, status: "PENDING" },
      ],
    })

    await save(harness)

    const marks = persistedMarks(requireInsert(harness))
    expect(marks[0].status).toBe("PENDING")
    expect(marks[0].isAbsent).toBe(false)
    expect(marks[0].obtainedMarks).toBeNull()
  })

  it("updates status on conflict as well as on insert", async () => {
    const harness = makeHarness({
      rows: [{ enrollmentId: ENROLLMENT_ID, obtainedMarks: 55, isAbsent: false, status: "SCORED" }],
    })

    await save(harness)

    expect(requireInsert(harness).text).toContain('"status" = EXCLUDED."status"')
  })
})

describe("putSubjectMarks — legacy backward compatibility (database-free)", () => {
  it("derives ABSENT from isAbsent when the client sends no status", async () => {
    // A legacy client omitting `status` entirely.
    const harness = makeHarness({
      rows: [{ enrollmentId: ENROLLMENT_ID, obtainedMarks: null, isAbsent: true }],
    })

    await save(harness)

    const marks = persistedMarks(requireInsert(harness))
    expect(marks[0].status).toBe("ABSENT")
    expect(marks[0].isAbsent).toBe(true)
  })

  it("derives SCORED from obtained marks when the client sends no status", async () => {
    const harness = makeHarness({
      rows: [{ enrollmentId: ENROLLMENT_ID, obtainedMarks: 75, isAbsent: false }],
    })

    await save(harness)

    expect(persistedMarks(requireInsert(harness))[0].status).toBe("SCORED")
  })

  it("treats a cleared legacy cell as PENDING, never as zero or ABSENT", async () => {
    const harness = makeHarness({
      rows: [{ enrollmentId: ENROLLMENT_ID, obtainedMarks: null, isAbsent: false }],
    })

    await save(harness)

    const marks = persistedMarks(requireInsert(harness))
    expect(marks[0].status).toBe("PENDING")
    expect(marks[0].isAbsent).toBe(false)
    // The mark stays null — it is never coerced to 0.
    expect(marks[0].obtainedMarks).toBeNull()
  })
})

describe("putSubjectMarks — NOT_APPLICABLE core-subject guard (database-free)", () => {
  const notApplicableRow: RowInput = {
    enrollmentId: ENROLLMENT_ID,
    obtainedMarks: null,
    isAbsent: false,
    status: "NOT_APPLICABLE",
  }

  it("rejects NOT_APPLICABLE on a core subject with 400 and writes nothing", async () => {
    const harness = makeHarness({
      rows: [notApplicableRow],
      classScheme: { coreSubjectIds: [SUBJECT_ID] },
    })

    const error = await captureError(save(harness))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).message).toContain("core subject")
    expect(harness.getMarkInsert()).toBeNull()
  })

  it("allows NOT_APPLICABLE when the subject is not in the core set", async () => {
    const harness = makeHarness({
      rows: [notApplicableRow],
      classScheme: { coreSubjectIds: [OTHER_SUBJECT_ID] },
    })

    await save(harness)

    expect(persistedMarks(requireInsert(harness))[0].status).toBe("NOT_APPLICABLE")
  })

  it("allows NOT_APPLICABLE when no scheme is configured for the placement", async () => {
    const harness = makeHarness({ rows: [notApplicableRow], classScheme: null })

    await save(harness)

    expect(persistedMarks(requireInsert(harness))[0].status).toBe("NOT_APPLICABLE")
  })

  it("uses the section-specific scheme's core set in preference to the class-level one", async () => {
    const harness = makeHarness({
      sectionId: SECTION_ID,
      rows: [notApplicableRow],
      sectionScheme: { coreSubjectIds: [SUBJECT_ID] },
      classScheme: { coreSubjectIds: [] },
    })

    const error = await captureError(save(harness))

    expect((error as ApiError).statusCode).toBe(400)
    // The section scheme resolves first and short-circuits the class lookup.
    expect(harness.schemeCalls).toHaveLength(1)
    expect(harness.schemeCalls[0].sectionId).toBe(SECTION_ID)
  })

  it("scopes the core-subject lookup to the actor's school and the exam placement", async () => {
    const harness = makeHarness({
      rows: [{ enrollmentId: ENROLLMENT_ID, obtainedMarks: 60, isAbsent: false }],
      classScheme: { coreSubjectIds: [] },
    })

    await save(harness)

    expect(harness.schemeCalls[0]).toMatchObject({
      schoolId: SCHOOL_ID,
      academicSessionId: SESSION_ID,
      classId: CLASS_ID,
      sectionId: null,
    })
  })
})

describe("putSubjectMarksSchema — status combination validation (database-free)", () => {
  function parseRow(row: Record<string, unknown>) {
    return putSubjectMarksSchema.safeParse({ rows: [{ enrollmentId: ENROLLMENT_ID, ...row }] })
  }

  it("accepts a bare ABSENT status with isAbsent omitted", () => {
    expect(parseRow({ status: "ABSENT" }).success).toBe(true)
  })

  it("accepts a legacy row with no status at all", () => {
    expect(parseRow({ obtainedMarks: 70, isAbsent: false }).success).toBe(true)
  })

  it("rejects ABSENT carrying obtained marks", () => {
    expect(parseRow({ status: "ABSENT", obtainedMarks: 10 }).success).toBe(false)
  })

  it("rejects PENDING carrying obtained marks", () => {
    expect(parseRow({ status: "PENDING", obtainedMarks: 10 }).success).toBe(false)
  })

  it("rejects NOT_APPLICABLE carrying obtained marks", () => {
    expect(parseRow({ status: "NOT_APPLICABLE", obtainedMarks: 10 }).success).toBe(false)
  })

  it("rejects isAbsent combined with a non-ABSENT status", () => {
    expect(parseRow({ isAbsent: true, status: "SCORED" }).success).toBe(false)
  })
})
