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
} as const