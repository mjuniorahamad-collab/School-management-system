import type { Server } from "node:http"
import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { disconnectDatabase } from "./lib/database.js"
import { logError, logInfo } from "./lib/logger.js"

// In the single-container production deployment the same process serves both the
// built frontend (`dist/`) and the API. `createApp` checks the directory exists
// and skips serving otherwise, so a server-only build still boots cleanly.
const app = createApp({ serveFrontend: env.isProduction })

const server: Server = app.listen(env.port, () => {
  logInfo(`listening on http://localhost:${env.port}${env.apiPrefix} (${env.nodeEnv})`)
})

let shuttingDown = false

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return
  shuttingDown = true
  logInfo(`${signal} received — shutting down gracefully`)

  const forceExitTimer = setTimeout(() => {
    logError(new Error("Graceful shutdown timed out after 10s — forcing exit"))
    process.exit(1)
  }, 10_000)
  forceExitTimer.unref()

  server.close((error?: Error) => {
    disconnectDatabase()
      .catch((disconnectError: unknown) => logError(disconnectError))
      .finally(() => process.exit(error ? 1 : 0))
  })
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)