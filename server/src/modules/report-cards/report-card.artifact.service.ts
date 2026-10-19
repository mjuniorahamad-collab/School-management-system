import { createHash } from "node:crypto"
import type { Prisma, ReportCardArtifact } from "@prisma/client"
import { badRequestError, serviceUnavailableError, storageError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockReportCardStudentScopeForUpdate } from "../../lib/db-locks.js"
import { logWarn } from "../../lib/logger.js"
import { getStorage, type StorageProvider } from "../../lib/storage/index.js"
import {
  reportCardArchiveExistsError,
  reportCardInvalidPdfError,
  reportCardInvalidStateError,
  reportCardNotFoundError,
} from "./report-card.errors.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = Prisma.TransactionClient

/** The identity an archive upload is attributed to (docs/report-card.md §9.3). */
export interface ArchiveActor {
  schoolId: string
  userId: string
}

/** Never trusted from the client — served explicitly for PDFs (§9.7). */
export const PDF_ARCHIVE_CONTENT_TYPE = "application/pdf"

const PDF_HEADER = Buffer.from("%PDF-", "ascii")
/**
 * ISO 32000-1 §7.5.2 places the header within the first 1024 bytes, so a file
 * with no `%PDF-` anywhere in that window is not a PDF regardless of what its
 * filename or Content-Type claims (§9.4).
 */
const PDF_HEADER_SCAN_BYTES = 1024
const MAX_FILENAME_LENGTH = 200

/**
 * Bounds for the archive write transaction (and its compensation).
 *
 * The transaction deliberately holds the student-scope lock across one
 * object-store round trip: that is what guarantees the row it creates always
 * describes the bytes currently at the key, because no concurrent upload can
 * slip its own bytes under the row while the lock is held. Prisma's 5s default
 * is too tight for a maximum-size PDF on a remote provider, so the timeout is
 * raised to comfortably cover `UPLOAD_PDF_MAX_SIZE_MB`. `timeout` also bounds
 * how long issuance for the same student can queue behind an upload, and
 * `maxWait` keeps the wait for a pooled connection bounded.
 */
const ARCHIVE_TRANSACTION_TIMEOUT_MS = 30_000
const ARCHIVE_TRANSACTION_MAX_WAIT_MS = 5_000
const ARCHIVE_TRANSACTION_OPTIONS = {
  maxWait: ARCHIVE_TRANSACTION_MAX_WAIT_MS,
  timeout: ARCHIVE_TRANSACTION_TIMEOUT_MS,
} as const

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw serviceUnavailableError("Database is not configured")
  return prisma
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

/**
 * Rejects anything that is not a PDF of an acceptable size BEFORE it reaches
 * storage or the database. Size is checked here only as defence in depth: the
 * multipart parser (`uploadPdfMiddleware`) enforces `UPLOAD_PDF_MAX_SIZE_MB`
 * while the body streams, so an oversized upload is aborted without being
 * buffered in full.
 */
function assertPdfArchiveBytes(buffer: Buffer, maxBytes: number): void {
  const headerWindow = buffer.subarray(0, PDF_HEADER_SCAN_BYTES)
  if (headerWindow.indexOf(PDF_HEADER) === -1) throw reportCardInvalidPdfError()
  if (buffer.byteLength > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024))
    throw badRequestError(`PDF archive exceeds the maximum allowed size of ${maxMb} MB`)
  }
}

/**
 * Tenant-bound, server-generated storage key for a version's archive (§9).
 * Every segment comes from the stored card; nothing client-supplied reaches it.
 */
function buildReportCardArchiveKey(card: {
  schoolId: string
  academicSessionId: string
  studentId: string
  version: number
}): string {
  return `report-cards/${card.schoolId}/${card.academicSessionId}/${card.studentId}/v${card.version}.pdf`
}

/**
 * Reads the archive recorded for a report card, tenant-scoped. Used by the
 * issuance gate inside its transaction so issue and attach observe the same
 * committed artifact state.
 */
export async function findReportCardArchive(
  client: DbClient,
  params: { reportCardId: string; schoolId: string },
): Promise<ReportCardArtifact | null> {
  return client.reportCardArtifact.findFirst({
    where: { reportCardId: params.reportCardId, schoolId: params.schoolId },
  })
}

