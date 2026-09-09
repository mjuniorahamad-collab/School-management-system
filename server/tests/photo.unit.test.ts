import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { processImage, UnsafeImageError, MAX_PHOTO_DIMENSION } from "../src/lib/image.js"
import { LocalStorageProvider } from "../src/lib/storage/local.js"
import { assertSafeKey, KEY_PREFIX } from "../src/lib/storage/storage.js"
import { buildPhotoKey, type PhotoEntity } from "../src/modules/photos/photo.service.js"

async function makePng(width = 100, height = 100): Promise<Buffer> {
  const sharp = (await import("sharp")).default
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .png()
    .toBuffer()
}

describe("assertSafeKey (database-free)", () => {
  it("rejects empty, oversized, and path-traversal keys", () => {
    expect(() => assertSafeKey("")).toThrow("Unsafe storage key")
    expect(() => assertSafeKey("photos/1/students/..%2Fsecret.txt")).toThrow("Unsafe storage key")
    expect(() => assertSafeKey("/photos/1/students/a.jpg")).toThrow("Unsafe storage key")
    expect(() => assertSafeKey("photos/1/students/..//evil.jpg")).toThrow("Unsafe storage key")
    expect(() => assertSafeKey("a".repeat(513))).toThrow("Unsafe storage key")
  })

  it("accepts well-formed tenant-aware keys", () => {
    expect(() =>
      assertSafeKey("photos/8f1b4c2a/students/6f9a2c11-2f41-4f10-a0ad-d45c8d9c17a3.jpg"),
    ).not.toThrow()
    expect(KEY_PREFIX).toBe("photos")
  })
})

describe("buildPhotoKey (database-free)", () => {
  const entity: PhotoEntity = {
    keyPrefix: "students",
    entityType: "STUDENT",
    getCurrent: async () => null,
    setCurrent: async () => {},
  }

  it("is tenant- and entity-scoped with a server-generated uuid", () => {
    const key = buildPhotoKey("school-1", entity, "jpg")
    expect(key).toMatch(/^photos\/school-1\/students\/[0-9a-f-]{36}\.jpg$/)
  })

  it("produces unique keys across calls", () => {
    const a = buildPhotoKey("school-1", entity, "jpg")
    const b = buildPhotoKey("school-1", entity, "jpg")
    expect(a).not.toBe(b)
  })
})

describe("LocalStorageProvider (database-free)", () => {
  it("round-trips put/get and reports urls only for existing objects", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sms-photo-test-"))
    try {
      const storage = new LocalStorageProvider(root)
      const key = "photos/school-1/students/abc.png"
      const payload = Buffer.from("png-bytes")
      await storage.put(key, payload, "image/png")

      const object = await storage.get(key)
      expect(object).not.toBeNull()
      expect(object?.buffer).toEqual(payload)
      expect(object?.contentType).toBe("image/png")

      expect(await storage.getUrl(key)).toBe(key)
      expect(await storage.getUrl("photos/school-1/students/missing.png")).toBeNull()
      expect(await storage.get("photos/school-1/students/missing.png")).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("removes objects idempotently and derives content-type from the extension", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sms-photo-test-"))
    try {
      const storage = new LocalStorageProvider(root)
      const key = "photos/school-1/teachers/abc.jpg"
      await storage.put(key, Buffer.from("jpg"), "image/jpeg")
      expect((await storage.get(key))?.contentType).toBe("image/jpeg")

      await new Promise((resolve) => setTimeout(resolve, 50))
      await storage.put(
        "photos/school-1/teachers/abc.webp",
        Buffer.from("webp"),
        "image/webp",
      )
      expect((await storage.get("photos/school-1/teachers/abc.webp"))?.contentType).toBe(
        "image/webp",
      )

      await storage.remove(key)
      expect(await storage.get(key)).toBeNull()
      // Removing an already-removed key is a no-op (idempotent).
      await storage.remove(key)
      expect(await storage.get("photos/school-1/teachers/abc.webp")).not.toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("processImage (database-free)", () => {
  it("decodes and re-encodes a valid PNG", async () => {
    const result = await processImage(await makePng(120, 90))
    expect(result.extension).toBe("png")
    expect(result.contentType).toBe("image/png")
    expect(result.width).toBeLessThanOrEqual(MAX_PHOTO_DIMENSION)
    expect(result.height).toBeLessThanOrEqual(MAX_PHOTO_DIMENSION)
  })

  it("downscales oversized images to the max dimension without enlarging small ones", async () => {
    const result = await processImage(await makePng(2400, 800))
    expect(result.width).toBe(MAX_PHOTO_DIMENSION)
    expect(result.height).toBeLessThanOrEqual(MAX_PHOTO_DIMENSION)

    const small = await processImage(await makePng(40, 30))
    expect(small.width).toBe(40)
    expect(small.height).toBe(30)
  })

  it("rejects bytes that are not a supported raster image", async () => {
    await expect(processImage(Buffer.from("not an image at all"))).rejects.toBeInstanceOf(
      UnsafeImageError,
    )
  })
})