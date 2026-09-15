/**
 * StorageProvider abstraction.
 *
 * Profile photos are sensitive personal data (especially student/minor photos).
 * They are never stored in PostgreSQL — the database keeps only the object key
 * in the entity's `photoUrl` column. This interface lets local development write
 * to a private, persistent `server/uploads` directory while production uses a
 * PRIVATE object-storage bucket (currently Supabase native Storage) with
 * authenticated reads.
 *
 * Keys are always tenant-aware and server-generated (see photo.service.ts), so
 * a leaked key can never escape the owning school's namespace.
 */
export interface StoredObject {
  /** Object key as stored in the database (e.g. `photos/<schoolId>/students/<uuid>.jpg`). */
  key: string
  buffer: Buffer
  contentType: string
}

export interface StorageProvider {
  /**
   * Persists a buffer under the given key. Idempotent overwrite is expected for
   * a given unique key (callers use fresh UUID keys, so collisions are rare).
   */
  put(key: string, buffer: Buffer, contentType: string): Promise<void>
  /** Returns the absolute (read) URL of an existing key, or null when absent. */
  getUrl(key: string): Promise<string | null>
  /** Reads the raw bytes + content type for an existing key, or null when absent. */
  get(key: string): Promise<StoredObject | null>
  /** Removes the object at the key. Unknown keys are a no-op (idempotent). */
  remove(key: string): Promise<void>
}

/** Path-token characters never allowed inside a generated key segment. */
export const KEY_PREFIX = "photos"
/** Allowed key segments: alphanumerics, dash, underscore, dot, plus path separators. */
export const KEY_ALLOWED = /^[a-zA-Z0-9/_.-]+$/

/** Raises a 400 for any key that is not a safe, flat path (path-traversal guard). */
export function assertSafeKey(key: string): void {
  if (!key || key.length > 512 || !KEY_ALLOWED.test(key)) {
    throw new Error("Unsafe storage key")
  }
  if (key.includes("..") || key.startsWith("/") || key.startsWith("\\")) {
    throw new Error("Unsafe storage key")
  }
}
