import { existsSync } from "node:fs"
import path from "node:path"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import { env } from "./config/env.js"
import { errorHandler } from "./middleware/errorHandler.js"
import { notFoundHandler } from "./middleware/notFound.js"
import { requestLogger } from "./middleware/requestLogger.js"
import { apiRouter } from "./routes/index.js"
import { validateStorageConfig } from "./lib/storage/index.js"

export interface CreateAppOptions {
  /**
   * Serve the built frontend (repo-root `dist/`) from the API process. Used by
   * the single-container production deployment; the SPA fallback only answers
   * non-`/api` GETs so API 404s keep returning the error envelope.
   */
  serveFrontend?: boolean
}

export function createApp(options: CreateAppOptions = {}): express.Application {
  const app = express()

  app.disable("x-powered-by")
  // A misconfigured Supabase Storage provider (missing URL/key/bucket) must
  // fail at boot — surfacing later as hidden 500s on the first photo upload.
  if (env.storage.provider === "supabase") validateStorageConfig()
  // Behind a reverse proxy (`TRUST_PROXY=true`) trust the nearest hop so
  // `req.ip` (and thus rate limiting) sees the real client, never the proxy.
  if (env.trustProxy) app.set("trust proxy", 1)
  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      // `X-School-Id` carries the active tenant for multi-school users.
      allowedHeaders: ["Content-Type", "Authorization", "X-School-Id"],
      credentials: true,
    }),
  )
  app.use(requestLogger)
  app.use(express.json({ limit: "100kb" }))

  app.use(env.apiPrefix, apiRouter)

  if (options.serveFrontend) {
    // `server/src` under tsx and `server/dist` under node both resolve `../../dist`
    // to the repo-root frontend build.
    const distDir = path.resolve(import.meta.dirname, "../../dist")
    if (existsSync(distDir)) {
      app.use(express.static(distDir))
      // SPA fallback (Express 5 requires a named wildcard).
      app.get("/{*splat}", (req, res, next) => {
        if (req.path.startsWith("/api/")) {
          next()
          return
        }
        res.sendFile(path.join(distDir, "index.html"))
      })
    }
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}