/**
 * Start/stop the local, non-synced PostgreSQL cluster (see pg-local-paths.ts).
 *
 * Replaces the old `db:local:start` / `db:local:stop` npm scripts, whose quoted
 * `.data/postgres/...` paths failed under cmd.exe on Windows.
 *
 * Usage:
 *   npm run db:local:start
 *   npm run db:local:stop
 */

import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { PG_CTL, PG_DATA, PG_ISREADY, PG_LOG, PG_PORT } from "./pg-local-paths.js"

const READY_TIMEOUT_MS = 30_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

export function isPostgresRunning(): boolean {
  try {
    const result = spawnSync(PG_ISREADY, ["-p", String(PG_PORT), "-q"], {
      stdio: "ignore",
      windowsHide: true,
    })
    return result.status === 0
  } catch {
    return false
  }
}

async function start(): Promise<void> {
  if (isPostgresRunning()) {
    console.log(`[postgres] already running on port ${PG_PORT} — reusing`)
    return
  }

  if (!existsSync(PG_CTL)) {
    console.error(`[postgres] pg_ctl not found at ${PG_CTL}`)
    process.exit(1)
  }

  console.log("[postgres] starting...")

  // Fire-and-forget: `pg_ctl start` spawns postgres.exe, which inherits the
  // stdout/stderr pipe handles, so awaiting pg_ctl's exit hangs on Windows.
  // Poll pg_isready for the real readiness signal instead.
  const proc = spawn(PG_CTL, ["-D", PG_DATA, "-l", PG_LOG, "start", "-o", `-p ${PG_PORT}`], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  })

  let stderr = ""
  proc.stderr?.on("data", (data: Buffer) => {
    stderr += data.toString()
  })

  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (proc.exitCode !== null && proc.exitCode !== 0) {
      console.error(`[postgres] failed to start — ${stderr.trim() || "see pg.log"}`)
      process.exit(1)
    }
    if (isPostgresRunning()) {
      console.log(`[postgres] ready on port ${PG_PORT}`)
      return
    }
    await sleep(500)
  }

  console.error("[postgres] timed out waiting for PostgreSQL to become ready")
  process.exit(1)
}

function stop(): void {
  if (!isPostgresRunning()) {
    console.log(`[postgres] not running on port ${PG_PORT}`)
    return
  }

  const result = spawnSync(PG_CTL, ["-D", PG_DATA, "stop", "-m", "fast"], {
    stdio: "ignore",
    timeout: 30_000,
    windowsHide: true,
  })

  if (result.status === 0) {
    console.log("[postgres] stopped")
    return
  }

  console.error("[postgres] stop reported a problem — you may need to stop manually")
  process.exit(1)
}

const command = process.argv[2]
if (command === "start") {
  void start()
} else if (command === "stop") {
  stop()
} else {
  console.error("usage: pg-local.ts <start|stop>")
  process.exit(1)
}