export interface AttachReportCardArchiveInput {
  reportCardId: string
  actor: ArchiveActor
  file: { buffer: Buffer }
  filename?: string | null
  /** Maximum accepted size in bytes; enforced by the multipart parser first. */
  maxBytes: number
}

/**
 * Validates, stores and records the PDF archive for one frozen report-card
 * version (docs/report-card.md §9):
 *
 * - validates magic bytes, size and checksum from the actual bytes (never the
 *   claimed MIME type or filename);
 * - binds `(reportCardId, version, snapshotHash)` of the stored card to the
 *   artifact, plus tenant binding and the confirmed uploader identity;
 * - serializes against concurrent issue/supersede/attach for the same
 *   (school, session, student) via the student-scope lock;
 * - replaces a pre-issue archive only (an ISSUED version keeps its archive —
 *   correcting it requires a new version, §9.6).
 *
 * Ordering mirrors the photo workflow: the bytes are written first and the row
 * is created afterwards, inside the transaction that already holds the scope
 * lock, so a row can only become visible once its bytes are in place. If the
 * transaction then fails, the version is left unarchived and retryable by
 * `discardFailedArchive`, which deletes the database row BEFORE its object and
 * removes the object only once no row references its key — so a committed row
 * can never durably point at a missing object. A cleanup failure leaves an
 * unreferenced (orphaned) object, which is never served and is overwritten by
 * the next successful upload of the same version.
 */
export async function attachReportCardArchive(
  input: AttachReportCardArchiveInput,
): Promise<ReportCardArtifact> {
  const { reportCardId, actor, file, maxBytes } = input
  const buffer = file?.buffer
  if (!buffer || buffer.length === 0) throw badRequestError("No PDF file was provided")
  assertPdfArchiveBytes(buffer, maxBytes)
  const sha256 = sha256Hex(buffer)
  const filename = (input.filename ?? "").slice(0, MAX_FILENAME_LENGTH) || null

  const prisma = await requirePrisma()
  const storage = getStorage()

  // Scope is read before the lock (the lock needs it) and re-read inside it.
  const scope = await prisma.reportCard.findFirst({
    where: { id: reportCardId, schoolId: actor.schoolId },
    select: { academicSessionId: true, studentId: true },
  })
  if (!scope) throw reportCardNotFoundError()

  let storedKey = ""
  let replacedRowId: string | null = null

  try {
    return await prisma.$transaction(async (tx) => {
      await lockReportCardStudentScopeForUpdate(tx, {
        schoolId: actor.schoolId,
        academicSessionId: scope.academicSessionId,
        studentId: scope.studentId,
      })

      const card = await tx.reportCard.findFirst({
        where: { id: reportCardId, schoolId: actor.schoolId },
        select: {
          id: true,
          version: true,
          status: true,
          snapshotHash: true,
          schoolId: true,
          academicSessionId: true,
          studentId: true,
        },
      })
      if (!card) throw reportCardNotFoundError()
      if (card.status === "DRAFT") {
        throw reportCardInvalidStateError(
          "Publish the report card before attaching a PDF archive",
        )
      }
      if (card.status === "SUPERSEDED" || card.status === "VOID") {
        throw reportCardInvalidStateError(
          `A ${card.status.toLowerCase()} report card version cannot receive a new PDF archive`,
        )
      }
      if (!card.snapshotHash) {
        throw reportCardInvalidStateError("Report card has no frozen snapshot to bind an archive to")
      }
      const snapshotHash = card.snapshotHash

      const existing = await tx.reportCardArtifact.findFirst({
        where: { reportCardId: card.id, schoolId: actor.schoolId },
        select: { id: true },
      })
      if (existing && card.status === "ISSUED") throw reportCardArchiveExistsError()
      replacedRowId = existing?.id ?? null
      const storageKey = buildReportCardArchiveKey(card)
      const byteSize = buffer.byteLength
      const now = new Date()

      if (replacedRowId) {
        // The old row is removed inside the same transaction, so no reader ever
        // sees an intermediate state — and it stays "never mutated": a replace
        // is a delete plus a brand-new artifact record, never an UPDATE that
        // rebinds an existing archive to different bytes (§9.6).
        await tx.reportCardArtifact.deleteMany({
          where: { reportCardId: card.id, schoolId: actor.schoolId },
        })
      }

      await storage.put(storageKey, buffer, PDF_ARCHIVE_CONTENT_TYPE)
      storedKey = storageKey
      return await tx.reportCardArtifact.create({
        data: {
          schoolId: actor.schoolId,
          reportCardId: card.id,
          version: card.version,
          snapshotHash,
          storageKey,
          sha256,
          byteSize,
          filename,
          uploadedByUserId: actor.userId,
          uploadedAt: now,
          confirmedByUserId: actor.userId,
          confirmedAt: now,
        },
      })
    }, ARCHIVE_TRANSACTION_OPTIONS)
  } catch (error) {
    if (storedKey) {
      await discardFailedArchive(prisma, storage, {
        reportCardId,
        schoolId: actor.schoolId,
        academicSessionId: scope.academicSessionId,
        studentId: scope.studentId,
        replacedRowId,
        storedKey,
      })
    }
    throw error
  }
}

