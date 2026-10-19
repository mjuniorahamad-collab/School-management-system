// Database-free tests for Annual Report Card issuance and supersession
// (docs/report-card.md §9, §9a, §12). The Prisma access layer is mocked at
// `lib/database.js`, exactly as the publication suite does, so these suites
// never import a live client, never connect, and never touch the database.
//
// They assert the behaviour the specification requires: issuance serializes
// behind the student-scope lock BEFORE it reads or writes any card state, is
// idempotent for an already ISSUED version, is guarded by the tenant's
// `requireReportCardPdfArchive` policy against an archive bound to the exact
// `(reportCardId, version, snapshotHash)`, flips status with a compare-and-swap
// on PENDING_ARCHIVE, and demotes every other published version — never a
// DRAFT — so exactly one version is ever ISSUED.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { ApiError } from "../src/lib/ApiError.js"
import { issueReportCard } from "../src/modules/report-cards/report-card.service.js"

const mockGetPrisma = vi.mocked(getPrisma)

const SCHOOL_ID = "00000000-0000-4000-8000-0000000000a1"
const OTHER_SCHOOL_ID = "00000000-0000-4000-8000-0000000000a2"
const SESSION_ID = "00000000-0000-4000-8000-0000000000b1"
const STUDENT_ID = "00000000-0000-4000-8000-0000000000d1"
const ACTOR_ID = "00000000-0000-4000-8000-0000000000e1"
const CARD_ID = "00000000-0000-4000-8000-0000000030f1"
const ARTIFACT_REPORT_CARD_ID = "00000000-0000-4000-8000-0000000030f2"

const ACTOR = {
  schoolId: SCHOOL_ID,
  userId: ACTOR_ID,
  name: "Principal",
  email: "principal@example.com",
  roles: ["PRINCIPAL"],
}

// ────────────────────────────────────────────────────────────────────────────
// Harness
// ────────────────────────────────────────────────────────────────────────────

interface CardFixture {
  id: string
  version: number
  status: string
  snapshotHash: string | null
  schoolId: string
  academicSessionId: string
  studentId: string
  subjects: unknown[]
  examResolutions: unknown[]
}

function cardFixture(overrides: Partial<CardFixture> = {}): CardFixture {
  return {
    id: CARD_ID,
    version: 4,
    status: "PENDING_ARCHIVE",
    snapshotHash: "hash-v4",
    schoolId: SCHOOL_ID,
    academicSessionId: SESSION_ID,
    studentId: STUDENT_ID,
    subjects: [{ outcome: "PASS" }],
    examResolutions: [{ status: "RESOLVED" }],
    ...overrides,
  }
}

interface ArtifactFixture {
  id: string
  reportCardId: string
  version: number
  snapshotHash: string
  confirmedAt: Date | null
}

function artifactFixture(overrides: Partial<ArtifactFixture> = {}): ArtifactFixture {
  return {
    id: "artifact-1",
    reportCardId: CARD_ID,
    version: 4,
    snapshotHash: "hash-v4",
    confirmedAt: new Date("2026-10-01T10:00:00.000Z"),
    ...overrides,
  }
}

interface HarnessOptions {
  scope?: { academicSessionId: string; studentId: string } | null
  /** Read queue for the post-scope card reads: [state, afterTransition]. */
  cardReads?: CardFixture[]
  artifact?: ArtifactFixture | null
  settingValue?: string | null
  issueUpdateCount?: number
}

interface Harness {
  calls: Array<{ op: string; args?: Record<string, unknown> }>
  updateMany: ReturnType<typeof vi.fn>
  artifactFind: ReturnType<typeof vi.fn>
  auditCreate: ReturnType<typeof vi.fn>
}

