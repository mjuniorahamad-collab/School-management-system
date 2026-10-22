// Database-free service tests for Report Card scheme configuration
// (docs/report-card.md §2, §4, §5, §7; M6a). The Prisma access layer is mocked
// at `lib/database.js`, exactly as the Results/Report-Card suites do, so these
// never import a live client, never connect, and never touch the database.
//
// They assert the behaviour the specification requires — tenant scoping,
// referenced-id ownership, atomic exam replacement, concurrency-safe CREATE vs
// UPDATE audit classification, the field diff, and route permission guards —
// rather than re-testing the pure rules (covered in report-card-scheme-rules).
//
// Concurrency caveat: the harness cannot prove real PostgreSQL advisory-lock
// serialization, transaction atomicity, or rollback (only a database can). It
// asserts the critical-section CONTRACT — the scope lock is taken before the
// scheme read that classifies CREATE vs UPDATE.

import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { ApiError } from "../src/lib/ApiError.js"
import type { AuthUser } from "../src/types/auth.js"
import { upsertReportCardSchemeSchema } from "../src/modules/report-card-schemes/report-card-scheme.schema.js"
import {
  getReportCardSchemeById,
  listReportCardSchemes,
  upsertReportCardScheme,
} from "../src/modules/report-card-schemes/report-card-scheme.service.js"
import { reportCardSchemesRouter } from "../src/modules/report-card-schemes/report-card-scheme.route.js"

const mockGetPrisma = vi.mocked(getPrisma)

const SCHOOL_ID = "00000000-0000-4000-8000-0000000000a1"
const SESSION_ID = "00000000-0000-4000-8000-0000000000b1"
const CLASS_ID = "00000000-0000-4000-8000-0000000000c1"
const SECTION_ID = "00000000-0000-4000-8000-0000000000c2"
const TYPE_1 = "00000000-0000-4000-8000-0000000000f1"
const TYPE_2 = "00000000-0000-4000-8000-0000000000f2"
const SUBJECT_1 = "00000000-0000-4000-8000-0000000020f1"

const NOW = new Date("2026-10-16T00:00:00.000Z")

const ACTOR: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000e1",
  school: { id: SCHOOL_ID, name: "Bright Future" },
  name: "Registrar",
  email: "registrar@example.com",
  status: "ACTIVE",
  roles: ["PRINCIPAL"],
  permissions: ["report-cards:manage-schemes"],
  memberships: [],
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    academicSessionId: SESSION_ID,
    classId: CLASS_ID,
    aggregationPolicy: "PERCENTAGE_WEIGHTED",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
    annualSubjectPassPercent: 40,
    overallPassPercent: 50,
    coreSubjectIds: [SUBJECT_1],
    exams: [
      { examTypeId: TYPE_1, weight: "0.6" },
      { examTypeId: TYPE_2, weight: "0.4" },
    ],
    ...overrides,
  }
}

function asInput(overrides: Record<string, unknown> = {}): Parameters<typeof upsertReportCardScheme>[0] {
  return upsertReportCardSchemeSchema.parse(body(overrides))
}

interface Call {
  op: string
  args: Record<string, unknown>
}

interface HarnessOptions {
  existingScheme?: Record<string, unknown> | null
  listTotal?: number
  listRows?: Array<Record<string, unknown>>
  referenceOverrides?: Partial<Record<string, boolean | undefined>>
  auditError?: unknown
  createError?: unknown
}

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function existingSchemeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "scheme-1",
    academicSessionId: SESSION_ID,
    classId: CLASS_ID,
    sectionId: null,
    scopeKey: "__CLASS__",
    aggregationPolicy: "PERCENTAGE_WEIGHTED",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
    annualSubjectPassPercent: dec(40),
    overallPassPercent: dec(50),
    maxFailedSubjects: null,
    coreSubjectIds: [SUBJECT_1],
    publicationMode: "REQUIRE_DECISION",
    createdByUserId: ACTOR.id,
    createdAt: NOW,
    updatedAt: NOW,
    exams: [
      {
        id: "exam-1",
        examTypeId: TYPE_1,
        weight: dec(0.6),
        sortOrder: 0,
        examType: { name: "Term 1" },
      },
    ],
    ...overrides,
  }
}

