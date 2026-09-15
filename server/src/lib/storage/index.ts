import path from "node:path"
import { env } from "../../config/env.js"
import { LocalStorageProvider } from "./local.js"
import { SupabaseStorageProvider } from "./supabase.js"
import type { StorageProvider } from "./storage.js"

let instance: StorageProvider | undefined

/**
 * Raises a clear configuration error when `STORAGE_PROVIDER=supabase` but
 * required connection settings are missing. Called at boot so a misconfigured
 * production container fails on startup instead of silently failing on the
 * first photo upload.
 */
export function validateStorageConfig(): void {
  if (env.storage.provider !== "supabase") return
  const { storageUrl, serviceRoleKey, bucket } = env.supabase
  const missing: string[] = []
  if (!storageUrl) missing.push("SUPABASE_STORAGE_URL")
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY")
  if (!bucket) missing.push("SUPABASE_BUCKET")
  if (missing.length === 0) {
    // The native Storage SDK builds upload URLs as
    // `${SUPABASE_STORAGE_URL}/object/<bucket>/<key>`. A base URL without the
    // `/storage/v1` suffix hits the platform gateway with an unmatched path and
    // fails with 404 "requested path is invalid". Warn loudly at boot so a
    // misconfigured value is caught before the first failed upload.
    try {
      const u = new URL(storageUrl!)
      if (!u.pathname.endsWith("/storage/v1")) {
        console.warn(
          `[storage] WARNING: SUPABASE_STORAGE_URL does not end with /storage/v1 (resolved to ${u.hostname}${u.pathname}). ` +
            "Uploads will fail with 404 'requested path is invalid'. " +
            "Fix: set SUPABASE_STORAGE_URL=https://<project-ref>.supabase.co/storage/v1",
        )
      }
    } catch {
      console.warn(
        `[storage] WARNING: SUPABASE_STORAGE_URL is not a valid URL ("${storageUrl}"). Uploads will fail until it is fixed.`,
      )
    }
    return
  }
  throw new Error(
    `STORAGE_PROVIDER=supabase is set but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing. ` +
      "Supabase native Storage requires SUPABASE_STORAGE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_BUCKET.",
  )
}

/**
 * Resolves the configured storage provider. `local` (default) writes to a
 * persistent `server/uploads` directory; `supabase` targets a PRIVATE Supabase
 * Storage bucket via the native Storage API (server-side service_role key). The
 * provider is resolved once per process.
 */
export function getStorage(): StorageProvider {
  if (!instance) {
    validateStorageConfig()
    if (env.storage.provider === "supabase") {
      instance = new SupabaseStorageProvider({
        storageUrl: env.supabase.storageUrl!,
        serviceRoleKey: env.supabase.serviceRoleKey!,
        bucket: env.supabase.bucket!,
      })
    } else {
      // `server/src/lib/...` under tsx resolves to the server project root,
      // and `server/dist/lib/...` under node builds to `server/dist`. Both land
      // on a stable `<server>/uploads` directory.
      const rootDir = path.resolve(import.meta.dirname, "../../../", env.storage.localDir)
      instance = new LocalStorageProvider(rootDir)
    }
  }
  return instance
}

export type { StorageProvider, StoredObject } from "./storage.js"
export { LocalStorageProvider } from "./local.js"
export { SupabaseStorageProvider, type SupabaseStorageConfig } from "./supabase.js"
export { KEY_PREFIX, assertSafeKey } from "./storage.js"
