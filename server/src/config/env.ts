import { z } from "zod"

// Single root `.env` serves both sides. Best-effort load so the server works
// with `npm run dev:server` from the repo root; CI sets vars directly.
try {
  process.loadEnvFile()
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  if (code !== "ENOENT") throw error
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  SESSION_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // Rate limiting for public auth endpoints (brute-force / CPU-abuse defence).
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(20),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  // Photo storage provider: "local" (default, persistent server/uploads dir) or
  // "s3" (S3-compatible object storage, e.g. Cloudflare R2 — production).
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  // Where local uploads are written relative to the server project root.
  STORAGE_LOCAL_DIR: z.string().min(1).default("uploads"),
  // Maximum accepted profile-photo upload size in megabytes (enforced by the
  // multipart parser before any image processing).
  UPLOAD_MAX_SIZE_MB: z.coerce.number().int().min(1).max(50).default(5),
  // Profile photos are rate limited per-client on the upload/replace routes.
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  UPLOAD_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
  // S3/R2 connection settings. Required when STORAGE_PROVIDER=s3.
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Optional public base URL of an S3/R2 bucket. When set, photo reads use
  // time-limited presigned URLs derived from this endpoint. Keep private.
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  // When set, runs behind a reverse proxy that forwards the real client IP
  // (X-Forwarded-For). Required so rate limiting and request logging see the
  // caller, not the proxy. Defaults to off so dev/test behavior is unchanged.
  TRUST_PROXY: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),
})

const DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://localhost:4173"]

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const summary = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ")
  throw new Error(`Invalid environment configuration — ${summary}`)
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  isProduction: parsed.data.NODE_ENV === "production",
  port: parsed.data.PORT,
  apiPrefix: "/api/v1",
  corsOrigins: parsed.data.CORS_ORIGIN
    ? parsed.data.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_CORS_ORIGINS,
  databaseUrl: parsed.data.DATABASE_URL,
  session: {
    accessTtlMs: parsed.data.SESSION_ACCESS_TTL_MINUTES * 60_000,
    refreshTtlMs: parsed.data.SESSION_REFRESH_TTL_DAYS * 86_400_000,
    cookieSecure: parsed.data.NODE_ENV === "production",
  },
  authRateLimit: {
    max: parsed.data.AUTH_RATE_LIMIT_MAX,
    windowMs: parsed.data.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60_000,
  },
  storage: {
    provider: parsed.data.STORAGE_PROVIDER,
    localDir: parsed.data.STORAGE_LOCAL_DIR,
  },
  upload: {
    maxSizeBytes: parsed.data.UPLOAD_MAX_SIZE_MB * 1024 * 1024,
    rateLimit: {
      max: parsed.data.UPLOAD_RATE_LIMIT_MAX,
      windowMs: parsed.data.UPLOAD_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    },
  },
  s3: {
    endpoint: parsed.data.S3_ENDPOINT,
    region: parsed.data.S3_REGION,
    bucket: parsed.data.S3_BUCKET,
    accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
    forcePathStyle: parsed.data.S3_FORCE_PATH_STYLE === "true",
  },
  trustProxy: parsed.data.TRUST_PROXY,
} as const