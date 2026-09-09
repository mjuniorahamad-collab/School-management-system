import { randomUUID } from "node:crypto"
import type { AuditEntityType } from "@prisma/client"
import { badRequestError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { processImage, UnsafeImageError } from "../../lib/image.js"
import { getStorage, type StorageProvider } from "../../lib/storage/index.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

/**
 * Per-entity wiring used by the shared photo service so Student / Teacher /
 * Staff photos reuse one implementation (no duplicated logic).
 */
export interface PhotoEntity {
  /** Storage-key path segment, e.g. "students". */
  keyPrefix: string
  /** Audit entity type, e.g. STUDENT. */
  entityType: AuditEntityType
  /** Reads the current storage key for a record, tenant-scoped, or null. */
  getCurrent: (prisma: PrismaClient, id: string, schoolId: string) => Promise<string | null>
  /** Sets the storage key (or null to clear) on a record and records an audit. */
  setCurrent: (
    prisma: PrismaClient,
    id: string,
    schoolId: string,
    key: string | null,
    actor: AuthUser,
    action: "PHOTO_UPLOAD" | "PHOTO_REPLACE" | "PHOTO_REMOVE",
  ) => Promise<void>
}

export interface SizedFile {
  originalname?: string
  buffer: Buffer
  size: number
  mimetype?: string
}

export interface PhotoResult {
  photoUrl: string | null
}

/** Builds a tenant-aware, server-generated object key (never client-supplied). */
export function buildPhotoKey(schoolId: string, entity: PhotoEntity, extension: string): string {
  const uuid = randomUUID()
  return `photos/${schoolId}/${entity.keyPrefix}/${uuid}.${extension}`
}

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

/**
 * Validates, optimizes and stores a profile photo, then replaces the entity's
 * recorded key. The previous object (if any) is deleted after the new object is
 * safely persisted, so replacing is atomic-from-the-reader's perspective and
 * orphaned objects are cleaned up.
 */
export async function uploadOrReplacePhoto(
  entity: PhotoEntity,
  args: { id: string; schoolId: string; actor: AuthUser; file?: SizedFile },
): Promise<PhotoResult> {
  const { id, schoolId, actor, file } = args
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw badRequestError("No photo file was provided")
  }
  if (file.size === 0) {
    throw badRequestError("The uploaded photo is empty")
  }

  const prisma = await requirePrisma()
  const storage = getStorage()

  const existingKey = await entity.getCurrent(prisma, id, schoolId)

  // Validate + optimize the actual bytes (magic-byte sniffing, EXIF stripped).
  let processed: Awaited<ReturnType<typeof processImage>>
  try {
    processed = await processImage(file.buffer)
  } catch (error) {
    if (error instanceof UnsafeImageError) {
      throw badRequestError(error.message)
    }
    throw error
  }
  const newKey = buildPhotoKey(schoolId, entity, processed.extension)

  // Persist the new object BEFORE updating the database reference so a reader
  // never sees a dangling key. If persistence fails the old photo is untouched.
  await storage.put(newKey, processed.buffer, processed.contentType)

  const replacing = existingKey !== null
  const action: "PHOTO_UPLOAD" | "PHOTO_REPLACE" =
    replacing ? "PHOTO_REPLACE" : "PHOTO_UPLOAD"

  try {
    await entity.setCurrent(prisma, id, schoolId, newKey, actor, action)
  } catch (error) {
    // The DB write failed — roll back the stored object so we do not leak an
    // orphan and do not leave a phantom key.
    await safeRemove(storage, newKey)
    throw error
  }

  // Clean up the previous object after the new reference is committed.
  if (existingKey && existingKey !== newKey) {
    await safeRemove(storage, existingKey)
  }

  return { photoUrl: newKey }
}

/**
 * Clears the entity's photo reference and deletes the stored object. Returns the
 * entity's current photo key removed (or null if there was none).
 */
export async function removePhoto(
  entity: PhotoEntity,
  args: { id: string; schoolId: string; actor: AuthUser },
): Promise<PhotoResult> {
  const { id, schoolId, actor } = args
  const prisma = await requirePrisma()
  const storage = getStorage()

  const existingKey = await entity.getCurrent(prisma, id, schoolId)
  if (!existingKey) {
    // No photo to remove — treat as an idempotent success (record still exists).
    return { photoUrl: null }
  }

  await entity.setCurrent(prisma, id, schoolId, null, actor, "PHOTO_REMOVE")
  await safeRemove(storage, existingKey)
  return { photoUrl: null }
}

/**
 * Authenticated photo serving. Resolves the entity's tenant-scoped storage key
 * and returns the bytes, so photos are never served through a public URL.
 * Returns null when the entity has no photo.
 */
export async function getPhoto(
  entity: PhotoEntity,
  args: { id: string; schoolId: string },
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const prisma = await requirePrisma()
  const storage = getStorage()

  const key = await entity.getCurrent(prisma, args.id, args.schoolId)
  if (!key) return null

  const object = await storage.get(key)
  if (!object) {
    // The object is missing from storage but the DB still references it. Treat
    // as a 404 so the client falls back to initials.
    return null
  }

  return {
    buffer: object.buffer,
    contentType: object.contentType,
  }
}

async function safeRemove(storage: StorageProvider, key: string): Promise<void> {
  try {
    await storage.remove(key)
  } catch (error) {
    // Orphan cleanup is best-effort; a failure to delete an old object must not
    // fail the user-facing operation.
    const { logWarn } = await import("../../lib/logger.js")
    logWarn(`Failed to remove storage object ${key}: ${String(error)}`)
  }
}

/** Shared audit writer for photo lifecycle actions. */
export async function auditPhotoLifecycle(
  prisma: PrismaClient,
  args: {
    schoolId: string
    actor: AuthUser
    entityType: AuditEntityType
    entityId: string
    action: "PHOTO_UPLOAD" | "PHOTO_REPLACE" | "PHOTO_REMOVE"
    summary: string
  },
): Promise<void> {
  const auditActor = await resolveAuditActor(prisma, args.schoolId, args.actor)
  const action = args.action === "PHOTO_REMOVE" ? "DELETE" : "UPDATE"
  await recordAudit(prisma, {
    schoolId: args.schoolId,
    actorId: auditActor.id,
    actorName: auditActor.name,
    actorRole: auditActor.role,
    actorEmail: auditActor.email,
    action,
    entityType: args.entityType,
    entityId: args.entityId,
    summary: args.summary,
  })
}
