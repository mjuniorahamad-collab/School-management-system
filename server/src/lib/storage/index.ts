import path from "node:path"
import { env } from "../../config/env.js"
import { LocalStorageProvider } from "./local.js"
import { S3StorageProvider } from "./s3.js"
import type { StorageProvider } from "./storage.js"

let instance: StorageProvider | undefined

/**
 * Raises a clear configuration error when `STORAGE_PROVIDER=s3` but required
 * connection settings are missing. Called at boot so a misconfigured production
 * container fails on startup instead of silently failing on the first photo
 * upload (which hid behind a generic 500 for this exact reason).
 */
export function validateStorageConfig(): void {
  if (env.storage.provider !== "s3") return
  const { bucket, accessKeyId, secretAccessKey, endpoint } = env.s3
  const missing: string[] = []
  if (!bucket) missing.push("S3_BUCKET")
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID")
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY")
  if (!endpoint) missing.push("S3_ENDPOINT")
  if (missing.length === 0) return
  throw new Error(
    `STORAGE_PROVIDER=s3 is set but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing. ` +
      "S3-compatible providers (Cloudflare R2, Supabase Storage) require an explicit S3_ENDPOINT.",
  )
}

/**
 * Resolves the configured storage provider. `local` (default) writes to a
 * persistent `server/uploads` directory; `s3` targets an S3-compatible bucket
 * (Cloudflare R2 or Supabase Storage in production). The provider is resolved
 * once per process.
 */
export function getStorage(): StorageProvider {
  if (!instance) {
    validateStorageConfig()
    if (env.storage.provider === "s3") {
      instance = new S3StorageProvider({
        endpoint: env.s3.endpoint,
        region: env.s3.region,
        bucket: env.s3.bucket!,
        accessKeyId: env.s3.accessKeyId!,
        secretAccessKey: env.s3.secretAccessKey!,
        forcePathStyle: env.s3.forcePathStyle,
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
export { S3StorageProvider, type S3StorageConfig } from "./s3.js"
export { KEY_PREFIX, assertSafeKey } from "./storage.js"
