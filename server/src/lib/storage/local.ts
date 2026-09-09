import { promises as fs } from "node:fs"
import path from "node:path"
import { assertSafeKey, type StoredObject, type StorageProvider } from "./storage.js"

/**
 * Development / self-hosted storage that writes to a persistent directory on
 * the server's filesystem (default `server/uploads`, overridable via
 * `STORAGE_LOCAL_DIR`). Files are served by the authenticated photo routes, so
 * they are never exposed through any public directory.
 *
 * The uploads directory is intentionally gitignored; back it up alongside the
 * database (see the operations runbook).
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
  }

  private objectPath(key: string): string {
    assertSafeKey(key)
    return path.join(this.rootDir, ...key.split("/"))
  }

  async put(key: string, buffer: Buffer): Promise<void> {
    assertSafeKey(key)
    const absPath = this.objectPath(key)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, buffer)
  }

  async getUrl(key: string): Promise<string | null> {
    return (await this.exists(key)) ? key : null
  }

  async get(key: string): Promise<StoredObject | null> {
    assertSafeKey(key)
    try {
      const buffer = await fs.readFile(this.objectPath(key))
      return { key, buffer, contentType: contentTypeFor(key) }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT") return null
      throw error
    }
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key)
    try {
      await fs.unlink(this.objectPath(key))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT") throw error
    }
  }

  private async exists(key: string): Promise<boolean> {
    assertSafeKey(key)
    try {
      await fs.access(this.objectPath(key))
      return true
    } catch {
      return false
    }
  }
}

function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "webp":
      return "image/webp"
    default:
      return "application/octet-stream"
  }
}
