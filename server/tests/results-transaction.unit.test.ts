// Transaction-cardinality regression tests for the Results marks-save path.
//
// THE BUG: putSubjectMarks used to run one Prisma statement PER STUDENT inside a
// single interactive transaction (a create per missing ExamResult, an upsert per
// ExamMark, then a findFirst + update per result to recompute the aggregate).
// That is ~3N+2 sequential network round trips. `putSubjectMarksSchema` accepts
// up to 100 rows and the UI submits a whole result-sheet page at once, so a
// large class overran Prisma's 5000 ms default interactive-transaction timeout
// and surfaced as P2028 ("Transaction not found…" / expired transaction).
//
// WHY A UNIT TEST, NOT AN INTEGRATION TEST: the failure is latency-driven, and on
// the loopback Postgres the integration suites use, 100 students resolve in
// single-digit milliseconds. An integration test therefore PASSES against the
// broken code and proves nothing. What is actually broken is a structural
// property — the number of round trips grows with N — so it is asserted
// structurally here against a stub client, with no database required.
//
// These tests fail against the previous implementation (N-dependent statement
// counts) and pass against the bounded-statement one.

import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { putSubjectMarks } from "../src/modules/results/result.service.js"
import type { PutSubjectMarksInput } from "../src/modules/results/result.schema.js"

const mockGetPrisma = vi.mocked(getPrisma)

const SCHOOL_ID = "00000000-0000-4000-8000-0000000000aa"
const EXAM_ID = "00000000-0000-4000-8000-0000000000bb"
const SESSION_ID = "00000000-0000-4000-8000-0000000000cc"
const CLASS_ID = "00000000-0000-4000-8000-0000000000dd"
const EXAM_SUBJECT_ID = "00000000-0000-4000-8000-0000000000ee"
const ACTOR_ID = "00000000-0000-4000-8000-0000000000ff"

const MAX_MARKS = 100
const PASS_MARKS = 40

const ADMIN_ACTOR = {
  schoolId: SCHOOL_ID,
  userId: ACTOR_ID,
  roles: ["ADMIN"],
  name: "Admin User",
  email: "admin@example.com",
}