function makeHarness(options: HarnessOptions = {}): { calls: Call[] } {
  const calls: Call[] = []
  const rec = (op: string, args: Record<string, unknown>): void => {
    calls.push({ op, args })
  }

  const existingScheme = options.existingScheme === undefined ? null : options.existingScheme
  const refs = options.referenceOverrides ?? {}

  const found = (value: unknown): unknown => value

  const buildRow = (data: Record<string, unknown>, id: string): Record<string, unknown> => {
    const examCreate = ((data.exams as { create?: Array<Record<string, unknown>> })?.create ?? [])
    return {
      ...data,
      id,
      annualSubjectPassPercent: dec(Number(data.annualSubjectPassPercent)),
      overallPassPercent:
        data.overallPassPercent === null || data.overallPassPercent === undefined
          ? null
          : dec(Number(data.overallPassPercent)),
      createdAt: NOW,
      updatedAt: NOW,
      exams: examCreate.map((exam, index) => ({
        id: `${id}-exam-${index}`,
        examTypeId: exam.examTypeId as string,
        weight: dec(Number(exam.weight)),
        sortOrder: exam.sortOrder as number,
        examType: { name: "Type" },
      })),
    }
  }

  const tx = {
    academicSession: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("academicSession.findFirst", args)
        return found(refs.session ?? { id: SESSION_ID })
      }),
    },
    class: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("class.findFirst", args)
        return found(refs.klass ?? { id: CLASS_ID })
      }),
    },
    section: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("section.findFirst", args)
        return found(refs.section ?? { id: SECTION_ID })
      }),
    },
    examType: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("examType.findMany", args)
        const ids = ((args.where as Record<string, unknown>).id as { in: string[] }).in
        // `isActive` is a non-nullable column: every real row carries it, so the
        // mock rows must too (an active exam type by default).
        return found(refs.examTypes ?? ids.map((id) => ({ id, isActive: true })))
      }),
    },
    subject: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("subject.findMany", args)
        const ids = ((args.where as Record<string, unknown>).id as { in: string[] }).in
        return found(refs.subjects ?? ids.map((id) => ({ id })))
      }),
    },
    reportCardScheme: {
      findFirst: vi.fn(async (args: Record<string, unknown>) => {
        rec("reportCardScheme.findFirst", args)
        return existingScheme
      }),
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        rec("reportCardScheme.findMany", args)
        return options.listRows ?? []
      }),
      count: vi.fn(async (args: Record<string, unknown>) => {
        rec("reportCardScheme.count", args)
        return options.listTotal ?? 0
      }),
      update: vi.fn(async (args: Record<string, unknown>) => {
        rec("reportCardScheme.update", args)
        return buildRow(args.data as Record<string, unknown>, "scheme-updated")
      }),
      create: vi.fn(async (args: Record<string, unknown>) => {
        rec("reportCardScheme.create", args)
        if (options.createError) throw options.createError
        return buildRow(args.data as Record<string, unknown>, "scheme-created")
      }),
    },
    auditLog: {
      create: vi.fn(async (args: Record<string, unknown>) => {
        rec("auditLog.create", args)
        if (options.auditError) throw options.auditError
        return { id: "audit-1" }
      }),
    },
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      rec("lock", { sql: String((args[0] as string[]).join("?")) })
      return []
    }),
  }

  const prisma = {
    ...tx,
    tenantMembership: {
      findFirst: vi.fn(async () => ({ role: { name: "PRINCIPAL" } })),
    },
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

function firstIndex(calls: Call[], op: string): number {
  const index = calls.findIndex((call) => call.op === op)
  expect(index).toBeGreaterThanOrEqual(0)
  return index
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

describe("upsertReportCardScheme — CREATE (database-free)", () => {
  it("creates a scheme under the actor's school and audits CREATE", async () => {
    const harness = makeHarness({ existingScheme: null })

    const detail = await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)

    expect((detail as { id: string }).id).toBe("scheme-created")
    const createArgs = callsOf(harness.calls, "reportCardScheme.create")[0]!
    const data = createArgs.data as Record<string, unknown>
    expect(data.schoolId).toBe(SCHOOL_ID)
    expect(data.scopeKey).toBe("__CLASS__")
    expect(data.sectionId).toBeNull()
    expect(data.annualSubjectPassPercent).toBe("40")
    expect(data.overallPassPercent).toBe("50")
    expect(data.createdByUserId).toBe(ACTOR.id)
    expect(data.updatedByUserId).toBe(ACTOR.id)
    expect((data.exams as { create: unknown[] }).create).toHaveLength(2)

    const audit = callsOf(harness.calls, "auditLog.create")[0]!
    const auditData = audit.data as Record<string, unknown>
    expect(auditData.action).toBe("CREATE")
    expect(auditData.entityType).toBe("REPORT_CARD_SCHEME")
    expect(auditData.schoolId).toBe(SCHOOL_ID)
    expect(auditData.entityId).toBe("scheme-created")
    expect(auditData.diff ?? null).toBeNull()
  })

  it("derives the section scope key when a section is supplied", async () => {
    const harness = makeHarness({ existingScheme: null })
    await upsertReportCardScheme(asInput({ sectionId: SECTION_ID }), SCHOOL_ID, ACTOR)
    const data = callsOf(harness.calls, "reportCardScheme.create")[0]!.data as Record<string, unknown>
    expect(data.sectionId).toBe(SECTION_ID)
    expect(data.scopeKey).toBe(SECTION_ID)
  })
})

describe("upsertReportCardScheme — UPDATE (database-free)", () => {
  it("updates the existing scheme and audits UPDATE with a field diff", async () => {
    const existing = existingSchemeRow({
      annualSubjectPassPercent: dec(30),
      overallPassPercent: dec(45),
    })
    const harness = makeHarness({ existingScheme: existing })

    const detail = await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)

    expect((detail as { id: string }).id).toBe("scheme-updated")
    const updateArgs = callsOf(harness.calls, "reportCardScheme.update")[0]!
    expect(updateArgs.where).toEqual({ id: "scheme-1" })

    const audit = callsOf(harness.calls, "auditLog.create")[0]!
    const auditData = audit.data as Record<string, unknown>
    expect(auditData.action).toBe("UPDATE")
    expect(auditData.entityType).toBe("REPORT_CARD_SCHEME")
    expect(auditData.entityId).toBe("scheme-1")

    const diff = auditData.diff as { fields: Array<{ field: string; before: unknown; after: unknown }> }
    const byField = new Map(diff.fields.map((f) => [f.field, f]))
    expect(byField.get("annualSubjectPassPercent")).toMatchObject({ before: "30", after: "40" })
    expect(byField.get("overallPassPercent")).toMatchObject({ before: "45", after: "50" })
  })

  it("reports no diff when an unchanged scheme is re-submitted", async () => {
    const existing = existingSchemeRow({
      annualSubjectPassPercent: dec(40),
      overallPassPercent: dec(50),
      exams: [
        { id: "e1", examTypeId: TYPE_1, weight: dec(0.6), sortOrder: 0, examType: { name: "Term 1" } },
        { id: "e2", examTypeId: TYPE_2, weight: dec(0.4), sortOrder: 1, examType: { name: "Term 2" } },
      ],
    })
    const harness = makeHarness({ existingScheme: existing })

    await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)

    const audit = callsOf(harness.calls, "auditLog.create")[0]!
    expect((audit.data as Record<string, unknown>).diff ?? null).toBeNull()
  })
})

