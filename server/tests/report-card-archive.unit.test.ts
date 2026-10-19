// Database-free tests for the report-card PDF archive workflow
// (docs/report-card.md §9, §9a). The Prisma access layer is mocked at
// `lib/database.js` and the object store at `lib/storage/index.js`, so this
// suite never imports a live client, never connects, never writes a file, and
// never touches the database.
//
// It asserts what §9 requires of the server: magic-byte and size validation of
// the actual bytes, a tenant-bound server-generated storage key, the artifact
// record bound to the frozen (reportCardId, version, snapshotHash) with the
// confirmed uploader identity, serialization behind the student-scope lock, the
// pre-issue-only replace rule, and the storage-success/DB-failure compensation
// (including the orphan-object case where that cleanup itself fails).

import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
  disconnectDatabase: vi.fn(),
}))

vi.mock("../src/lib/storage/index.js", () => ({
  getStorage: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { getStorage, type StorageProvider } from "../src/lib/storage/index.js"
import {
  lockReportCardStudentScopeForUpdate,
  lockStudentEnrollmentForUpdate,
} from "../src/lib/db-locks.js"
import { ApiError } from "../src/lib/ApiError.js"
import {
  attachReportCardArchive,
  getReportCardArchive,
} from "../src/modules/report-cards/report-card.artifact.service.js"

const mockGetPrisma = vi.mocked(getPrisma)
const mockGetStorage = vi.mocked(getStorage)

const SCHOOL_ID = "00000000-0000-4000-8000-0000000000a1"
const OTHER_SCHOOL_ID = "00000000-0000-4000-8000-0000000000a2"
const SESSION_ID = "00000000-0000-4000-8000-0000000000b1"
const STUDENT_ID = "00000000-0000-4000-8000-0000000000d1"
const ACTOR_ID = "00000000-0000-4000-8000-0000000000e1"
const CARD_ID = "00000000-0000-4000-8000-0000000030f1"

const ACTOR = { schoolId: SCHOOL_ID, userId: ACTOR_ID }
const MAX_BYTES = 10 * 1024 * 1024

const PDF_BYTES = Buffer.concat([
  Buffer.from("%PDF-1.7\n", "ascii"),
  Buffer.from("1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n", "ascii"),
])
const NOT_A_PDF = Buffer.from("<html><body>not a pdf</body></html>", "utf8")

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
}

function cardFixture(overrides: Partial<CardFixture> = {}): CardFixture {
  return {
    id: CARD_ID,
    version: 3,
    status: "PENDING_ARCHIVE",
    snapshotHash: "hash-v3",
    schoolId: SCHOOL_ID,
    academicSessionId: SESSION_ID,
    studentId: STUDENT_ID,
    ...overrides,
  }
}

interface HarnessOptions {
  scope?: { academicSessionId: string; studentId: string } | null
  card?: CardFixture | null
  existingArtifact?: { id: string } | null
  createError?: unknown
  putError?: unknown
  removeError?: unknown
  getObject?: { buffer: Buffer } | null
  archiveRow?: { storageKey: string } | null
  /** What the compensation's "is this key still referenced?" check returns. */
  referencedStorageKey?: { id: string } | null
}

interface Harness {
  calls: Array<{ op: string; args?: Record<string, unknown> }>
  put: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  deleteMany: ReturnType<typeof vi.fn>
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
  const card = options.card === undefined ? cardFixture() : options.card
  const existingArtifact =
    options.existingArtifact === undefined ? null : options.existingArtifact

  const put = vi.fn(async () => {
    record("storage.put")
    if (options.putError) throw options.putError
  })
  const remove = vi.fn(async () => {
    record("storage.remove")
    if (options.removeError) throw options.removeError
  })
  const get = vi.fn(async () => options.getObject ?? null)
  mockGetStorage.mockReturnValue({ put, remove, get } as unknown as StorageProvider)

  const create = vi.fn(async () => {
    record("reportCardArtifact.create")
    if (options.createError) throw options.createError
    return { id: "artifact-1" }
  })
  const deleteMany = vi.fn(async () => {
    record("reportCardArtifact.deleteMany")
    return { count: 1 }
  })

  const reportCard = {
    findFirst: vi.fn(async (args?: Record<string, unknown>) => {
      // Call 1 is the pre-lock scope read; call 2 is the authoritative read
      // taken after the student-scope lock.
      const reads = calls.filter((c) => c.op.startsWith("reportCard.findFirst")).length
      if (reads === 0) {
        record("reportCard.findFirst:scope", args)
        return scope
      }
      record("reportCard.findFirst:card", args)
      return card
    }),
  }
  const reportCardArtifact = {
    findFirst: vi.fn(async (args?: Record<string, unknown>) => {
      record("reportCardArtifact.findFirst", args)
      const where = (args?.where ?? {}) as Record<string, unknown>
      // The compensation asks whether ANY row still references the stored key;
      // every other lookup is the attach/get path keyed on the card.
      if (where.storageKey !== undefined) return options.referencedStorageKey ?? null
      if (options.archiveRow !== undefined) return options.archiveRow
      return existingArtifact
    }),
    create,
    deleteMany,
  }
  const $queryRaw = vi.fn(async (...args: unknown[]) => {
    record("lock", { sql: String((args[0] as string[]).join("?")) })
    return []
  })

  const tx = { reportCard, reportCardArtifact, $queryRaw }
  const prisma = {
    reportCard,
    reportCardArtifact: {
      ...reportCardArtifact,
      // The out-of-transaction compensation after a rolled-back replace.
      deleteMany: deleteMany,
    },
    $queryRaw,
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  }

  mockGetPrisma.mockResolvedValue(prisma as unknown as Awaited<ReturnType<typeof getPrisma>>)
  return { calls, put, remove, create, deleteMany }
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
// Validation of the actual bytes (§9.4)
// ────────────────────────────────────────────────────────────────────────────

describe("attachReportCardArchive — validation", () => {
  it("rejects bytes that are not a PDF, before touching storage or the database", async () => {
    const harness = makeHarness()
    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: NOT_A_PDF },
        maxBytes: MAX_BYTES,
      }),
    )

    expectApiError(error, "REPORT_CARD_INVALID_PDF")
    expect(harness.put).not.toHaveBeenCalled()
    expect(harness.create).not.toHaveBeenCalled()
    expect(harness.deleteMany).not.toHaveBeenCalled()
  })

  it("accepts a PDF header located within the first 1024 bytes (ISO 32000-1)", async () => {
    const harness = makeHarness()
    const buffer = Buffer.concat([Buffer.alloc(200, 0x20), Buffer.from("%PDF-1.4\n%%EOF\n", "ascii")])

    const artifact = await attachReportCardArchive({
      reportCardId: CARD_ID,
      actor: ACTOR,
      file: { buffer },
      maxBytes: MAX_BYTES,
    })

    expect(artifact).toEqual({ id: "artifact-1" })
    expect(harness.put).toHaveBeenCalledTimes(1)
  })

  it("enforces the size bound defensively (the multipart parser enforces it first)", async () => {
    const harness = makeHarness()
    const buffer = Buffer.concat([Buffer.from("%PDF-1.7\n", "ascii"), Buffer.alloc(2048, 0x41)])

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer },
        maxBytes: 64,
      }),
    )

    const apiError = expectApiError(error, "BAD_REQUEST")
    expect(apiError.message).toContain("maximum allowed size")
    expect(harness.put).not.toHaveBeenCalled()
    expect(harness.create).not.toHaveBeenCalled()
  })

  it("rejects an empty upload", async () => {
    const harness = makeHarness()
    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: Buffer.alloc(0) },
        maxBytes: MAX_BYTES,
      }),
    )

    expectApiError(error, "BAD_REQUEST")
    expect(harness.put).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Successful attach (§9.3-§9.4, artifact record §9)
