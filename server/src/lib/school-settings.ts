import type { Prisma } from "@prisma/client"

// Canonical, typed access to individual `SchoolSetting` rows.
//
// `SchoolSetting` is a generic `(schoolId, key, value)` key/value store. Most
// keys are read through the settings module (which merges defaults over rows and
// serves the whole `SchoolSettings` object to the UI). A key that must ALSO be
// read from inside another module's business transaction — where importing the
// settings service would couple two modules and pull in a second query plus a
// "school not found" throw — is read through this file instead.
//
// This module deliberately owns no defaults of its own beyond the policy values
// it introduces: the settings module imports these same constants so the key
// name, the value set, and the default can never drift between the two readers.

// ────────────────────────────────────────────────────────────────────────────
// Fee concession self-approval policy
// ────────────────────────────────────────────────────────────────────────────

/**
 * School-scoped policy for whether a concession requester may approve their own
 * request. Exactly two states, because independent approval is ALWAYS possible:
 * `SELF_APPROVAL_ALLOWED` therefore already means "both".
 *
 * Deliberately NOT part of the permission catalog: this is a business rule, not
 * a capability. It only relaxes the self-approval guard for actors who already
 * hold `concessions:approve`.
 *
 * - `INDEPENDENT_APPROVAL_REQUIRED` — segregation of duties. A requester may
 *   never approve their own concession, whoever they are (SUPER_ADMIN included).
 *   This is the default so every existing school keeps today's behavior.
 * - `SELF_APPROVAL_ALLOWED` — the requester may approve their own request, but
 *   must supply an approval reason so the audit trail records a decision
 *   rationale. Does NOT enable `concessions:override`, which stays a distinct,
 *   SUPER_ADMIN-only action that may never act on the actor's own request.
 */
export const CONCESSION_SELF_APPROVAL_VALUES = [
  "INDEPENDENT_APPROVAL_REQUIRED",
  "SELF_APPROVAL_ALLOWED",
] as const

export type ConcessionSelfApprovalPolicy = (typeof CONCESSION_SELF_APPROVAL_VALUES)[number]

export const CONCESSION_SELF_APPROVAL_SETTING_KEY = "feeConcessionSelfApproval"

/**
 * Safe default. Absence of the row means the independent-approval rule, so a
 * newly created school and every pre-existing school behave identically to the
 * pre-policy world with no backfill.
 */
export const DEFAULT_CONCESSION_SELF_APPROVAL: ConcessionSelfApprovalPolicy = "INDEPENDENT_APPROVAL_REQUIRED"

/**
 * Parses a stored `SchoolSetting` value into a policy. Fails SAFE: anything
 * unrecognized (missing row, empty string, hand-edited or corrupt value) resolves
 * to the restrictive default rather than opening self-approval.
 */
export function parseConcessionSelfApproval(raw: string | null | undefined): ConcessionSelfApprovalPolicy {
  if (raw === CONCESSION_SELF_APPROVAL_VALUES[0]) return CONCESSION_SELF_APPROVAL_VALUES[0]
  if (raw === CONCESSION_SELF_APPROVAL_VALUES[1]) return CONCESSION_SELF_APPROVAL_VALUES[1]
  return DEFAULT_CONCESSION_SELF_APPROVAL
}

// ────────────────────────────────────────────────────────────────────────────
// Generic single-row reader
// ────────────────────────────────────────────────────────────────────────────

type SettingClient = Prisma.TransactionClient | {
  schoolSetting: {
    findUnique(args: {
      where: { schoolId_key: { schoolId: string; key: string } }
      select: { value: true }
    }): Promise<{ value: string } | null>
  }
}

/**
 * Reads one raw setting value for a school, or `null` when the school has never
 * saved it. Accepts a transaction client so a caller can read the value inside
 * its own transaction alongside the business state it is authorizing.
 */
export async function readSchoolSetting(
  client: SettingClient,
  schoolId: string,
  key: string,
): Promise<string | null> {
  const row = await client.schoolSetting.findUnique({
    where: { schoolId_key: { schoolId, key } },
    select: { value: true },
  })
  return row?.value ?? null
}

/**
 * Reads the school's concession self-approval policy, already parsed and
 * fail-safe. This is the single authoritative resolution point for the policy —
 * callers pass the tenant they already resolved, never a client-supplied value.
 */
export async function readConcessionSelfApprovalPolicy(
  client: SettingClient,
  schoolId: string,
): Promise<ConcessionSelfApprovalPolicy> {
  return parseConcessionSelfApproval(
    await readSchoolSetting(client, schoolId, CONCESSION_SELF_APPROVAL_SETTING_KEY),
  )
}