interface Recorder {
  /** Every prisma model/raw call made, in order, as `"model.op"`. */
  calls: string[]
  /** Calls made through the transaction client only. */
  txCalls: string[]
  transactionCount: number
  /** Options passed to each `$transaction` interactive call. */
  transactionOptions: unknown[]
  /** Mark rows the bulk upsert was asked to write. */
  upsertedMarks: unknown[]
  /** Result rows the bulk aggregate update was asked to write. */
  aggregatedResults: unknown[]
}

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function makeHarness(studentCount: number, options: { existingResults?: boolean } = {}) {
  const recorder: Recorder = {
    calls: [],
    txCalls: [],
    transactionCount: 0,
    transactionOptions: [],
    upsertedMarks: [],
    aggregatedResults: [],
  }

  const rows: PutSubjectMarksInput["rows"] = []
  const enrollments: Array<{ id: string; studentId: string }> = []
  for (let i = 0; i < studentCount; i += 1) {
    const enrollmentId = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
    enrollments.push({ id: enrollmentId, studentId: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })
    rows.push({ enrollmentId, obtainedMarks: 80, isAbsent: false, remarks: null })
  }

  const existing = new Map<string, string>()
  if (options.existingResults) {
    for (const enrollment of enrollments) {
      existing.set(enrollment.id, `20000000-0000-4000-8000-${enrollment.id.slice(-12)}`)
    }
  }

  // Marks already stored, used to answer the single aggregate read.
  const storedMarks = new Map<string, Array<{ examResultId: string; examSubjectId: string; obtainedMarks: Prisma.Decimal | null; isAbsent: boolean }>>()

  const record = (scope: "root" | "tx", label: string) => {
    recorder.calls.push(label)
    if (scope === "tx") recorder.txCalls.push(label)
  }

  const tx = {
    examResult: {
      findMany: vi.fn(async (args: { where?: { enrollmentId?: { in?: string[] } } }) => {
        record("tx", "examResult.findMany")
        const ids = args.where?.enrollmentId?.in ?? []
        return ids
          .filter((id) => existing.has(id))
          .map((id) => ({ id: existing.get(id) as string, enrollmentId: id }))
      }),
      createMany: vi.fn(async () => {
        record("tx", "examResult.createMany")
        // Materialise the created rows, as the database would.
        for (const enrollment of enrollments) {
          if (!existing.has(enrollment.id)) {
            existing.set(enrollment.id, `30000000-0000-4000-8000-${enrollment.id.slice(-12)}`)
          }
        }
        return { count: enrollments.length }
      }),
    },
    examMark: {
      findMany: vi.fn(async (args: { where?: { examResultId?: { in?: string[] } } }) => {
        record("tx", "examMark.findMany")
        const ids = new Set(args.where?.examResultId?.in ?? [])
        return [...storedMarks.values()].flat().filter((mark) => ids.has(mark.examResultId))
      }),
    },
    // recordAudit(tx, …) writes through the transaction client, so the audit
    // model must be present on `tx` as well as on the root client.
    auditLog: {
      create: vi.fn(async () => {
        record("tx", "auditLog.create")
        return { id: "audit-1" }
      }),
    },
    // Classification lives in the wrapper below, so this is a plain no-op and
    // must not record on its own (that would double-count every raw statement).
    $executeRaw: vi.fn(async () => 0),
  }

  const prisma = {
    exam: {
      findFirst: vi.fn(async () => {
        record("root", "exam.findFirst")
        return {
          id: EXAM_ID,
          status: "PUBLISHED",
          academicSessionId: SESSION_ID,
          classId: CLASS_ID,
          sectionId: null,
        }
      }),
    },
    examSubject: {
      findFirst: vi.fn(async () => {
        record("root", "examSubject.findFirst")
        return {
          id: EXAM_SUBJECT_ID,
          teacherId: null,
          subject: { code: "MAT", name: "Mathematics" },
        }
      }),
      findMany: vi.fn(async () => {
        record("root", "examSubject.findMany")
        return [
          { id: EXAM_SUBJECT_ID, maxMarks: dec(MAX_MARKS), passMarks: dec(PASS_MARKS) },
        ]
      }),
    },
    studentEnrollment: {
      findMany: vi.fn(async () => {
        record("root", "studentEnrollment.findMany")
        return enrollments
      }),
    },
    gradingBand: {
      findMany: vi.fn(async () => {
        record("root", "gradingBand.findMany")
        return [
          { minPercent: 0, maxPercent: 49, grade: "F" },
          { minPercent: 50, maxPercent: 100, grade: "A" },
        ]
      }),
    },
    auditLog: {
      create: vi.fn(async () => {
        record("tx", "auditLog.create")
        return { id: "audit-1" }
      }),
    },
    $transaction: vi.fn(async (arg: unknown, txOptions?: unknown) => {
      recorder.transactionCount += 1
      recorder.transactionOptions.push(txOptions)
      if (typeof arg === "function") {
        return (arg as (client: unknown) => Promise<unknown>)(tx)
      }
      return arg
    }),
  }

  // The bulk writers funnel through $executeRaw; classify each call by its SQL
  // text and delegate to the no-op so nothing is recorded twice.
  const noopExecuteRaw = tx.$executeRaw
  tx.$executeRaw = vi.fn(async (sql: Prisma.Sql) => {
    record("tx", "$executeRaw")
    const text = sql.text
    const bindings = sql.values
    if (text.includes('INSERT INTO "ExamMark"')) {
      // 14 bound columns per row.
      recorder.upsertedMarks.push({ bindings, rows: Math.floor(bindings.length / 14) })
    } else if (text.includes('UPDATE "ExamResult"') && text.includes("totalObtained")) {
      // 8 bound columns per row.
      recorder.aggregatedResults.push({ bindings, rows: Math.floor(bindings.length / 8) })
    }
    return noopExecuteRaw(sql)
  }) as typeof tx.$executeRaw

  mockGetPrisma.mockResolvedValue(prisma as unknown as Awaited<ReturnType<typeof getPrisma>>)

  return { recorder, rows, prisma, tx }
}

beforeEach(() => {
  mockGetPrisma.mockReset()
  vi.clearAllMocks()
})