function opNames(harness: Harness): string[] {
  return harness.calls.map((call) => call.op)
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const calls: Harness["calls"] = []
  const record = (op: string, args?: Record<string, unknown>): void => {
    calls.push(args === undefined ? { op } : { op, args })
  }

  const scope =
    options.scope === undefined
      ? { academicSessionId: SESSION_ID, studentId: STUDENT_ID }
      : options.scope
  const cardReads = options.cardReads ?? [cardFixture(), cardFixture({ status: "ISSUED" })]
  const issuedCard = cardReads[cardReads.length - 1]
  let scopeReadCount = 0
  let cardReadCount = 0

  const reportCard = {
    findFirst: vi.fn(async (args?: Record<string, unknown>) => {
      if (scopeReadCount === 0 && cardReadCount === 0) {
        scopeReadCount += 1
        record("reportCard.findFirst:scope", args)
        return scope
      }
      const index = cardReadCount
      cardReadCount += 1
      record(index === 0 ? "reportCard.findFirst:card" : "reportCard.findFirst:after", args)
      if (index >= cardReads.length) return issuedCard
      return cardReads[index]
    }),
    updateMany: vi.fn(async (args?: Record<string, unknown>) => {
      record("reportCard.updateMany", args)
      return { count: options.issueUpdateCount ?? 1 }
    }),
  }

  const reportCardArtifact = {
    findFirst: vi.fn(async (args?: Record<string, unknown>) => {
      record("reportCardArtifact.findFirst", args)
      if (options.artifact !== undefined) return options.artifact
      return artifactFixture()
    }),
  }

  const schoolSetting = {
    findUnique: vi.fn(async (args?: Record<string, unknown>) => {
      record("schoolSetting.findUnique", args)
      if (options.settingValue === undefined || options.settingValue === null) return null
      return { value: options.settingValue }
    }),
  }

  const auditLog = {
    create: vi.fn(async () => {
      record("auditLog.create")
      return { id: "audit-1" }
    }),
  }

  const tx = {
    reportCard,
    reportCardArtifact,
    schoolSetting,
    auditLog,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      record("lock", { sql: strings.join("?") })
      return []
    }),
  }

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  }

  mockGetPrisma.mockResolvedValue(prisma as unknown as Awaited<ReturnType<typeof getPrisma>>)
  return { calls, updateMany: reportCard.updateMany, artifactFind: reportCardArtifact.findFirst, auditCreate: auditLog.create }
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

