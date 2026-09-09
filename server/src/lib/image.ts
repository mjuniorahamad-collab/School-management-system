/**
 * Server-side image validation + optimization for profile photos.
 *
 * Security rules (AGENTS.md §12 / §25):
 *  - The client Content-Type and filename are NEVER trusted. Actual image bytes
 *    are inspected with Sharp's decoder (magic-byte sniffing) so a file that
 *    merely claims to be a JPEG/PNG/WebP is rejected.
 *  - Only JPEG, PNG and WebP are accepted.
 *  - Maximum dimensions are enforced and images are downscaled.
 *  - EXIF/metadata is stripped by re-encoding (Sharp drops metadata unless
 *    `.withMetadata()` is explicitly requested), which also removes embedded
 *    GPS/location data from sensitive personal photos.
 */

export const ALLOWED_IMAGE_FORMATS = ["jpeg", "png", "webp"] as const
export type AllowedImageFormat = (typeof ALLOWED_IMAGE_FORMATS)[number]

export const ALLOWED_MIME_TYPES: Record<AllowedImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

const FORMAT_EXTENSION: Record<AllowedImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
}

/** Output images are capped at this bounding box (fit=inside, no enlargement). */
export const MAX_PHOTO_DIMENSION = 800
/** Output JPEG/WebP quality. */
export const PHOTO_QUALITY = 86

export interface ProcessedImage {
  /** Optimized, EXIF-stripped image bytes ready for storage. */
  buffer: Buffer
  /** Normalized MIME type guaranteed to be in ALLOWED_MIME_TYPES. */
  contentType: string
  /** Stable file extension derived from the detected format (server-generated). */
  extension: string
  width: number
  height: number
}

/**
 * Validates the raw upload bytes and returns an optimized copy. Throws an
 * `ApiError` (via the caller) when the bytes are not a supported raster image.
 * The decoded format is re-detected from the buffer, never from the request.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const sharp = (await import("sharp")).default

  let format: AllowedImageFormat | undefined
  try {
    const metadata = await sharp(buffer).metadata()
    const detected = metadata.format as string | undefined
    format = ALLOWED_IMAGE_FORMATS.find((candidate) => candidate === detected)
  } catch {
    throw new UnsafeImageError("The uploaded file is not a valid JPEG, PNG or WebP image")
  }

  if (!format) {
    throw new UnsafeImageError("Only JPEG, PNG and WebP images are supported")
  }

  const contentType = ALLOWED_MIME_TYPES[format]
  const extension = FORMAT_EXTENSION[format]

  const output = await sharp(buffer)
    .rotate() // honor EXIF orientation before metadata is stripped
    .resize({
      width: MAX_PHOTO_DIMENSION,
      height: MAX_PHOTO_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })

  if (format === "jpeg") {
    output.jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
  } else if (format === "webp") {
    output.webp({ quality: PHOTO_QUALITY })
  } else {
    output.png({ compressionLevel: 9, palette: true })
  }

  const resultBuffer = await output.toBuffer({ resolveWithObject: true })

  return {
    buffer: resultBuffer.data,
    contentType,
    extension,
    width: resultBuffer.info.width,
    height: resultBuffer.info.height,
  }
}

/** Signals that uploaded bytes were rejected on image-content grounds (400). */
export class UnsafeImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeImageError"
  }
}
