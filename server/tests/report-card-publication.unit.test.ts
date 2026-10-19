// Database-free tests for the Annual Report Card publication lifecycle
// (docs/report-card.md §8). The Prisma access layer is mocked at
// `lib/database.js`, exactly as the report-card-service suite does, so these
// suites never import a live client, never connect, and never touch the
// database.
//
// They assert the behaviour the specification requires: publication validates
// the STORED frozen snapshot (never recalculated live marks), fails closed on
// every §8 academic precondition, guards the DRAFT→PENDING_ARCHIVE transition,
// and requires an explicit reason when a new version supersedes an already
// published one without ever mutating that superseded version's status.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { ApiError } from "../src/lib/ApiError.js"
import {
  generateReportCard,
  publishReportCard,
} from "../src/modules/report-cards/report-card.service.js"
import type { GenerateReportCardInput } from "../src/modules/report-cards/report-card.api.schema.js"

const mockGetPrisma = vi.mocked(getPrisma)

const SCHOOL_ID = "00000000-0000-4000-8000-0000000000a1"
const OTHER_SCHOOL_ID = "00000000-0000-4000-8000-0000000000a2"
const SESSION_ID = "00000000-0000-4000-8000-0000000000b1"
const CLASS_ID = "00000000-0000-4000-8000-0000000000c1"
const STUDENT_ID = "00000000-0000-4000-8000-0000000000d1"
const ENROLLMENT_ID = "00000000-0000-4000-8000-0000000000d2"
const ACTOR_ID = "00000000-0000-4000-8000-0000000000e1"
const TYPE_1 = "00000000-0000-4000-8000-0000000000f1"
const EXAM_1 = "00000000-0000-4000-8000-0000000010f1"
const SUBJECT_1 = "00000000-0000-4000-8000-0000000020f1"
const CARD_ID = "00000000-0000-4000-8000-0000000030f1"

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

// ────────────────────────────────────────────────────────────────────────────
// Publication harness (publishReportCard reads the frozen card only)
// ────────────────────────────────────────────────────────────────────────────

interface FrozenCard {
  id: string
  status: string
  overallResult: string | null
  requiresReview: boolean
  subjects: Array<{ outcome: string }>
  examResolutions: Array<{ status: string }>
  snapshot?: unknown
}

function frozenCard(overrides: Partial<FrozenCard> = {}): FrozenCard {
  return {
    id: CARD_ID,
    status: "DRAFT",
    overallResult: "PASS",
    requiresReview: false,
    subjects: [{ outcome: "PASS" }],
    examResolutions: [{ status: "RESOLVED" }],
    // Default to the new normal: a v2 snapshot carrying valid signatories.
    snapshot: { schemaVersion: 2, signatories: [{ role: "Principal", name: "Dr. Rao" }] },
    ...overrides,
  }
}

interface PublishCall {
  op: string
  args: Record<string, unknown>
}

interface PublishHarness {
  calls: PublishCall[]
}