describe("putSubjectMarks — transaction round-trip cardinality (database-free)", () => {
  // THE REGRESSION. Under the old per-student loop this was 3N+2, so 100
  // students meant 302 sequential statements inside one interactive
  // transaction — the direct cause of the P2028 timeout.
  it("issues a bounded number of statements for a full class, not one per student", async () => {
    const { recorder, rows } = makeHarness(100)
    const result = await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    expect(result.saved).toBe(100)
    // Exactly the seven statements the batched implementation performs, and
    // never a multiple of the class size. Under the old per-student loop this
    // was 3N+2 = 302 at N=100.
    expect(recorder.txCalls).toEqual([
      "examResult.findMany",
      "examResult.createMany",
      "examResult.findMany",
      "$executeRaw",
      "examMark.findMany",
      "$executeRaw",
      "auditLog.create",
    ])
  })

  // Proves the count is O(1): a 100x larger roster must not cost more statements.
  it("costs the same number of statements at 1 student and at 100", async () => {
    const small = makeHarness(1)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows: small.rows }, ADMIN_ACTOR)
    const large = makeHarness(100)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows: large.rows }, ADMIN_ACTOR)

    expect(large.recorder.txCalls.length).toBe(small.recorder.txCalls.length)
  })

  it("writes every student's mark in ONE batched upsert", async () => {
    const { recorder, rows } = makeHarness(100)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    const insert = recorder.upsertedMarks
    expect(insert).toHaveLength(1)
    expect(insert[0].rows).toBe(100)
  })

  it("recomputes every student's aggregate in ONE batched update", async () => {
    const { recorder, rows } = makeHarness(100)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    const aggregate = recorder.aggregatedResults
    expect(aggregate).toHaveLength(1)
    expect(aggregate[0].rows).toBe(100)
  })

  // Defense-in-depth: an explicit timeout leaves headroom for a genuinely slow
  // network. Without it the callback silently inherits the 5000 ms default that
  // the defect was tripping.
  it("passes an explicit timeout and maxWait to the transaction", async () => {
    const { recorder, rows } = makeHarness(3)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    expect(recorder.transactionOptions).toEqual([{ timeout: 20_000, maxWait: 10_000 }])
  })

  it("keeps the whole save in exactly one transaction", async () => {
    const { recorder, rows } = makeHarness(50)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    expect(recorder.transactionCount).toBe(1)
  })
})

describe("putSubjectMarks — transaction-client discipline (database-free)", () => {
  // Mixing the root client into an interactive transaction takes work off the
  // transactional connection, which is how "old closed transaction" errors are
  // reintroduced. All writes must go through `tx`.
  it("never touches a model through the root client inside the transaction", async () => {
    const { recorder, rows } = makeHarness(20)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    const writeModels = ["examResult", "examMark", "auditLog"]
    const leaked = recorder.calls.filter(
      (call) => recorder.txCalls.includes(call) === false && writeModels.some((m) => call.startsWith(m)),
    )
    expect(leaked).toEqual([])
  })

  it("still validates the roster before opening the transaction", async () => {
    const { recorder, rows } = makeHarness(2)
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    // Roster + subject ownership reads happen on the root client, outside tx.
    expect(recorder.calls).toContain("studentEnrollment.findMany")
    expect(recorder.txCalls).not.toContain("studentEnrollment.findMany")
  })
})

describe("putSubjectMarks — repeated saves (database-free)", () => {
  // A second save for the same students takes the update path: no new
  // ExamResult rows are created and the batched upsert must still be a single
  // statement. This is the "subsequent saves keep working" case.
  it("does not create a second ExamResult when results already exist", async () => {
    const { recorder, rows, tx } = makeHarness(30, { existingResults: true })
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)

    expect(tx.examResult.createMany).not.toHaveBeenCalled()
    expect(recorder.upsertedMarks).toHaveLength(1)
    expect(recorder.upsertedMarks[0].rows).toBe(30)
  })

  it("can be called repeatedly without the statement count growing", async () => {
    const { recorder, rows, tx } = makeHarness(25, { existingResults: true })

    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)
    const first = recorder.txCalls.length
    await putSubjectMarks(EXAM_ID, EXAM_SUBJECT_ID, { rows }, ADMIN_ACTOR)
    const second = recorder.txCalls.length - first

    expect(second).toBe(first)
    expect(tx.$executeRaw).toHaveBeenCalled()
  })
})
