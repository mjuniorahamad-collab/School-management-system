import { assertSafeKey, type StoredObject, type StorageProvider } from "./storage.js"
import { ApiError, storageError } from "../ApiError.js"
import { logError } from "../logger.js"

export interface SupabaseStorageConfig {
  /** Full Storage API base URL, e.g. `https://<project-ref>.supabase.co/storage/v1`. */
  storageUrl: string
  /** Server-side secret (service_role / storage-scoped JWT). Never exposed to clients. */
  serviceRoleKey: string
  /** Name of the PRIVATE bucket that holds profile photos. */
  bucket: string
}

/** Minimal structural view of the SDK's error objects (StorageError / StorageApiError). */
interface StorageErrorLike {
  message?: string
  code?: string
  status?: number | string
  statusCode?: number | string
}

interface StorageFileApiLike {
  upload(
    path: string,
    body: Buffer,
    options: { contentType: string },
  ): Promise<{ data: unknown; error: StorageErrorLike | null }>
  download(path: string): Promise<{ data: Blob | null; error: StorageErrorLike | null }>
  remove(paths: string[]): Promise<{ data: unknown; error: StorageErrorLike | null }>
}

interface SupabaseStorageClientLike {
  from(bucket: string): StorageFileApiLike
}

function isNotFound(error: StorageErrorLike): boolean {
  const code = error.code
  const message = error.message?.toLowerCase() ?? ""
  const status = Number(error.status ?? error.statusCode)
  return (
    code === "NoSuchKey" ||
    code === "NotFound" ||
    code === "ObjectNotFound" ||
    message.includes("not found") ||
    status === 404
  )
}

/**
 * Supabase native Storage provider for profile photos (replaces the S3
 * compatibility endpoint). The bucket MUST stay private — photos are read back
 * through the authenticated photo routes, which download the object server-side
 * with the service_role key rather than exposing a public URL. The key is a
 * server-side secret only: it is read from environment configuration and never
 * shipped to the browser.
 *
 * The storage SDK is imported lazily so this provider can stay bundled even
 * when the app runs in local mode without Supabase credentials present.
 */
export class SupabaseStorageProvider implements StorageProvider {
  private readonly config: SupabaseStorageConfig
  private client: SupabaseStorageClientLike | undefined

  constructor(config: SupabaseStorageConfig) {
    this.config = { ...config, storageUrl: config.storageUrl.replace(/\/+$/, "") }
  }

  private async load(): Promise<SupabaseStorageClientLike> {
    if (!this.client) {
      const { StorageClient } = await import("@supabase/storage-js")
      this.client = new StorageClient(this.config.storageUrl, {
        apikey: this.config.serviceRoleKey,
      }) as unknown as SupabaseStorageClientLike

      // Safe diagnostic: log hostname + pathname only (no key material). This is
      // the exact URL the SDK will build upload requests from, so a wrong value
      // is immediately visible in server logs.
      try {
        const u = new URL(this.config.storageUrl)
        console.log(
          `[storage] Supabase Storage client initialized — host=${u.hostname} path=${u.pathname} bucket=${this.config.bucket}`,
        )
      } catch {
        console.warn(
          `[storage] WARNING: SUPABASE_STORAGE_URL is not a valid URL (received: "${this.config.storageUrl}"). Uploads will fail until it is fixed.`,
        )
      }
    }
    return this.client
  }

  /**
   * Converts raw SDK/storage failures into a client-safe ApiError. Full detail
   * is logged server-side; the client never sees credentials, endpoint internals
   * or stack traces.
   */
  private async mapStorageError(
    action: "connect to" | "store" | "retrieve" | "remove",
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn()
    } catch (error) {
      if (error instanceof ApiError) throw error
      logError(error)
      throw storageError(`Could not ${action} the object in storage`)
    }
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key)
    await this.mapStorageError("connect to", async () => {
      const client = await this.load()
      await this.mapStorageError("store", async () => {
        const { error } = await client.from(this.config.bucket).upload(key, buffer, {
          contentType,
        })
        if (error) throw error
      })
    })
  }

  async getUrl(key: string): Promise<string | null> {
    assertSafeKey(key)
    return key
  }

  async get(key: string): Promise<StoredObject | null> {
    assertSafeKey(key)
    let data: Blob | null | undefined
    await this.mapStorageError("retrieve", async () => {
      const client = await this.load()
      const result = await client.from(this.config.bucket).download(key)
      if (result.error) {
        // A missing object is indistinguishable from "no photo" to callers —
        // return null so the photo route falls back to initials.
        if (isNotFound(result.error)) return
        throw result.error
      }
      data = result.data
    })
    if (!data) return null
    const buffer = Buffer.from(await data.arrayBuffer())
    return {
      key,
      buffer,
      contentType: data.type || "application/octet-stream",
    }
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key)
    await this.mapStorageError("remove", async () => {
      const client = await this.load()
      const { error } = await client.from(this.config.bucket).remove([key])
      // Removing an already-missing object is a no-op (idempotent).
      if (error && !isNotFound(error)) throw error
    })
  }
}