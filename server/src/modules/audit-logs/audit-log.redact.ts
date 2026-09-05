/**
 * Pure redaction + diff helpers for the audit log.
 *
 * The audit trail must never become a data-leak vector: passwords, password
 * hashes, session/refresh tokens (and their hashes), cookies, API keys, card /
 * payment secrets and idempotency keys are stripped from every recorded diff
 * and metadata. Field matching is normalize-then-exact (lowercased, non
 * alphanumerics removed) so a key like "accessTokenHash" is matched precisely
 * without risky substring matching on short words like "token".
 */

const SENSITIVE_KEYS = new Set<string>([
  "password",
  "passwordhash",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "accesstoken",
  "refreshtoken",
  "accesstokenhash",
  "refreshtokenhash",
  "sessiontoken",
  "sessioncookie",
  "cookie",
  "cookies",
  "apikey",
  "api_key",
  "apisecret",
  "clientsecret",
  "clientid",
  "secret",
  "cvv",
  "cvc",
  "cardnumber",
  "expirymonth",
  "expiryyear",
  "pan",
  "pin",
  "mfacode",
  "otp",
  "totp",
  "idempotencykey",
])

const REDACTED_PLACEHOLDER = "[REDACTED]"

const MAX_STRING_LENGTH = 4_000
const MAX_DIFF_FIELD_COUNT = 40

/** Normalizes a field key for exact denylist matching. */
export function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Whether the given field key must never appear in the audit trail. */
export function isSensitiveField(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeFieldKey(key))
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}…`
}

function clonePlainValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => (isPlainObject(entry) ? redactObject(entry as Record<string, unknown>) : entry))
  }
  return value
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Deep-copies an object replacing any sensitive field with "[REDACTED]" and
 * truncating over-long strings so a malformed call can never bloat the trail.
 * Non-object leaves are returned unchanged; the result is JSON-safe.
 */
export function redactObject(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (isSensitiveField(key)) {
      out[key] = REDACTED_PLACEHOLDER
      continue
    }
    if (typeof value === "string") {
      out[key] = truncateString(value)
    } else if (Array.isArray(value)) {
      out[key] = clonePlainValue(value)
    } else if (isPlainObject(value)) {
      out[key] = redactObject(value)
    } else {
      out[key] = value
    }
  }
  return out
}

export interface DiffFieldEntry {
  field: string
  before?: unknown
  after?: unknown
}

export interface AuditDiff {
  fields: DiffFieldEntry[]
}

function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

function serializeChangedValue(value: unknown): unknown {
  if (typeof value === "string") return truncateString(value)
  if (isPlainObject(value)) return redactObject(value)
  if (Array.isArray(value)) return clonePlainValue(value)
  return value
}

/**
 * Builds the bounded, redacted before/after diff between two flat or nested
 * records. Only fields that actually changed (and are not sensitive) are
 * included; at most MAX_DIFF_FIELD_COUNT entries are retained so a bulk
 * mutation can never exceed a bounded payload.
 */
export function buildRedactedDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditDiff | null {
  const fields: DiffFieldEntry[] = []
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ])

  for (const key of keys) {
    if (isSensitiveField(key)) continue
    const beforeValue = before?.[key]
    const afterValue = after?.[key]
    if (deepEquals(beforeValue, afterValue)) continue
    if (fields.length >= MAX_DIFF_FIELD_COUNT) break

    fields.push({
      field: key,
      ...(beforeValue !== undefined ? { before: serializeChangedValue(beforeValue) } : {}),
      ...(afterValue !== undefined ? { after: serializeChangedValue(afterValue) } : {}),
    })
  }

  if (fields.length === 0) return null
  return { fields }
}

/** One-length summary placeholder for an ignored/skipped value in metadata. */
export const redacted = REDACTED_PLACEHOLDER

/**
 * Write-time sanitizer applied by `recordAudit` so a buggy instrumentation
 * site can never persist a secret. Re-checks the entry field names, redacts
 * nested values and truncates over-long strings.
 */
export function sanitizeDiffForWrite(diff: AuditDiff | null | undefined): AuditDiff | null {
  if (!diff || !Array.isArray(diff.fields)) return null
  const fields: DiffFieldEntry[] = []
  for (const entry of diff.fields) {
    if (fields.length >= MAX_DIFF_FIELD_COUNT) break
    if (isSensitiveField(entry.field)) continue
    fields.push({
      field: entry.field,
      ...(entry.before !== undefined ? { before: serializeChangedValue(entry.before) } : {}),
      ...(entry.after !== undefined ? { after: serializeChangedValue(entry.after) } : {}),
    })
  }
  if (fields.length === 0) return null
  return { fields }
}