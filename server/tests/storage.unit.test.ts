import { beforeEach, describe, expect, it, vi } from "vitest"
import { S3StorageProvider } from "../src/lib/storage/s3.js"
import { ApiError, STORAGE_ERROR } from "../src/lib/ApiError.js"

interface FakeBody {
  transformToByteArray: () => Promise<Uint8Array>
}

function makeProvider(send: () => Promise<unknown>): S3StorageProvider {
  const provider = new S3StorageProvider({
    endpoint: "https://storage.example.test",
    region: "us-east-1",
    bucket: "sms-photos",
    accessKeyId: "AKID",
    secretAccessKey: "super-secret-key",
    forcePathStyle: true,
  })
  // Inject a fake SDK instead of loading @aws-sdk/client-s3 (private member).
  ;(provider as unknown as { sdk: unknown }).sdk = {
    client: { send },
    PutObjectCommand: class {},
    GetObjectCommand: class {},
    DeleteObjectCommand: class {},
  }
  return provider
}

describe("S3StorageProvider error mapping", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  it("maps a put failure to a secret-free STORAGE_ERROR ApiError", async () => {
    const provider = makeProvider(async () => {
      throw new Error("SignatureDoesNotMatch: the request signature we calculated does not match")
    })
    await expect(provider.put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg")).rejects.toBeInstanceOf(ApiError)
    await expect(
      provider.put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg"),
    ).rejects.toMatchObject({ code: STORAGE_ERROR, statusCode: 502 })
    await expect(
      provider.put("photos/s1/x.jpg", Buffer.from("x"), "image/jpeg"),
    ).rejects.toThrow(/Could not store the object in storage/)
  })

  it("never leaks the raw error or credentials to the client surface", async () => {
    const provider = makeProvider(async () => {
      throw new Error("InvalidAccessKeyId: super-secret-key rejected")
    })
    const error = await provider
      .get("photos/s1/y.png")
      .then(() => null)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    const message = (error as Error).message
    expect(message).not.toContain("super-secret-key")
    expect(message).not.toContain("rejected")
  })

  it("maps retrieve failures", async () => {
    const provider = makeProvider(async () => {
      throw new Error("NoSuchBucket")
    })
    await expect(provider.get("photos/s1/z.jpg")).rejects.toThrow(/Could not retrieve the object in storage/)
  })

  it("maps remove failures", async () => {
    const provider = makeProvider(async () => {
      throw new Error("403 Forbidden")
    })
    await expect(provider.remove("photos/s1/z.jpg")).rejects.toThrow(/Could not remove the object in storage/)
  })

  it("returns the object on a successful get", async () => {
    const body: FakeBody = { transformToByteArray: async () => new Uint8Array([1, 2, 3]) }
    const provider = makeProvider(async () => ({ Body: body, ContentType: "image/webp" }))
    const object = await provider.get("photos/s1/ok.webp")
    expect(object?.contentType).toBe("image/webp")
    expect(Buffer.from(object!.buffer).toString()).toBe("\x01\x02\x03")
  })

  it("returns null when the object body is absent", async () => {
    const provider = makeProvider(async () => ({}))
    expect(await provider.get("photos/s1/missing.webp")).toBeNull()
  })
})