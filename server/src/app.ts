import cors from "cors"
import express from "express"
import helmet from "helmet"
import { env } from "./config/env.js"
import { errorHandler } from "./middleware/errorHandler.js"
import { notFoundHandler } from "./middleware/notFound.js"
import { requestLogger } from "./middleware/requestLogger.js"
import { apiRouter } from "./routes/index.js"

export function createApp(): express.Application {
  const app = express()

  app.disable("x-powered-by")
  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  app.use(requestLogger)
  app.use(express.json({ limit: "100kb" }))

  app.use(env.apiPrefix, apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}