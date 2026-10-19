// Canonical snapshot serialization and hashing for the Annual Report Card
// (docs/report-card.md §8a).
//
// The frozen snapshot is hashed with a deterministic serialization: object keys
// are sorted recursively, arrays keep their (already deterministically ordered)
// order, and every value is either a JSON primitive or an explicit null. The
// caller is responsible for projecting DECIMAL values to canonical strings
// before hashing — this module never sees a binary float.
//
// Mutable workflow / PDF-artifact metadata (version status, timestamps,
// uploader/confirmer identity, storage key, file checksum) is deliberately NOT
// part of the payload the service passes here, so it can never affect the hash.

import { createHash } from "node:crypto"

/** Recursively orders object keys so serialization is stable. */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>
    const ordered: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      ordered[key] = sortValue(record[key])
    }
    return ordered
  }
  return value
}

/** Serializes a value to canonical JSON text (stable key order). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

/** `snapshotHash = sha256(canonical_payload)` — hex encoded. */
export function hashSnapshot(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex")
}