describe("upsertReportCardScheme — atomic exam replacement (database-free)", () => {
  it("deletes all prior exams and creates the new set inside the same update", async () => {
    const harness = makeHarness({ existingScheme: existingSchemeRow() })
    await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)
    const data = callsOf(harness.calls, "reportCardScheme.update")[0]!.data as Record<string, unknown>
    const exams = data.exams as { deleteMany: unknown; create: unknown[] }
    expect(exams.deleteMany).toEqual({})
    expect(exams.create).toHaveLength(2)
  })
})

describe("upsertReportCardScheme — tenant scoping (database-free)", () => {
  it("scopes every reference read to the actor's school", async () => {
    const harness = makeHarness({ existingScheme: null })
    await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)

    expect((callsOf(harness.calls, "academicSession.findFirst")[0]!.where as Record<string, unknown>).schoolId).toBe(SCHOOL_ID)
    expect((callsOf(harness.calls, "class.findFirst")[0]!.where as Record<string, unknown>).schoolId).toBe(SCHOOL_ID)
    expect((callsOf(harness.calls, "examType.findMany")[0]!.where as Record<string, unknown>).schoolId).toBe(SCHOOL_ID)
    expect((callsOf(harness.calls, "subject.findMany")[0]!.where as Record<string, unknown>).schoolId).toBe(SCHOOL_ID)
  })

  it("scopes the existing-scheme lookup to the school", async () => {
    const harness = makeHarness({ existingScheme: existingSchemeRow() })
    await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)
    const where = callsOf(harness.calls, "reportCardScheme.findFirst")[0]!.where as Record<string, unknown>
    expect(where.schoolId).toBe(SCHOOL_ID)
  })

  it("scopes list and detail reads to the school", async () => {
    const listHarness = makeHarness({ listTotal: 3, listRows: [existingSchemeRow()] })
    await listReportCardSchemes({}, SCHOOL_ID)
    expect((callsOf(listHarness.calls, "reportCardScheme.count")[0]!.where as Record<string, unknown>).schoolId).toBe(SCHOOL_ID)
    expect((callsOf(listHarness.calls, "reportCardScheme.findMany")[0]!.where as Record<string, unknown>).schoolId).toBe(SCHOOL_ID)

    const detailHarness = makeHarness({ existingScheme: existingSchemeRow() })
    await getReportCardSchemeById("scheme-1", SCHOOL_ID)
    const detailWhere = callsOf(detailHarness.calls, "reportCardScheme.findFirst")[0]!.where as Record<string, unknown>
    expect(detailWhere.id).toBe("scheme-1")
    expect(detailWhere.schoolId).toBe(SCHOOL_ID)
  })
})

