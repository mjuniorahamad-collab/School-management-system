import { beforeEach, describe, expect, it, vi } from "vitest"
import { SupabaseStorageProvider } from "../src/lib/storage/supabase.js"
import { ApiError, STORAGE_ERROR } from "../src/lib/ApiError.js"

interface StorageErrorLike {
  message?: string
  code?: string
  status?: number
}

interface BucketLike {
  upload: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

function makeProvider(bucket: BucketLike): SupabaseStorageProvider {
  const provider = new SupabaseStorageProvider({
    storageUrl: "https://school.supabase.co/storage/v1",
    serviceRoleKey: "service-role-super-secret",
    bucket: "sms-photos",
  })
  // Inject a fake client instead of loading @supabase/storage-js (private member).
  ;(provider as unknown as { client: unknown }).client = { from: () => bucket }
  return provider
}

function uploadResult(error: StorageErrorLike | null) {
  return { data: error ? null : { path: "x", id: "1", fullPath: "sms-photos/x" }, error }
}

function downloadResult(data: Blob | null, error: StorageErrorLike | null) {
  return { data, error }
}

function removeResult(error: StorageErrorLike | null) {
  return { data: error ? null : [], error }
}

describe("SupabaseStorageProvider error mapping", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  it("maps an upload failure to a secret-free STORAGE_ERROR ApiError", async () => {
    const bucket: BucketLike = {
      upload: vi.fn().mockResolvedValue(uploadResult({ message: "Upload rejected" })),
      download: vi.fn(),
      remove: vi.fn(),
    }
    const provider = makeProvider(bucket)
    await expect(provider.put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg")).rejects.toBeInstanceOf(ApiError)
    await expect(
      provider.put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg"),
    ).rejects.toMatchObject({ code: STORAGE_ERROR, statusCode: 502 })
    await expect(
      provider.put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg"),
    ).rejects.toThrow(/Could not store the object in storage/)
    expect(bucket.upload).toHaveBeenCalledWith(
      "photos/s1/x.jpg",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/jpeg" }),
    )
  })

  it("maps thrown network errors (non-sdk errors) to the client-safe error", async () => {
    const bucket: BucketLike = {
      upload: vi.fn().mockRejectedValue(new Error("ECONNRESET")),
      download: vi.fn(),
      remove: vi.fn(),
    }
    const provider = makeProvider(bucket)
    await expect(provider.put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg")).rejects.toMatchObject({
      code: STORAGE_ERROR,
      statusCode: 502,
    })
  })

  it("never leaks the raw error or credentials to the client surface", async () => {
    const bucket: BucketLike = {
      upload: vi.fn().mockResolvedValue(uploadResult({ message: "service-role-super-secret rejected: expired" })),
      download: vi.fn(),
      remove: vi.fn(),
    }
    const provider = makeProvider(bucket)
    const error = await provider
      .put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg")
      .then(() => null)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    const message = (error as Error).message
    expect(message).not.toContain("service-role-super-secret")
    expect(message).not.toContain("rejected")
    expect(message).not.toContain("expired")
  })

  it("maps retrieve failures", async () => {
    const bucket: BucketLike = {
      upload: vi.fn(),
      download: vi.fn().mockResolvedValue(downloadResult(null, { message: "AccessDenied", code: "AccessDenied", status: 400 })),
      remove: vi.fn(),
    }
    const provider = makeProvider(bucket)
    await expect(provider.get("photos/s1/z.jpg")).rejects.toThrow(/Could not retrieve the object in storage/)
  })

  it("maps remove failures", async () => {
    const bucket: BucketLike = {
      upload: vi.fn(),
      download: vi.fn(),
      remove: vi.fn().mockResolvedValue(removeResult({ message: "403 Forbidden", status: 403 })),
    }
    const provider = makeProvider(bucket)
    await expect(provider.remove("photos/s1/z.jpg")).rejects.toThrow(/Could not remove the object in storage/)
  })

  it("returns the object on a successful download", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" })
    const bucket: BucketLike = {
      upload: vi.fn(),
      download: vi.fn().mockResolvedValue(downloadResult(blob, null)),
      remove: vi.fn(),
    }
    const provider = makeProvider(bucket)
    const object = await provider.get("photos/s1/ok.webp")
    expect(object?.contentType).toBe("image/webp")
    expect(Buffer.from(object!.buffer).toString()).toBe("\x01\x02\x03")
  })

  it("returns null when the object is missing (not found)", async () => {
    const bucket: BucketLike = {
      upload: vi.fn(),
      download: vi.fn().mockResolvedValue(downloadResult(null, { message: "The resource was not found", status: 400 })),
      remove: vi.fn(),
    }
    const provider = makeProvider(bucket)
    expect(await provider.get("photos/s1/missing.webp")).toBeNull()
  })

  it("returns null when the download resolves without data", async () => {
    const bucket: BucketLike = {
      upload: vi.fn(),
      download: vi.fn().mockResolvedValue(downloadResult(null, null)),
      remove: vi.fn(),
    }
    const provider = makeProvider(bucket)
    expect(await provider.get("photos/s1/empty.webp")).toBeNull()
  })

  it("treats removing a missing object as a no-op (idempotent)", async () => {
    const bucket: BucketLike = {
      upload: vi.fn(),
      download: vi.fn(),
      remove: vi.fn().mockResolvedValue(removeResult({ message: "The resource was not found", status: 400 })),
    }
    const provider = makeProvider(bucket)
    await expect(provider.remove("photos/s1/missing.webp")).resolves.toBeUndefined()
  })

  it("reports the key via getUrl like other providers", async () => {
    const provider = makeProvider({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() })
    expect(await provider.getUrl("photos/s1/x.jpg")).toBe("photos/s1/x.jpg")
  })
})