/**
 * Compensation for an archive whose bytes reached storage but whose transaction
 * rolled back (docs/report-card.md §9 failure/retry).
 *
 * It takes the SAME student-scope lock as attach/publish/issue, so it cannot
 * interleave with a concurrent upload: by the time it holds the lock the
 * competing writer has either committed (its archive is kept) or not yet
 * started. The previously-replaced row is re-deleted by its exact id, so a row
 * another writer has since created (a different id) is never dropped.
 *
 * The row is deleted BEFORE its object, and the object is removed only once no
 * row references its key. So the invariant "a committed artifact row never
 * points at a missing object" holds even if this compensation is interrupted:
 * the failure modes are (a) the row survives and still references an existing
 * object, or (b) the object is unreferenced (orphaned) — neither is a dangling
 * row. A failed object removal is logged, never rethrown, so it can never mask
 * the original error.
 *
 * Residual window: if the database commit itself fails AFTER storage
 * acknowledged the removal, the client cannot distinguish commit from
 * rollback; that outcome is a storage/commit fault, not an application
 * decision, and is left documented rather than silently assumed away.
 */
async function discardFailedArchive(
  prisma: PrismaClient,
  storage: StorageProvider,
  params: {
    reportCardId: string
    schoolId: string
    academicSessionId: string
    studentId: string
    replacedRowId: string | null
    storedKey: string
  },
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await lockReportCardStudentScopeForUpdate(tx, {
        schoolId: params.schoolId,
        academicSessionId: params.academicSessionId,
        studentId: params.studentId,
      })

      if (params.replacedRowId) {
        await tx.reportCardArtifact.deleteMany({
          where: { id: params.replacedRowId, schoolId: params.schoolId },
        })
      }

      const referenced = await tx.reportCardArtifact.findFirst({
        where: { schoolId: params.schoolId, storageKey: params.storedKey },
        select: { id: true },
      })
      if (referenced) return

      try {
        await storage.remove(params.storedKey)
      } catch (removeError) {
        // The row is already gone, so the object is simply unreferenced: an
        // orphan, overwritten by the next successful upload of this version.
        logWarn(
          `Failed to remove orphaned report card archive object ${params.storedKey}: ${String(removeError)}`,
        )
      }
    }, ARCHIVE_TRANSACTION_OPTIONS)
  } catch (cleanupError) {
    // The row deletion did not commit (or storage was never reached), so any
    // surviving row still references an existing object. Best effort only: the
    // original failure must never be masked.
    logWarn(
      `Failed to discard rolled-back report card archive for ${params.reportCardId}: ${String(cleanupError)}`,
    )
  }
}

/**
 * Reads the archived PDF for a report card (docs/report-card.md §9.7). The
 * artifact row is resolved first and the object is fetched from its stored key,
 * so a client can never address storage directly. `null` means the version has
 * no archive at all; a record whose object is missing is a storage fault, not
 * an absence, and is surfaced as such.
 */
export async function getReportCardArchive(
  reportCardId: string,
  schoolId: string,
): Promise<{ buffer: Buffer } | null> {
  const prisma = await requirePrisma()
  const artifact = await prisma.reportCardArtifact.findFirst({
    where: { reportCardId, schoolId },
    select: { storageKey: true },
  })
  if (!artifact) return null

  const object = await getStorage().get(artifact.storageKey)
  if (!object) {
    logWarn(`Report card archive object missing from storage: ${artifact.storageKey}`)
    throw storageError("The archived report card PDF could not be read from storage")
  }
  return { buffer: object.buffer }
}