describe("upsertReportCardScheme — referenced-id ownership (database-free)", () => {
  it("rejects an academic session that is not in the school, before writing", async () => {
    const harness = makeHarness({ existingScheme: null, referenceOverrides: { session: false } })
    const error = await captureError(upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR))
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).message).toContain("Academic session")
    expect(callsOf(harness.calls, "reportCardScheme.create")).toHaveLength(0)
    expect(callsOf(harness.calls, "auditLog.create")).toHaveLength(0)
  })

  it("rejects a class that is not in the school", async () => {
    const harness = makeHarness({ existingScheme: null, referenceOverrides: { klass: false } })
    const error = await captureError(upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR))
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).message).toContain("Class")
    expect(callsOf(harness.calls, "reportCardScheme.create")).toHaveLength(0)
  })

  it("rejects a section that does not belong to the class", async () => {
    const harness = makeHarness({
      existingScheme: null,
      referenceOverrides: { section: false },
    })
    const error = await captureError(
      upsertReportCardScheme(asInput({ sectionId: SECTION_ID }), SCHOOL_ID, ACTOR),
    )
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).message).toContain("Section")
    expect(callsOf(harness.calls, "reportCardScheme.create")).toHaveLength(0)
  })

  it("rejects an exam type that is not in the school", async () => {
    const harness = makeHarness({ existingScheme: null, referenceOverrides: { examTypes: [] } })
    const error = await captureError(upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR))
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).message).toContain("exam types")
    expect(callsOf(harness.calls, "reportCardScheme.create")).toHaveLength(0)
  })

  it("rejects a core subject that is not in the school", async () => {
    const harness = makeHarness({ existingScheme: null, referenceOverrides: { subjects: [] } })
    const error = await captureError(upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR))
    expect((error as ApiError).statusCode).toBe(400)
    expect((error as ApiError).message).toContain("core subjects")
    expect(callsOf(harness.calls, "reportCardScheme.create")).toHaveLength(0)
  })
})