function expectApiError(error: unknown, code: string): ApiError {
  expect(error).toBeInstanceOf(ApiError)
  const apiError = error as ApiError
  expect(apiError.code).toBe(code)
  return apiError
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ────────────────────────────────────────────────────────────────────────────
// Serialization (requirement: concurrent issue/supersede for one scope)
// ────────────────────────────────────────────────────────────────────────────

describe("issueReportCard — serialization", () => {
  it("takes the student-scope lock before reading card state or the archive", async () => {
    const harness = makeHarness()

    await issueReportCard(CARD_ID, ACTOR)

    // The pre-lock read only resolves the scope; everything that decides the
    // transition happens after the lock is held.
    expect(opNames(harness).slice(0, 4)).toEqual([
      "reportCard.findFirst:scope",
      "lock",
      "reportCard.findFirst:card",
      "schoolSetting.findUnique",
    ])
    const lockIndex = opNames(harness).indexOf("lock")
    expect(lockIndex).toBeLessThan(opNames(harness).indexOf("reportCard.updateMany"))
    expect(lockIndex).toBeLessThan(opNames(harness).indexOf("reportCardArtifact.findFirst"))
  })

  it("locks exactly one (school, session, student) scope, ordered by version", async () => {
    const harness = makeHarness()
    await issueReportCard(CARD_ID, ACTOR)

    const lock = harness.calls.find((call) => call.op === "lock")
    const sql = lock?.args?.sql as string
    expect(sql).toContain('FROM "ReportCard"')
    expect(sql).toContain('ORDER BY "version" FOR UPDATE')
    expect(sql).toContain('"schoolId" = ?')
    expect(sql).toContain('"academicSessionId" = ?')
    expect(sql).toContain('"studentId" = ?')
  })

  it("never writes an audit row (no REPORT_CARD audit entity in this milestone)", async () => {
    const harness = makeHarness()
    await issueReportCard(CARD_ID, ACTOR)
    expect(harness.auditCreate).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Issuance + supersession (§9, state diagram)
// ────────────────────────────────────────────────────────────────────────────

describe("issueReportCard — transition", () => {
  it("flips PENDING_ARCHIVE → ISSUED with a compare-and-swap and stamps issuedAt", async () => {
    const harness = makeHarness()

    const issued = (await issueReportCard(CARD_ID, ACTOR)) as CardFixture

    expect(issued.status).toBe("ISSUED")
    expect(harness.updateMany).toHaveBeenCalledTimes(2)

    const cas = harness.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(cas.where).toEqual({ id: CARD_ID, schoolId: SCHOOL_ID, status: "PENDING_ARCHIVE" })
    expect(cas.data.status).toBe("ISSUED")
    expect(cas.data.issuedAt).toBeInstanceOf(Date)
  })

  it("demotes every other published version and never a DRAFT sibling", async () => {
    const harness = makeHarness()

    await issueReportCard(CARD_ID, ACTOR)

    const supersede = harness.updateMany.mock.calls[1]?.[0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(supersede.where).toEqual({
      schoolId: SCHOOL_ID,
      academicSessionId: SESSION_ID,
      studentId: STUDENT_ID,
      id: { not: CARD_ID },
      status: { in: ["PENDING_ARCHIVE", "ISSUED"] },
    })
    expect(supersede.where.status).not.toContain("DRAFT")
    expect(supersede.data).toEqual({ status: "SUPERSEDED" })
  })

  it("is idempotent for an already ISSUED version (issuedAt is never re-stamped)", async () => {
    const harness = makeHarness({
      cardReads: [cardFixture({ status: "ISSUED" })],
    })

    const result = (await issueReportCard(CARD_ID, ACTOR)) as CardFixture

    expect(result.status).toBe("ISSUED")
    expect(harness.updateMany).not.toHaveBeenCalled()
    expect(harness.artifactFind).not.toHaveBeenCalled()
  })

  it.each(["DRAFT", "SUPERSEDED", "VOID"])(
    "refuses to issue a %s version with 409 REPORT_CARD_INVALID_STATE",
    async (status) => {
      const harness = makeHarness({ cardReads: [cardFixture({ status })] })

      const error = await captureError(issueReportCard(CARD_ID, ACTOR))

      const apiError = expectApiError(error, "REPORT_CARD_INVALID_STATE")
      expect(apiError.statusCode).toBe(409)
      expect(harness.updateMany).not.toHaveBeenCalled()
    },
  )

  it("surfaces the observed status when the compare-and-swap loses the race", async () => {
    const harness = makeHarness({
      cardReads: [cardFixture(), cardFixture({ status: "SUPERSEDED" })],
      issueUpdateCount: 0,
    })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    const apiError = expectApiError(error, "REPORT_CARD_INVALID_STATE")
    expect(apiError.message).toContain("SUPERSEDED")
    // Only the compare-and-swap ran — no sibling demotion after a lost race.
    expect(harness.updateMany).toHaveBeenCalledTimes(1)
  })

  it("scopes every read to the acting tenant", async () => {
    const harness = makeHarness()

    await issueReportCard(CARD_ID, ACTOR)

    const scopeRead = harness.calls.find((call) => call.op === "reportCard.findFirst:scope")
    const cardRead = harness.calls.find((call) => call.op === "reportCard.findFirst:card")
    expect(scopeRead?.args?.where).toEqual({ id: CARD_ID, schoolId: SCHOOL_ID })
    expect(cardRead?.args?.where).toEqual({ id: CARD_ID, schoolId: SCHOOL_ID })
    expect(ACTOR.schoolId).not.toBe(OTHER_SCHOOL_ID)
  })

  it("returns 404 for a card outside the tenant", async () => {
    makeHarness({ scope: null, cardReads: [] })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    expectApiError(error, "NOT_FOUND")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Archive gate (§9.5, §9a)
// ────────────────────────────────────────────────────────────────────────────

describe("issueReportCard — archive gate", () => {
  it("reads the tenant policy by its canonical key inside the transaction", async () => {
    const harness = makeHarness()
    await issueReportCard(CARD_ID, ACTOR)

    const policy = harness.calls.find((call) => call.op === "schoolSetting.findUnique")
    expect(policy?.args?.where).toEqual({
      schoolId_key: { schoolId: SCHOOL_ID, key: "requireReportCardPdfArchive" },
    })
  })

  it("issues when a confirmed archive matches the card exactly", async () => {
    const harness = makeHarness({ artifact: artifactFixture() })

    const issued = (await issueReportCard(CARD_ID, ACTOR)) as CardFixture

    expect(issued.status).toBe("ISSUED")
    expect(harness.artifactFind).toHaveBeenCalledTimes(1)
    expect(harness.artifactFind.mock.calls[0]?.[0]).toEqual({
      where: { reportCardId: CARD_ID, schoolId: SCHOOL_ID },
    })
  })

  it("blocks issuance with 409 REPORT_CARD_ARCHIVE_REQUIRED when no archive exists", async () => {
    const harness = makeHarness({ artifact: null })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    expectApiError(error, "REPORT_CARD_ARCHIVE_REQUIRED")
    expect(harness.updateMany).not.toHaveBeenCalled()
  })

  it("blocks issuance when the archive is uploaded but not confirmed", async () => {
    makeHarness({ artifact: artifactFixture({ confirmedAt: null }) })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    expectApiError(error, "REPORT_CARD_ARCHIVE_REQUIRED")
  })

  it("refuses an archive bound to a different report card", async () => {
    makeHarness({
      artifact: artifactFixture({ reportCardId: ARTIFACT_REPORT_CARD_ID }),
    })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    const apiError = expectApiError(error, "REPORT_CARD_ARCHIVE_MISMATCH")
    expect(apiError.details).toEqual({ reason: "REPORT_CARD" })
  })

  it("refuses an archive bound to a different version", async () => {
    makeHarness({ artifact: artifactFixture({ version: 3 }) })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    const apiError = expectApiError(error, "REPORT_CARD_ARCHIVE_MISMATCH")
    expect(apiError.details).toEqual({ reason: "VERSION" })
  })

  it("refuses an archive bound to a different frozen snapshot", async () => {
    makeHarness({ artifact: artifactFixture({ snapshotHash: "hash-of-another-snapshot" }) })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    const apiError = expectApiError(error, "REPORT_CARD_ARCHIVE_MISMATCH")
    expect(apiError.details).toEqual({ reason: "SNAPSHOT_HASH" })
  })

  it("issues from the frozen snapshot alone when the school disables archiving (§9a)", async () => {
    const harness = makeHarness({ settingValue: "false", artifact: null })

    const issued = (await issueReportCard(CARD_ID, ACTOR)) as CardFixture

    expect(issued.status).toBe("ISSUED")
    expect(harness.artifactFind).not.toHaveBeenCalled()
  })

  it.each([[""], ["corrupt-value"], ["1"]])(
    "treats a %p stored policy value as archive-required (fail-safe)",
    async (value) => {
      const harness = makeHarness({ settingValue: value, artifact: null })

      const error = await captureError(issueReportCard(CARD_ID, ACTOR))

      expectApiError(error, "REPORT_CARD_ARCHIVE_REQUIRED")
      expect(harness.updateMany).not.toHaveBeenCalled()
    },
  )

  it("requires an archive when the school has never saved the setting", async () => {
    const harness = makeHarness({ settingValue: null, artifact: null })

    const error = await captureError(issueReportCard(CARD_ID, ACTOR))

    expectApiError(error, "REPORT_CARD_ARCHIVE_REQUIRED")
    expect(harness.updateMany).not.toHaveBeenCalled()
  })
})