// publishReportCard mirrors issueReportCard: one interactive transaction that
// takes the student-scope lock before reading the card. The pre-lock read is
// the scope lookup (a `select`); the locked read carries the `include`.
function makePublishHarness(
  options: { card?: FrozenCard | null; updateCount?: number } = {},
): PublishHarness {
  const calls: PublishCall[] = []
  const rec = (op: string, args: Record<string, unknown>): void => {
    calls.push({ op, args })
  }
  const card = options.card === undefined ? frozenCard() : options.card

  const tx = {
    reportCard: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        if (args.include) {
          rec("reportCard.findFirst:card", args)
          return card
        }
        rec("reportCard.findFirst:scope", args)
        return card ? { academicSessionId: SESSION_ID, studentId: STUDENT_ID } : null
      }),
      updateMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("reportCard.updateMany", args)
        return { count: options.updateCount ?? 1 }
      }),
      update: vi.fn(async (args: Record<string, unknown>) => {
        rec("reportCard.update", args)
        return card
      }),
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => card),
    },
    $queryRaw: vi.fn(async () => {
      rec("lock", {})
      return [{ id: STUDENT_ID }]
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

function callsOf(calls: PublishCall[], op: string): Record<string, unknown>[] {
  return calls.filter((call) => call.op === op).map((call) => call.args)
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Generation harness (reissue bookkeeping runs inside generateReportCard)
// ────────────────────────────────────────────────────────────────────────────

interface SchemeExamRow {
  examTypeId: string
  weight: { toString(): string }
  sortOrder: number
  examType: { name: string }
}

interface SchemeRow {
  id: string
  scopeKey: string
  aggregationPolicy: string
  absencePolicy: string
  overallPassMode: string
  annualSubjectPassPercent: { toString(): string }
  overallPassPercent: { toString(): string } | null
  maxFailedSubjects: number | null
  coreSubjectIds: string[]
  exams: SchemeExamRow[]
}

function schemeExam(examTypeId: string, weight: number, name: string): SchemeExamRow {
  return {
    examTypeId,
    weight: { toString: () => weight.toString() },
    sortOrder: 0,
    examType: { name },
  }
}

function scheme(overrides: Partial<SchemeRow> = {}): SchemeRow {
  return {
    id: "scheme-1",
    scopeKey: "class",
    aggregationPolicy: "RAW",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "ALL_SUBJECTS",
    annualSubjectPassPercent: { toString: () => "40" },
    overallPassPercent: null,
    maxFailedSubjects: null,
    coreSubjectIds: [],
    exams: [],
    ...overrides,
  }
}

function decimal(value: number): { toString(): string } {
  return { toString: () => String(value) }
}

interface GenerateHarnessOptions {
  previous?: { id: string; version: number; status?: string } | null
}

interface GenerateHarness {
  calls: PublishCall[]
}

function makeGenerateHarness(options: GenerateHarnessOptions = {}): GenerateHarness {
  const calls: PublishCall[] = []
  const rec = (op: string, args: Record<string, unknown>): void => {
    calls.push({ op, args })
  }
  const previous = options.previous ?? null

  const examResults = [
    {
      examId: EXAM_1,
      exam: { id: EXAM_1, examTypeId: TYPE_1, classId: CLASS_ID, sectionId: null, status: "FINAL" },
      marks: [
        {
          status: "SCORED",
          isAbsent: false,
          obtainedMarks: decimal(75),
          examSubject: { subjectId: SUBJECT_1, maxMarks: decimal(100) },
        },
      ],
    },
  ]
  const examInstances = [
    {
      id: EXAM_1,
      examTypeId: TYPE_1,
      classId: CLASS_ID,
      sectionId: null,
      status: "FINAL",
      name: "Term 1 Exam",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-05T00:00:00.000Z"),
    },
  ]
  const examSubjects = [{ examId: EXAM_1, subjectId: SUBJECT_1, maxMarks: decimal(100) }]

  const tx = {
    student: {
      findFirst: vi.fn(async () => ({
        id: STUDENT_ID,
        admissionNumber: "ADM-0001",
        firstName: "Aria",
        middleName: null,
        lastName: "Khan",
      })),
    },
    studentEnrollment: {
      findFirst: vi.fn(async () => ({ id: ENROLLMENT_ID, classId: CLASS_ID, sectionId: null })),
    },
    academicSession: { findFirst: vi.fn(async () => ({ id: SESSION_ID, name: "2026-2027" })) },
    class: { findFirst: vi.fn(async () => ({ id: CLASS_ID, name: "Grade 1" })) },
    section: { findFirst: vi.fn(async () => null) },
    subject: { findMany: vi.fn(async () => [{ id: SUBJECT_1, name: "Mathematics" }]) },
    school: {
      findUnique: vi.fn(async () => ({ id: SCHOOL_ID, name: "Bright Future International School" })),
    },
    schoolSetting: {
      findUnique: vi.fn(async () => ({
        value: JSON.stringify([{ role: "Principal", name: "Dr. Rao" }]),
      })),
      findMany: vi.fn(async () => []),
    },
    reportCardScheme: {
      findFirst: vi.fn(async () => scheme({ exams: [schemeExam(TYPE_1, 1, "Term 1")] })),
    },
    examResult: { findMany: vi.fn(async () => examResults) },
    exam: { findMany: vi.fn(async () => examInstances) },
    examSubject: { findMany: vi.fn(async () => examSubjects) },
    gradingBand: {
      findMany: vi.fn(async () => [{ minPercent: 0, maxPercent: 100, grade: "A" }]),
    },
    reportCard: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("tx.reportCard.findFirst", args)
        const where = (args.where ?? {}) as Record<string, unknown>
        if (where.status === "DRAFT") return null
        if (args.orderBy) return previous
        return null
      }),
      create: vi.fn(async (args: Record<string, unknown>) => {
        rec("tx.reportCard.create", args)
        return { id: "rc-created", ...(args.data as Record<string, unknown>) }
      }),
      update: vi.fn(async (args: Record<string, unknown>) => {
        rec("tx.reportCard.update", args)
        return null
      }),
    },
    $queryRaw: vi.fn(async () => {
      rec("lock.enrollment", {})
      return [{ id: ENROLLMENT_ID }]
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

function createData(calls: PublishCall[]): Record<string, unknown> {
  const args = callsOf(calls, "tx.reportCard.create")[0]
  return (args?.data ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  mockGetPrisma.mockReset()
  vi.clearAllMocks()
})

describe("publishReportCard — frozen-snapshot preconditions (database-free)", () => {
  it("publishes a frozen PASS draft as PENDING_ARCHIVE", async () => {
    const harness = makePublishHarness()

    const published = await publishReportCard(CARD_ID, ACTOR)

    expect((published as { id: string }).id).toBe(CARD_ID)
    const update = callsOf(harness.calls, "reportCard.updateMany")[0]!
    expect(update.where).toEqual({ id: CARD_ID, schoolId: SCHOOL_ID, status: "DRAFT" })
    const data = update.data as Record<string, unknown>
    expect(data.status).toBe("PENDING_ARCHIVE")
    expect(data.publishedAt).toBeInstanceOf(Date)
    expect(data.publishedByUserId).toBe(ACTOR_ID)
  })

  it("publishes a frozen FAIL draft", async () => {
    const harness = makePublishHarness({ card: frozenCard({ overallResult: "FAIL" }) })
    await publishReportCard(CARD_ID, ACTOR)
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(1)
  })

  it("reads only the frozen card — never live marks, exams or grading bands", async () => {
    const harness = makePublishHarness()
    await publishReportCard(CARD_ID, ACTOR)
    const ops = harness.calls.map((call) => call.op)
    expect(ops).not.toContain("examResult.findMany")
    expect(ops).not.toContain("exam.findMany")
    expect(ops).not.toContain("gradingBand.findMany")
    const load = callsOf(harness.calls, "reportCard.findFirst:card")[0]!
    expect(load.include).toEqual({ subjects: true, examResolutions: true })
  })

  it("takes the student-scope lock before reading and flipping the card", async () => {
    const harness = makePublishHarness()
    await publishReportCard(CARD_ID, ACTOR)
    const ops = harness.calls.map((call) => call.op)
    expect(ops.indexOf("reportCard.findFirst:scope")).toBeLessThan(ops.indexOf("lock"))
    expect(ops.indexOf("lock")).toBeLessThan(ops.indexOf("reportCard.findFirst:card"))
    expect(ops.indexOf("lock")).toBeLessThan(ops.indexOf("reportCard.updateMany"))
  })

  it("only flips this card to PENDING_ARCHIVE — never demotes sibling versions", async () => {
    const harness = makePublishHarness()
    await publishReportCard(CARD_ID, ACTOR)
    const updates = callsOf(harness.calls, "reportCard.updateMany")
    expect(updates).toHaveLength(1)
    expect(updates[0]!.where).toEqual({ id: CARD_ID, schoolId: SCHOOL_ID, status: "DRAFT" })
  })

  it("writes only the publication stamps, never reissue bookkeeping", async () => {
    const harness = makePublishHarness()
    await publishReportCard(CARD_ID, ACTOR)
    const data = callsOf(harness.calls, "reportCard.updateMany")[0]!.data as Record<string, unknown>
    expect(Object.keys(data).sort()).toEqual(["publishedAt", "publishedByUserId", "status"])
  })
})

describe("publishReportCard — fails closed on §8 preconditions (database-free)", () => {
  it("rejects an UNRESOLVED overall result", async () => {
    const harness = makePublishHarness({ card: frozenCard({ overallResult: "UNRESOLVED" }) })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api).toBeInstanceOf(ApiError)
    expect(api.statusCode).toBe(409)
    expect(api.code).toBe("REPORT_CARD_NOT_PUBLISHABLE")
    expect(api.message).toContain("PASS or FAIL")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })

  it("rejects a REQUIRES_REVIEW overall result", async () => {
    const harness = makePublishHarness({
      card: frozenCard({ overallResult: "REQUIRES_REVIEW", requiresReview: true }),
    })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    expect((error as ApiError).code).toBe("REPORT_CARD_NOT_PUBLISHABLE")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })

  it("rejects a card with an unresolved scheme exam", async () => {
    const harness = makePublishHarness({
      card: frozenCard({ examResolutions: [{ status: "NOT_FINAL" }] }),
    })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api.code).toBe("REPORT_CARD_NOT_PUBLISHABLE")
    expect(api.message).toContain("not resolved")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })

  it("rejects a card with a subject that still requires review", async () => {
    const harness = makePublishHarness({
      card: frozenCard({ subjects: [{ outcome: "REQUIRES_REVIEW" }] }),
    })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api.code).toBe("REPORT_CARD_NOT_PUBLISHABLE")
    expect(api.message).toContain("require review")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })
})

describe("publishReportCard — frozen signatory gate (database-free)", () => {
  it("publishes a v2 snapshot with valid frozen signatories", async () => {
    const harness = makePublishHarness()
    await publishReportCard(CARD_ID, ACTOR)
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(1)
  })

  it("publishes a legacy v1 snapshot without consulting live settings", async () => {
    const harness = makePublishHarness({ card: frozenCard({ snapshot: { schemaVersion: 1 } }) })
    const published = await publishReportCard(CARD_ID, ACTOR)
    expect((published as { id: string }).id).toBe(CARD_ID)
    const ops = harness.calls.map((call) => call.op)
    expect(ops).not.toContain("schoolSetting.findUnique")
    expect(ops).not.toContain("school.findUnique")
  })

  it("publishes a card with no frozen snapshot (pre-v2 legacy)", async () => {
    const harness = makePublishHarness({ card: frozenCard({ snapshot: null }) })
    await publishReportCard(CARD_ID, ACTOR)
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(1)
  })

  it("rejects a v2 snapshot with no signatories", async () => {
    const harness = makePublishHarness({
      card: frozenCard({ snapshot: { schemaVersion: 2, signatories: [] } }),
    })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api.statusCode).toBe(409)
    expect(api.code).toBe("REPORT_CARD_NOT_PUBLISHABLE")
    expect((api.details as { reason?: string } | undefined)?.reason).toBe("FROZEN_SIGNATORIES_MISSING")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })

  it("rejects a v2 snapshot with corrupt signatories", async () => {
    const harness = makePublishHarness({
      card: frozenCard({ snapshot: { schemaVersion: 2, signatories: [{ role: "", name: "x" }] } }),
    })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api.code).toBe("REPORT_CARD_NOT_PUBLISHABLE")
    expect((api.details as { reason?: string } | undefined)?.reason).toBe("FROZEN_SIGNATORIES_CORRUPT")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })

  it("fails closed on an unrecognized snapshot version", async () => {
    const harness = makePublishHarness({
      card: frozenCard({ snapshot: { schemaVersion: 3 } }),
    })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api.code).toBe("REPORT_CARD_NOT_PUBLISHABLE")
    expect((api.details as { reason?: string } | undefined)?.reason).toBe("UNKNOWN_SNAPSHOT_VERSION")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })
})