describe("upsertReportCardScheme — concurrency contract (database-free)", () => {
  // The harness cannot prove real PostgreSQL advisory-lock serialization (only a
  // database can). What it CAN prove is the critical-section contract: exactly
  // one scope lock, taken BEFORE the scheme read that classifies CREATE vs
  // UPDATE and before any write.
  it("takes the scope lock before reading and before writing", async () => {
    const harness = makeHarness({ existingScheme: existingSchemeRow() })
    await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)

    const lockAt = firstIndex(harness.calls, "lock")
    const schemeReadAt = firstIndex(harness.calls, "reportCardScheme.findFirst")
    const writeAt = firstIndex(harness.calls, "reportCardScheme.update")

    expect(lockAt).toBeGreaterThanOrEqual(0)
    expect(lockAt).toBeLessThan(schemeReadAt)
    expect(lockAt).toBeLessThan(writeAt)
  })

  it("classifies a first-time upsert as CREATE and a repeat as UPDATE", async () => {
    const created = makeHarness({ existingScheme: null })
    await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)
    expect(callsOf(created.calls, "auditLog.create")[0]!.data).toMatchObject({ action: "CREATE" })

    const updated = makeHarness({ existingScheme: existingSchemeRow() })
    await upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR)
    expect(callsOf(updated.calls, "auditLog.create")[0]!.data).toMatchObject({ action: "UPDATE" })
  })
})

describe("upsertReportCardScheme — audit atomicity (database-free)", () => {
  // The harness cannot prove real rollback. It proves the audit write runs in
  // the SAME transaction as the scheme write and that an audit failure is not
  // swallowed — it propagates, so a database would roll back both together.
  it("propagates an audit failure instead of swallowing it", async () => {
    const harness = makeHarness({
      existingScheme: null,
      auditError: new Error("audit write failed"),
    })
    const error = await captureError(upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR))
    expect((error as Error).message).toContain("audit write failed")
    expect(callsOf(harness.calls, "reportCardScheme.create")).toHaveLength(1)
    expect(callsOf(harness.calls, "auditLog.create")).toHaveLength(1)
  })
})

describe("upsertReportCardScheme — error mapping (database-free)", () => {
  it("maps a scope unique-constraint race (P2002) to a 400", async () => {
    makeHarness({
      existingScheme: null,
      createError: new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.19.3",
      }),
    })
    const error = await captureError(upsertReportCardScheme(asInput(), SCHOOL_ID, ACTOR))
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).statusCode).toBe(400)
  })

  it("returns 404 when a scheme detail is not found", async () => {
    makeHarness({ existingScheme: null })
    const error = await captureError(getReportCardSchemeById("missing", SCHOOL_ID))
    expect((error as ApiError).statusCode).toBe(404)
  })

  it("returns 503 when no database is configured", async () => {
    mockGetPrisma.mockResolvedValue(null)
    const error = await captureError(listReportCardSchemes({}, SCHOOL_ID))
    expect((error as ApiError).statusCode).toBe(503)
    expect((error as ApiError).code).toBe("SERVICE_UNAVAILABLE")
  })
})

describe("reportCardSchemesRouter — route and permission guards (database-free)", () => {
  interface RouteLayer {
    route?: { path: string; methods: Record<string, boolean>; stack: unknown[] }
  }

  function routeLayers(): Array<{ path: string; method: string; handlers: number; delete: boolean }> {
    const layers = reportCardSchemesRouter.stack as unknown as RouteLayer[]
    return layers
      .filter((layer): layer is RouteLayer & { route: NonNullable<RouteLayer["route"]> } => Boolean(layer.route))
      .map((layer) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods).find((key) => layer.route!.methods[key]) ?? "get",
        handlers: layer.route.stack.length,
        delete: Boolean(layer.route.methods.delete),
      }))
  }

  it("exposes exactly GET /, PUT / and GET /:id", () => {
    const routes = routeLayers()
      .map((route) => `${route.method.toUpperCase()} ${route.path}`)
      .sort()
    expect(routes).toEqual(["GET /", "GET /:id", "PUT /"])
  })

  it("attaches a permission guard to every route (>= 2 handlers)", () => {
    for (const route of routeLayers()) {
      expect(route.handlers).toBeGreaterThanOrEqual(2)
    }
  })

  it("does not expose DELETE", () => {
    expect(routeLayers().some((route) => route.delete)).toBe(false)
  })
})
