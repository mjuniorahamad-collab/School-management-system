import path from "node:path"
import { env } from "../../config/env.js"
import { LocalStorageProvider } from "./local.js"
import { S3StorageProvider } from "./s3.js"
import type { StorageProvider } from "./storage.js"

let instance: StorageProvider | undefined

/**
 * Resolves the configured storage provider. `local` (default) writes to a
 * persistent `server/uploads` directory; `s3` targets an S3-compatible bucket
 * (Cloudflare R2 in production). The provider is resolved once per process.
 */
export function getStorage(): StorageProvider {
  if (!instance) {
    if (env.storage.provider === "s3") {
      const bucket = env.s3.bucket
      const accessKeyId = env.s3.accessKeyId
      const secretAccessKey = env.s3.secretAccessKey
      if (!bucket || !accessKeyId || !secretAccessKey) {
        throw new Error(
          "STORAGE_PROVIDER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
        )
      }
      instance = new S3StorageProvider({
        endpoint: env.s3.endpoint,
        region: env.s3.region,
        bucket,
        accessKeyId,
        secretAccessKey,
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