describe("publishReportCard — state and tenant guards (database-free)", () => {
  it("rejects publishing a card that is already PENDING_ARCHIVE", async () => {
    const harness = makePublishHarness({ card: frozenCard({ status: "PENDING_ARCHIVE" }) })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api.statusCode).toBe(409)
    expect(api.code).toBe("REPORT_CARD_INVALID_STATE")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(0)
  })

  it("treats a concurrent publish (update count 0) as an invalid-state conflict", async () => {
    const harness = makePublishHarness({ updateCount: 0 })
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    expect((error as ApiError).code).toBe("REPORT_CARD_INVALID_STATE")
    expect(callsOf(harness.calls, "reportCard.updateMany")).toHaveLength(1)
  })

  it("scopes the load to the actor's school", async () => {
    const harness = makePublishHarness()
    await publishReportCard(CARD_ID, ACTOR)
    const load = callsOf(harness.calls, "reportCard.findFirst:card")[0]!
    const where = load.where as Record<string, unknown>
    expect(where.schoolId).toBe(SCHOOL_ID)
    expect(where.schoolId).not.toBe(OTHER_SCHOOL_ID)
  })

  it("returns 404 when the card is not found", async () => {
    makePublishHarness({ card: null })
    const error = await captureError(publishReportCard("missing", ACTOR))
    expect((error as ApiError).statusCode).toBe(404)
  })

  it("returns 503 when no database is configured", async () => {
    mockGetPrisma.mockResolvedValue(null)
    const error = await captureError(publishReportCard(CARD_ID, ACTOR))
    const api = error as ApiError
    expect(api.statusCode).toBe(503)
    expect(api.code).toBe("SERVICE_UNAVAILABLE")
  })
})

