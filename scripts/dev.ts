/**
 * Local development orchestrator — single-command startup.
 *
 * Starts PostgreSQL (if not already running) → Backend → Frontend.
 * Ctrl+C terminates child processes and conditionally stops PostgreSQL.
 *
 * No new dependencies. Uses existing `tsx` + Node.js built-ins.
 *
 * Windows note: `pg_ctl start` spawns `postgres.exe` which inherits the
 * stdout/stderr pipe handles, so waiting on pg_ctl's exit blocks forever
 * even after the server is up. We therefore poll `pg_isready` for the real
 * readiness signal and never await pg_ctl's process exit.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

// ── Paths ───────────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, "..")
const PG_DIR = resolve(ROOT, ".data", "postgres")
const PG_BIN = resolve(PG_DIR, "pgsql", "bin")
const PG_CTL = resolve(PG_BIN, "pg_ctl.exe")
const PG_ISREADY = resolve(PG_BIN, "pg_isready.exe")
const PG_DATA = resolve(PG_DIR, "data")
const PG_LOG = resolve(PG_DIR, "pg.log")
const PG_PORT = 5433
const PG_READY_TIMEOUT_MS = 30_000

// ── Prefix colours (ANSI) ──────────────────────────────────────────────────

const PG = "\x1b[34m[postgres]\x1b[0m"
const API = "\x1b[32m[api]\x1b[0m"
const WEB = "\x1b[35m[vite]\x1b[0m"

// ── State ───────────────────────────────────────────────────────────────────

let postgresOwnedByUs = false
let pgCtlProc: ChildProcess | null = null
let backendProc: ChildProcess | null = null
let frontendProc: ChildProcess | null = null
let shuttingDown = false

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(prefix: string, msg: string): void {
  console.log(`${prefix} ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function isPostgresRunning(): boolean {
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

function isPortInUse(port: number): boolean {
  try {
    const result = spawnSync("netstat", ["-ano"], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    })
    const output = result.stdout?.toString() ?? ""
    return output.split("\n").some((line) => line.includes("LISTENING") && line.includes(`:${port}`))
  } catch {
    return false
  }
}

function tailLog(lines: number): string {
  try {
    const content = readFileSync(PG_LOG, "utf8")
    const tail = content.trim().split("\n").slice(-lines)
    return tail.join("\n")
  } catch {
    return ""
  }
}

// ── PostgreSQL ──────────────────────────────────────────────────────────────

async function startPostgres(): Promise<void> {
  if (isPostgresRunning()) {
    log(PG, `already running on port ${PG_PORT} — reusing`)
    postgresOwnedByUs = false
    return
  }

  log(PG, "starting...")

  if (!existsSync(PG_CTL)) {
    log(PG, `pg_ctl not found at ${PG_CTL}`)
    process.exit(1)
  }

  // Fire-and-forget: do NOT wait for pg_ctl to exit (it hangs on Windows
  // while postgres.exe inherits its pipe handles). Readiness is detected by
  // polling pg_isready below.
  const proc = spawn(
    PG_CTL,
    ["-D", PG_DATA, "-l", PG_LOG, "start", "-o", `-p ${PG_PORT}`],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  )
  pgCtlProc = proc

  let pgCtlStderr = ""
  proc.stderr?.on("data", (data: Buffer) => {
    pgCtlStderr += data.toString()
  })

  proc.on("exit", (code) => {
    if (code !== 0 && !shuttingDown) {
      log(PG, `pg_ctl exited early (code ${code}) — ${pgCtlStderr.trim() || "see pg.log"}`)
    }
    if (pgCtlProc === proc) pgCtlProc = null
  })

  postgresOwnedByUs = true
  log(PG, "waiting for connections...")

  const deadline = Date.now() + PG_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    // If pg_ctl failed outright (bad data dir, port conflict), abort quickly.
    if (proc.exitCode !== null && proc.exitCode !== 0) {
      log(PG, `failed to start — ${pgCtlStderr.trim() || "see pg.log"}`)
      process.exit(1)
    }
    if (isPostgresRunning()) {
      log(PG, `ready on port ${PG_PORT}`)
      return
    }
    await sleep(500)
  }

  log(PG, "timed out waiting for PostgreSQL to become ready")
  const logTail = tailLog(15)
  if (logTail) log(PG, `recent pg.log:\n${logTail}`)
  process.exit(1)
}

// ── Backend ─────────────────────────────────────────────────────────────────

function startBackend(): ChildProcess | null {
  if (isPortInUse(4000)) {
    log(API, "port 4000 already in use — skipping (assuming backend is running)")
    return null
  }

  log(API, "starting...")

  const proc = spawn("npm run dev:server", {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  })

  proc.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(API, line)
    }
  })

  proc.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(API, line)
    }
  })

  proc.on("error", (err) => {
    log(API, `spawn error: ${err.message}`)
  })

  proc.on("exit", (code) => {
    if (!shuttingDown) {
      log(API, code === 0 ? "stopped" : `exited with code ${code}`)
    }
  })

  return proc
}

// ── Frontend ────────────────────────────────────────────────────────────────

function startFrontend(): ChildProcess | null {
  log(WEB, "starting...")

  const proc = spawn("npm run dev:vite", {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  })

  proc.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(WEB, line)
    }
  })

  proc.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(WEB, line)
    }
  })

  proc.on("error", (err) => {
    log(WEB, `spawn error: ${err.message}`)
  })

  proc.on("exit", (code) => {
    if (!shuttingDown) {
      log(WEB, code === 0 ? "stopped" : `exited with code ${code}`)
    }
  })

  return proc
}

// ── Shutdown ────────────────────────────────────────────────────────────────

function killProcessTree(proc: ChildProcess | null, label: string): void {
  if (!proc || proc.pid === undefined || proc.exitCode !== null) return

  log(label, "stopping...")

  // On Windows, killing just the wrapper process (cmd → npm → tsx → node)
  // leaves grandchildren alive. taskkill /T nukes the whole tree.
  try {
    spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    })
  } catch {
    try {
      proc.kill("SIGTERM")
    } catch {
      // already exited
    }
  }
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  console.log("")
  log(PG, "shutting down...")

  killProcessTree(frontendProc, WEB)
  killProcessTree(backendProc, API)

  if (pgCtlProc && pgCtlProc.exitCode === null) {
    try {
      spawnSync("taskkill", ["/PID", String(pgCtlProc.pid), "/F"], {
        stdio: "ignore",
        windowsHide: true,
      })
    } catch {
      // already gone
    }
  }

  if (postgresOwnedByUs && isPostgresRunning()) {
    log(PG, "stopping (was started by this script)...")
    try {
      const result = spawnSync(PG_CTL, ["-D", PG_DATA, "stop", "-m", "fast"], {
        stdio: "ignore",
        timeout: 30_000,
        windowsHide: true,
      })
      if (result.status === 0) {
        log(PG, "stopped")
      } else {
        log(PG, "stop reported a problem — you may need to stop manually")
      }
    } catch {
      log(PG, "stop failed — you may need to stop manually")
    }
  } else if (!postgresOwnedByUs) {
    log(PG, "leaving running (was not started by this script)")
  }

  process.exit(0)
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("")
  log(PG, "━━━ School Management System — dev startup ━━━")
  console.log("")

  // 1. PostgreSQL
  await startPostgres()
  console.log("")

  // 2. Backend
  backendProc = startBackend()

  // 3. Frontend (with slight delay for backend init)
  await sleep(1500)
  frontendProc = startFrontend()
}

main().catch((error: unknown) => {
  console.error("")
  console.error(`[dev] fatal: ${error instanceof Error ? error.message : String(error)}`)
  void shutdown()
})