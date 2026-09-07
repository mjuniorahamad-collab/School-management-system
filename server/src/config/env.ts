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
  trustProxy: parsed.data.TRUST_PROXY,
} as const