describe("generateReportCard — reissue bookkeeping (database-free)", () => {
  it("requires an explicit reason when superseding a PENDING_ARCHIVE version", async () => {
    const harness = makeGenerateHarness({
      previous: { id: "rc-v1", version: 1, status: "PENDING_ARCHIVE" },
    })
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    const api = error as ApiError
    expect(api).toBeInstanceOf(ApiError)
    expect(api.statusCode).toBe(400)
    expect(api.code).toBe("REPORT_CARD_REISSUE_REASON_REQUIRED")
    expect(callsOf(harness.calls, "tx.reportCard.create")).toHaveLength(0)
  })

  it("requires an explicit reason when superseding an ISSUED version", async () => {
    const harness = makeGenerateHarness({
      previous: { id: "rc-v1", version: 1, status: "ISSUED" },
    })
    const error = await captureError(generateReportCard(INPUT, ACTOR))
    expect((error as ApiError).code).toBe("REPORT_CARD_REISSUE_REASON_REQUIRED")
    expect(callsOf(harness.calls, "tx.reportCard.create")).toHaveLength(0)
  })

  it("records the reissue link and reason without mutating the superseded version", async () => {
    const harness = makeGenerateHarness({
      previous: { id: "rc-v1", version: 1, status: "ISSUED" },
    })

    await generateReportCard({ ...INPUT, reissueReason: "Corrected term-2 marks" }, ACTOR)

    const data = createData(harness.calls)
    expect(data.version).toBe(2)
    expect(data.supersedesReportCardId).toBe("rc-v1")
    expect(data.reissueReason).toBe("Corrected term-2 marks")
    // The superseded version keeps its status; the SUPERSEDED transition belongs
    // to the subsequent issue step, not to draft creation.
    expect(callsOf(harness.calls, "tx.reportCard.update")).toHaveLength(0)
  })

  it("does not require a reason for a first version", async () => {
    const harness = makeGenerateHarness({ previous: null })
    await generateReportCard(INPUT, ACTOR)
    const data = createData(harness.calls)
    expect(data.version).toBe(1)
    expect(data.supersedesReportCardId).toBeNull()
    expect(data.reissueReason).toBeNull()
  })
})
