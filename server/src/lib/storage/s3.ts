import { assertSafeKey, type StoredObject, type StorageProvider } from "./storage.js"

export interface S3StorageConfig {
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

interface GetObjectOutputLike {
  Body?: { transformToByteArray: () => Promise<Uint8Array> }
  ContentType?: string
}

interface Sendable {
  send(command: unknown): Promise<GetObjectOutputLike>
}

/** Constructor types of the three commands we use. */
type CommandCtor = new (input: Record<string, unknown>) => unknown

interface Sdk {
  client: Sendable
  PutObjectCommand: CommandCtor
  GetObjectCommand: CommandCtor
  DeleteObjectCommand: CommandCtor
}

/**
 * S3-compatible object storage provider (works with Cloudflare R2 and any other
 * S3 endpoint). Buckets must be PRIVATE — photos are read back through the
 * authenticated photo routes, which fetch the object server-side rather than
 * exposing public-read URLs.
 *
 * The AWS SDK is imported lazily so this provider can stay bundled even when
 * the app runs in local mode without S3 credentials present.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly config: S3StorageConfig
  private sdk: Sdk | undefined

  constructor(config: S3StorageConfig) {
    this.config = config
  }

  private async load(): Promise<Sdk> {
    if (!this.sdk) {
      const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
        await import("@aws-sdk/client-s3")
      const client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        forcePathStyle: this.config.forcePathStyle,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      }) as unknown as Sendable
      this.sdk = {
        client,
        PutObjectCommand: PutObjectCommand as unknown as CommandCtor,
        GetObjectCommand: GetObjectCommand as unknown as CommandCtor,
        DeleteObjectCommand: DeleteObjectCommand as unknown as CommandCtor,
      }
    }
    return this.sdk
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key)
    const sdk = await this.load()
    await sdk.client.send(
      new sdk.PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    )
  }

  async getUrl(key: string): Promise<string | null> {
    assertSafeKey(key)
    return key
  }

  async get(key: string): Promise<StoredObject | null> {
    assertSafeKey(key)
    const sdk = await this.load()
    const result = await sdk.client.send(
      new sdk.GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    )
    if (result.Body === undefined) return null
    const buffer = Buffer.from(await result.Body.transformToByteArray())
    return {
      key,
      buffer,
      contentType: result.ContentType ?? "application/octet-stream",
    }
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key)
    const sdk = await this.load()
    await sdk.client.send(
      new sdk.DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    )
  }
}