// ────────────────────────────────────────────────────────────────────────────

describe("attachReportCardArchive — success path", () => {
  it("locks the student scope first, then records and stores a bound artifact", async () => {
    const harness = makeHarness()

    await attachReportCardArchive({
      reportCardId: CARD_ID,
      actor: ACTOR,
      file: { buffer: PDF_BYTES },
      filename: "card.pdf",
      maxBytes: MAX_BYTES,
    })

    // The pre-lock read only resolves the lock scope; inside the transaction the
    // serialization point is taken before any card state is read.
    expect(opNames(harness).slice(0, 3)).toEqual([
      "reportCard.findFirst:scope",
      "lock",
      "reportCard.findFirst:card",
    ])
    const lockCall = harness.calls[1]?.args as { sql: string }
    expect(lockCall.sql).toContain('FROM "ReportCard"')
    expect(lockCall.sql).toContain("FOR UPDATE")

    const createArgs = harness.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>
    }
    expect(createArgs.data).toMatchObject({
      schoolId: SCHOOL_ID,
      reportCardId: CARD_ID,
      version: 3,
      snapshotHash: "hash-v3",
      byteSize: PDF_BYTES.byteLength,
      filename: "card.pdf",
      uploadedByUserId: ACTOR_ID,
      confirmedByUserId: ACTOR_ID,
    })
    expect(createArgs.data.confirmedAt).toBeInstanceOf(Date)
    expect(createArgs.data.uploadedAt).toBeInstanceOf(Date)
    expect(createArgs.data.sha256).toBe(
      createHash("sha256").update(PDF_BYTES).digest("hex"),
    )

    // Tenant-bound, server-generated key from the stored card — never from input.
    expect(createArgs.data.storageKey).toBe(
      `report-cards/${SCHOOL_ID}/${SESSION_ID}/${STUDENT_ID}/v3.pdf`,
    )
    expect(harness.put).toHaveBeenCalledWith(
      `report-cards/${SCHOOL_ID}/${SESSION_ID}/${STUDENT_ID}/v3.pdf`,
      PDF_BYTES,
      "application/pdf",
    )
    expect(harness.deleteMany).not.toHaveBeenCalled()
  })

  it("scopes the pre-lock read to the acting tenant", async () => {
    const harness = makeHarness()

    await attachReportCardArchive({
      reportCardId: CARD_ID,
      actor: ACTOR,
      file: { buffer: PDF_BYTES },
      maxBytes: MAX_BYTES,
    })

    const scopeRead = harness.calls.find((c) => c.op === "reportCard.findFirst:scope")
    const where = scopeRead?.args?.where as Record<string, unknown>
    expect(where).toEqual({ id: CARD_ID, schoolId: SCHOOL_ID })
    expect(where.schoolId).not.toBe(OTHER_SCHOOL_ID)
  })

  it("returns 404 for a card that does not belong to the tenant", async () => {
    const harness = makeHarness({ scope: null, card: null })

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    expectApiError(error, "NOT_FOUND")
    expect(harness.put).not.toHaveBeenCalled()
  })

  it("refuses to attach to a DRAFT (publish first)", async () => {
    const harness = makeHarness({ card: cardFixture({ status: "DRAFT" }) })

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    const apiError = expectApiError(error, "REPORT_CARD_INVALID_STATE")
    expect(apiError.statusCode).toBe(409)
    expect(harness.put).not.toHaveBeenCalled()
  })

  it.each(["SUPERSEDED", "VOID"])(
    "refuses to attach to a %s version (history is never rewritten)",
    async (status) => {
      const harness = makeHarness({ card: cardFixture({ status }) })

      const error = await captureError(
        attachReportCardArchive({
          reportCardId: CARD_ID,
          actor: ACTOR,
          file: { buffer: PDF_BYTES },
          maxBytes: MAX_BYTES,
        }),
      )

      expectApiError(error, "REPORT_CARD_INVALID_STATE")
      expect(harness.put).not.toHaveBeenCalled()
      expect(harness.deleteMany).not.toHaveBeenCalled()
    },
  )

  it("refuses to replace the archive of an ISSUED version", async () => {
    const harness = makeHarness({
      card: cardFixture({ status: "ISSUED" }),
      existingArtifact: { id: "existing-artifact" },
    })

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    expectApiError(error, "REPORT_CARD_ARCHIVE_EXISTS")
    expect(harness.deleteMany).not.toHaveBeenCalled()
    expect(harness.put).not.toHaveBeenCalled()
  })

  it("replaces a pre-issue archive as delete-then-new-record, never an UPDATE", async () => {
    const harness = makeHarness({ existingArtifact: { id: "existing-artifact" } })

    await attachReportCardArchive({
      reportCardId: CARD_ID,
      actor: ACTOR,
      file: { buffer: PDF_BYTES },
      maxBytes: MAX_BYTES,
    })

    expect(harness.deleteMany).toHaveBeenCalledTimes(1)
    expect(harness.create).toHaveBeenCalledTimes(1)
    expect(harness.put).toHaveBeenCalledTimes(1)
    expect(opNames(harness).slice(0, 3)).toEqual([
      "reportCard.findFirst:scope",
      "lock",
      "reportCard.findFirst:card",
    ])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Storage-success / DB-failure compensation (§9 failure/retry)
// ────────────────────────────────────────────────────────────────────────────

describe("attachReportCardArchive — failure compensation", () => {
  it("removes the stored object when the database write fails", async () => {
    const dbFailure = new Error("insert failed")
    const harness = makeHarness({ createError: dbFailure })

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    expect(error).toBe(dbFailure)
    expect(harness.put).toHaveBeenCalledTimes(1)
    const key = `report-cards/${SCHOOL_ID}/${SESSION_ID}/${STUDENT_ID}/v3.pdf`
    expect(harness.remove).toHaveBeenCalledWith(key)
  })

  it("still surfaces the original error when the cleanup itself fails (orphaned object)", async () => {
    const dbFailure = new Error("insert failed")
    const harness = makeHarness({ createError: dbFailure, removeError: new Error("disk full") })

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    // The orphaned object is unreferenced by any row, so it is never served;
    // the real failure must not be masked by the cleanup failure.
    expect(error).toBe(dbFailure)
    expect(harness.remove).toHaveBeenCalledTimes(1)
    expect(harness.create).toHaveBeenCalledTimes(1)
  })

  it("does not attempt cleanup when storage itself failed (nothing was stored)", async () => {
    const harness = makeHarness({ putError: new Error("storage unavailable") })

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("storage unavailable")
    expect(harness.remove).not.toHaveBeenCalled()
  })

  it("drops the restored previous row too when a replace fails after storage", async () => {
    const dbFailure = new Error("insert failed")
    const harness = makeHarness({
      existingArtifact: { id: "existing-artifact" },
      createError: dbFailure,
    })

    const error = await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    expect(error).toBe(dbFailure)
    // Once: inside the transaction (the replace), once more as the
    // compensation after the rollback restored the previous row.
    expect(harness.deleteMany).toHaveBeenCalledTimes(2)
    expect(harness.remove).toHaveBeenCalledTimes(1)
  })

  it("deletes the restored row BEFORE removing its object, behind the lock", async () => {
    const harness = makeHarness({
      existingArtifact: { id: "existing-artifact" },
      createError: new Error("insert failed"),
    })

    await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    const names = opNames(harness)
    // The compensation serializes on the same student-scope lock.
    expect(names.filter((name) => name === "lock")).toHaveLength(2)
    // ...and never removes the object until the row that referenced it is gone.
    expect(names.lastIndexOf("reportCardArtifact.deleteMany")).toBeLessThan(
      names.indexOf("storage.remove"),
    )
    // The compensation removes the object by its exact stored key.
    expect(harness.remove).toHaveBeenCalledWith(
      `report-cards/${SCHOOL_ID}/${SESSION_ID}/${STUDENT_ID}/v3.pdf`,
    )
  })

  it("keeps the object when another writer's committed row still references the key", async () => {
    const harness = makeHarness({
      existingArtifact: { id: "existing-artifact" },
      createError: new Error("insert failed"),
      referencedStorageKey: { id: "concurrent-artifact" },
    })

    await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    // A concurrent replacement committed a different row against the same key:
    // its bytes must not be deleted out from under it.
    expect(harness.remove).not.toHaveBeenCalled()
  })

  it("removes the object of a failed fresh upload without deleting any row", async () => {
    const harness = makeHarness({ createError: new Error("insert failed") })

    await captureError(
      attachReportCardArchive({
        reportCardId: CARD_ID,
        actor: ACTOR,
        file: { buffer: PDF_BYTES },
        maxBytes: MAX_BYTES,
      }),
    )

    expect(harness.deleteMany).not.toHaveBeenCalled()
    expect(harness.remove).toHaveBeenCalledTimes(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Reading the archive back (§9.7)
// ────────────────────────────────────────────────────────────────────────────

describe("getReportCardArchive", () => {
  it("returns null when the version has no archive", async () => {
    makeHarness({ archiveRow: null })
    const result = await getReportCardArchive(CARD_ID, SCHOOL_ID)
    expect(result).toBeNull()
  })

  it("returns the stored bytes for an archived version", async () => {
    makeHarness({
      archiveRow: { storageKey: `report-cards/${SCHOOL_ID}/${SESSION_ID}/${STUDENT_ID}/v3.pdf` },
      getObject: { buffer: PDF_BYTES },
    })
    const result = await getReportCardArchive(CARD_ID, SCHOOL_ID)
    expect(result?.buffer.equals(PDF_BYTES)).toBe(true)
  })

  it("surfaces a record whose object is missing as a storage fault, not an absence", async () => {
    makeHarness({
      archiveRow: { storageKey: `report-cards/${SCHOOL_ID}/missing.pdf` },
      getObject: null,
    })
    const error = await captureError(getReportCardArchive(CARD_ID, SCHOOL_ID))
    expectApiError(error, "STORAGE_ERROR")
  })
})

// ────────────────────────────────────────────────────────────────────────────
// The shared lock primitive
// ────────────────────────────────────────────────────────────────────────────

describe("lockReportCardStudentScopeForUpdate", () => {
  it("locks every version of one student scope in version order", async () => {
    const $queryRaw = vi.fn(async () => [])
    await lockReportCardStudentScopeForUpdate(
      { $queryRaw } as unknown as Parameters<typeof lockReportCardStudentScopeForUpdate>[0],
      { schoolId: SCHOOL_ID, academicSessionId: SESSION_ID, studentId: STUDENT_ID },
    )

    expect($queryRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = $queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ]
    const sql = strings.join("?")
    expect(sql).toContain('FROM "ReportCard"')
    expect(sql).toContain('ORDER BY "version" FOR UPDATE')
    expect(values).toEqual([SCHOOL_ID, SESSION_ID, STUDENT_ID])
  })

  it("locks nothing for another school's student (tenant-scoped predicate)", async () => {
    const $queryRaw = vi.fn(async () => [])
    await lockReportCardStudentScopeForUpdate(
      { $queryRaw } as unknown as Parameters<typeof lockReportCardStudentScopeForUpdate>[0],
      { schoolId: OTHER_SCHOOL_ID, academicSessionId: SESSION_ID, studentId: STUDENT_ID },
    )

    const [strings, ...values] = $queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ]
    expect(strings.join("?")).toContain('"schoolId" = ?')
    expect(values[0]).toBe(OTHER_SCHOOL_ID)
  })
})

describe("lockStudentEnrollmentForUpdate", () => {
  // The generation anchor: the always-existing StudentEnrollment row for one
  // (student, session) scope. It locks the unique enrollment row so concurrent
  // generations serialize even when no ReportCard row exists yet.
  it("locks the unique enrollment row for the generation scope", async () => {
    const $queryRaw = vi.fn(async () => [])
    await lockStudentEnrollmentForUpdate(
      { $queryRaw } as unknown as Parameters<typeof lockStudentEnrollmentForUpdate>[0],
      { studentId: STUDENT_ID, academicSessionId: SESSION_ID },
    )

    expect($queryRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = $queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ]
    const sql = strings.join("?")
    expect(sql).toContain('FROM "StudentEnrollment"')
    expect(sql).toContain('"studentId" = ?')
    expect(sql).toContain('"academicSessionId" = ?')
    expect(sql).toContain("FOR UPDATE")
    expect(sql).not.toContain('"schoolId"')
    expect(values).toEqual([STUDENT_ID, SESSION_ID])
  })

  it("scopes the lock by student and session only — never a ReportCard table lock", async () => {
    const $queryRaw = vi.fn(async () => [])
    await lockStudentEnrollmentForUpdate(
      { $queryRaw } as unknown as Parameters<typeof lockStudentEnrollmentForUpdate>[0],
      { studentId: STUDENT_ID, academicSessionId: SESSION_ID },
    )

    const sql = ($queryRaw.mock.calls[0] as unknown as [TemplateStringsArray])[0].join("?")
    expect(sql).not.toContain('"ReportCard"')
  })
})
