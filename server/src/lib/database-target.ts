const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const LOOPBACK_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"])
const LOOPBACK_IPV6 = new Set(["::1", "0:0:0:0:0:0:0:1"])
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"])
const HOST_LABEL = /^[a-z0-9._-]+$/i
const DATABASE_NAME = /^[a-z0-9_.-]+$/i

export interface DatabaseTarget {
  raw: string
  protocol: "postgres:" | "postgresql:"
  host: string
  port: string
  database: string
  user: string
  socket: boolean
  socketPath: string | null
  pooled: boolean
  displayUrl: string
}

export interface ProductionIdentity {
  host: string
  database: string
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  if (host === "") return false
  if (LOOPBACK_IPV6.has(host)) return true
  if (LOOPBACK_HOSTNAMES.has(host)) return true
  return LOOPBACK_IPV4.test(host)
}

export function isDisposableTestDatabase(dbName: string): boolean {
  return dbName.toLowerCase().includes("test")
}

const SENSITIVE_QUERY_PARAMS = new Set(["password", "sslpassword"])

export function redactSensitiveSearchParams(url: URL): string {
  const params = new URLSearchParams()
  for (const [key, value] of url.searchParams) {
    params.append(key, SENSITIVE_QUERY_PARAMS.has(key.toLowerCase()) ? "***" : value)
  }
  const query = params.toString()
  return query === "" ? "" : `?${query}`
}

export function redactDatabaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "<unparseable database URL>"
  }
  const auth = url.username === "" ? "" : `${url.username}${url.password === "" ? "" : ":***"}@`
  return `${url.protocol}//${auth}${url.host}${url.pathname}${redactSensitiveSearchParams(url)}`
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
}

export function isPooledHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  return host.split(".").some((label) => label.includes("pooler"))
}

export function canonicalizeHost(hostname: string): string {
  const host = normalizeHost(hostname)
  if (host === "") return ""
  if (/^[0-9a-f:]+$/i.test(host)) return host

  if (!host.split(".").every((label) => HOST_LABEL.test(label))) {
    throw new Error(`Unsupported database host "${host}".`)
  }

  if (!isPooledHost(host)) return host

  if (!host.endsWith(".neon.tech")) {
    throw new Error(
      `Unsupported pooled database host "${host}". Only direct endpoints and Neon pooled hosts are accepted.`,
    )
  }

  const labels = host.split(".")
  const first = labels[0] ?? ""
  if (!first.startsWith("ep-") || !first.endsWith("-pooler")) {
    throw new Error(`Ambiguous Neon pooled host "${host}".`)
  }

  const directFirst = first.slice(0, -"-pooler".length)
  if (!directFirst.startsWith("ep-") || directFirst.length <= "ep-".length) {
    throw new Error(`Ambiguous Neon pooled host "${host}".`)
  }

  const canonicalLabels = [directFirst, ...labels.slice(1)]
  if (canonicalLabels.some((label) => label.includes("pooler"))) {
    throw new Error(`Ambiguous Neon pooled host "${host}".`)
  }

  return canonicalLabels.join(".")
}

export function parseDatabaseTarget(raw: string): DatabaseTarget | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) return null

  let database: string
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  } catch {
    return null
  }

  const hostParam = url.searchParams.get("host")
  const socket = url.hostname === "" && hostParam !== null && hostParam.startsWith("/")
  const host = normalizeHost(url.hostname)
  const pooled =
    isPooledHost(host) ||
    ["1", "true", "yes"].includes((url.searchParams.get("pgbouncer") ?? "").trim().toLowerCase())

  return {
    raw,
    protocol: url.protocol as "postgres:" | "postgresql:",
    host,
    port: url.port === "" ? "5432" : url.port,
    database,
    user: decodeURIComponent(url.username),
    socket,
    socketPath: socket ? hostParam : null,
    pooled,
    displayUrl: redactDatabaseUrl(raw),
  }
}

export function assertDirectDatabaseUrl(raw: string, purpose: string): DatabaseTarget {
  const target = parseDatabaseTarget(raw)
  if (target === null) {
    throw new Error(`Refusing ${purpose}: the database URL is not a parseable PostgreSQL connection string.`)
  }
  if (target.database === "") {
    throw new Error(`Refusing ${purpose}: the database URL has no database name (${target.displayUrl}).`)
  }
  if (target.socket) return target

  canonicalizeHost(target.host)
  if (target.pooled) {
    throw new Error(
      `Refusing ${purpose}: the database URL uses a pooled endpoint (${target.displayUrl}). ` +
        "Use the direct, unpooled endpoint instead.",
    )
  }
  if (target.host === "") {
    throw new Error(`Refusing ${purpose}: the database URL has no hostname (${target.displayUrl}).`)
  }
  return target
}

function readRequired(env: Record<string, string | undefined>, key: string): string {
  const raw = env[key]
  const value = raw?.trim() ?? ""
  if (value === "") {
    throw new Error(
      `Refusing to continue: ${key} is required so the target can be distinguished from production.`,
    )
  }
  return value
}

export function readProductionIdentity(
  env: Record<string, string | undefined> = process.env,
): ProductionIdentity {
  const rawHost = readRequired(env, "PRODUCTION_DATABASE_HOST")
  const rawDatabase = readRequired(env, "PRODUCTION_DATABASE_NAME")

  if (rawHost.includes("://") || /[/@?#\s]/.test(rawHost)) {
    throw new Error(
      "Refusing to continue: PRODUCTION_DATABASE_HOST must contain only the production host name, never a URL or credential.",
    )
  }
  const host = canonicalizeHost(rawHost)
  if (host === "" || host.includes(":")) {
    throw new Error("Refusing to continue: PRODUCTION_DATABASE_HOST is not a valid host name.")
  }

  if (!DATABASE_NAME.test(rawDatabase)) {
    throw new Error(
      "Refusing to continue: PRODUCTION_DATABASE_NAME contains unsupported characters.",
    )
  }

  return { host, database: rawDatabase.toLowerCase() }
}

export function isProductionEquivalent(
  target: DatabaseTarget,
  production: ProductionIdentity,
): boolean {
  if (target.socket) return false
  const host = canonicalizeHost(target.host)
  return host === production.host && target.database.toLowerCase() === production.database
}

export function isLocalDatabaseTarget(target: DatabaseTarget): boolean {
  return target.socket || isLoopbackHost(target.host)
}

export function databaseTargetsEquivalent(a: DatabaseTarget, b: DatabaseTarget): boolean {
  if (a.socket || b.socket) {
    return (
      a.socket === b.socket &&
      a.socketPath === b.socketPath &&
      a.database.toLowerCase() === b.database.toLowerCase()
    )
  }
  return (
    canonicalizeHost(a.host) === canonicalizeHost(b.host) &&
    a.port === b.port &&
    a.database.toLowerCase() === b.database.toLowerCase()
  )
}
