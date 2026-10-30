import {
  assertDirectDatabaseUrl,
  canonicalizeHost,
  isLocalDatabaseTarget,
  readProductionIdentity,
} from "./database-target.js"

export interface BootstrapArgs {
  check: boolean
  verify: boolean
  confirmHost: string | null
  confirmPort: string | null
  confirmDatabase: string | null
}

export function parseBootstrapArgs(argv: string[]): BootstrapArgs {
  const parsed: BootstrapArgs = {
    check: false,
    verify: false,
    confirmHost: null,
    confirmPort: null,
    confirmDatabase: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--check") {
      parsed.check = true
      continue
    }
    if (arg === "--verify") {
      parsed.verify = true
      continue
    }
    if (arg === "--confirm-host" || arg === "--confirm-port" || arg === "--confirm-database") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Refusing to bootstrap: ${arg} requires a value.`)
      }
      index += 1
      if (arg === "--confirm-host") parsed.confirmHost = value
      if (arg === "--confirm-port") parsed.confirmPort = value
      if (arg === "--confirm-database") parsed.confirmDatabase = value
      continue
    }
    throw new Error(`Refusing to bootstrap: unsupported argument "${arg}".`)
  }
  if (parsed.check && parsed.verify) {
    throw new Error("Refusing to bootstrap: use either --check or --verify, not both.")
  }
  return parsed
}

export function assertBootstrapTarget(env: NodeJS.ProcessEnv, args: BootstrapArgs): void {
  const raw = env.DATABASE_URL
  if (raw === undefined || raw.trim() === "") {
    throw new Error("Refusing to bootstrap: DATABASE_URL is not set.")
  }
  const target = assertDirectDatabaseUrl(raw, "to bootstrap")

  const host = canonicalizeHost(target.host)
  if (
    args.confirmHost === null ||
    args.confirmPort === null ||
    args.confirmDatabase === null
  ) {
    throw new Error(
      "Refusing to bootstrap: a write requires --confirm-host, --confirm-port and " +
        "--confirm-database with the exact target identity.",
    )
  }
  if (
    args.confirmHost.trim().toLowerCase() !== host ||
    args.confirmPort.trim() !== target.port ||
    args.confirmDatabase.trim().toLowerCase() !== target.database.toLowerCase()
  ) {
    throw new Error("Refusing to bootstrap: the confirmation values do not match the target identity.")
  }

  if (!isLocalDatabaseTarget(target)) {
    readProductionIdentity(env)
  }
}
