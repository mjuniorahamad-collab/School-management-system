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
// Report-card PDF archive policy
// ────────────────────────────────────────────────────────────────────────────

/**
 * School-scoped policy for whether a report card may be ISSUED without an
 * archived, human-confirmed PDF artifact (docs/report-card.md §9, §9a, §13).
 *
 * Like the concession policy above, this is a business rule rather than a
 * capability, so it is deliberately NOT a permission code — it only gates the
 * issue step behind an artifact that the actor already needs
 * `report-cards:archive` to create and `report-cards:publish` to act on.
 *
 * - `true` (DEFAULT) — archiving required: a card stays `PENDING_ARCHIVE`
 *   until a validated, confirmed artifact is bound to its frozen version (§9.5).
 * - `false` — snapshot-only issue (§9a): issuance does not wait on a PDF, the
 *   issued record must be labelled as having no archived PDF, and the system
 *   must never claim one was archived.
 */
export const REQUIRE_REPORT_CARD_PDF_ARCHIVE_SETTING_KEY = "requireReportCardPdfArchive"

/**
 * Fail-SAFE default. Archiving is required by default (§9:222), so a school
 * that has never saved the key, saved it blank, or has a hand-edited/corrupt
 * value all read through to the strict default — a card is never issued without
 * a valid archive because of a missing setting.
 */
export const DEFAULT_REQUIRE_REPORT_CARD_PDF_ARCHIVE = true

/**
 * Parses a stored `SchoolSetting` value into the archive policy. Anything other
 * than an explicit, unambiguous `false` resolves to `true` (archive required).
 */
export function parseRequireReportCardPdfArchive(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return DEFAULT_REQUIRE_REPORT_CARD_PDF_ARCHIVE
  const normalized = raw.trim().toLowerCase()
  if (normalized === "false") return false
  if (normalized === "true") return true
  return DEFAULT_REQUIRE_REPORT_CARD_PDF_ARCHIVE
}

// ────────────────────────────────────────────────────────────────────────────
// Report-card signatory configuration
// ────────────────────────────────────────────────────────────────────────────

/**
 * One configured report-card signatory: a free-text role label and the name of
 * the person who will sign in that role. Both are school-authored values, never
 * derived from a Teacher/Staff row (no "class teacher" or "principal" role is
 * modelled), so the snapshot can only ever freeze what the school configured.
 */
export interface ReportCardSignatory {
  role: string
  name: string
}

/**
 * `SchoolSetting.key` that stores the JSON-encoded signatory list. Kept in this
 * module (not the settings module) so the settings reader and the report-card
 * generation service resolve the key, the shape and the validation identically.
 */
export const REPORT_CARD_SIGNATORIES_SETTING_KEY = "reportCardSignatories"

/** Upper bound on configured signatories (a report card prints only a few). */
export const MAX_REPORT_CARD_SIGNATORIES = 4

/**
 * Canonical parse of the stored signatory value. Unlike the policy parsers above
 * this has no valid default: an absent/blank key (`unset`), an empty list
 * (`empty`) and a malformed list (`corrupt`) are all distinct, because the
 * report-card generation gate must fail closed on every one of them without
 * inventing a signatory.
 */
export type ReportCardSignatoriesParse =
  | { status: "unset" }
  | { status: "empty" }
  | { status: "valid"; signatories: ReportCardSignatory[] }
  | { status: "corrupt" }

export function parseReportCardSignatories(
  raw: string | null | undefined,
): ReportCardSignatoriesParse {
  if (raw === null || raw === undefined || raw.trim() === "") return { status: "unset" }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: "corrupt" }
  }
  if (!Array.isArray(parsed)) return { status: "corrupt" }
  if (parsed.length === 0) return { status: "empty" }
  if (parsed.length > MAX_REPORT_CARD_SIGNATORIES) return { status: "corrupt" }

  const signatories: ReportCardSignatory[] = []
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) return { status: "corrupt" }
    const candidate = entry as Record<string, unknown>
    const role = typeof candidate.role === "string" ? candidate.role.trim() : ""
    const name = typeof candidate.name === "string" ? candidate.name.trim() : ""
    if (role === "" || name === "") return { status: "corrupt" }
    signatories.push({ role, name })
  }
  return { status: "valid", signatories }
}

/**
 * Backward-compatible read for Settings/branding consumers: a blank, empty or
 * malformed stored value reads back as an empty list so the settings payload is
 * never a hard error. The report-card generation gate uses the strict parse
 * above and fails closed; this lenient projection is display-only.
 */
export function parseReportCardSignatoriesForRead(
  raw: string | null | undefined,
): ReportCardSignatory[] {
  const parsed = parseReportCardSignatories(raw)
  return parsed.status === "valid" ? parsed.signatories : []
}

/**
 * Reads and strictly parses the school's signatory configuration. This is the
 * single authoritative resolution point — callers pass the tenant they already
 * resolved, never a client-supplied value.
 */
export async function readReportCardSignatories(
  client: SettingClient,
  schoolId: string,
): Promise<ReportCardSignatoriesParse> {
  return parseReportCardSignatories(
    await readSchoolSetting(client, schoolId, REPORT_CARD_SIGNATORIES_SETTING_KEY),
  )
}

// ────────────────────────────────────────────────────────────────────────────
// School identity / branding projection (shared by Settings and report cards)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The school identity block the print letterhead and the report-card snapshot
 * both render. It is a projection of the canonical `SchoolSetting` key/value
 * rows (never an independent source), with the editable name falling back to the
 * tenant's `School.name`. Every optional field is `string | null` so "not set"
 * is distinguishable from a real value.
 */
export interface SchoolBranding {
  schoolName: string
  tagline: string | null
  schoolShortName: string | null
  contactPhone: string | null
  contactEmail: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}

/** Canonical branding keys projected by {@link projectBranding}. */
export const BRANDING_SETTING_KEYS = [
  "schoolName",
  "schoolShortName",
  "tagline",
  "contactPhone",
  "contactEmail",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
] as const

/**
 * The key/value store has no null: an unset key reads back as `""`. Branding
 * speaks `null` for "this tenant has not set it"; a whitespace-only value counts
 * as unset.
 */
export function brandingText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? null : trimmed
}

/**
 * Pure projection of the stored branding rows (plus the tenant's `School.name`
 * fallback for an empty school name). Shared by the settings `getBranding`
 * projection and the report-card generation freeze so both can never disagree.
 */
export function projectBranding(
  stored: ReadonlyMap<string, string>,
  schoolName: string,
): SchoolBranding {
  const storedName = (stored.get("schoolName") ?? "").trim()
  return {
    schoolName: storedName === "" ? schoolName : storedName,
    tagline: brandingText(stored.get("tagline")),
    schoolShortName: brandingText(stored.get("schoolShortName")),
    contactPhone: brandingText(stored.get("contactPhone")),
    contactEmail: brandingText(stored.get("contactEmail")),
    addressLine1: brandingText(stored.get("addressLine1")),
    addressLine2: brandingText(stored.get("addressLine2")),
    city: brandingText(stored.get("city")),
    state: brandingText(stored.get("state")),
    postalCode: brandingText(stored.get("postalCode")),
    country: brandingText(stored.get("country")),
  }
}

type BrandingClient =
  | Prisma.TransactionClient
  | {
      school: {
        findUnique(args: {
          where: { id: string }
          select: { name: true }
        }): Promise<{ name: string } | null>
      }
      schoolSetting: {
        findMany(args: {
          where: { schoolId: string }
          select: { key: true; value: true }
        }): Promise<Array<{ key: string; value: string }>>
      }
    }

/**
 * Reads the tenant's branding projection inside or outside a transaction. The
 * single authoritative resolution point for the school identity frozen into a
 * report card and rendered by the print letterhead.
 */
export async function readBranding(
  client: BrandingClient,
  schoolId: string,
): Promise<SchoolBranding> {
  const [school, rows] = await Promise.all([
    client.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    client.schoolSetting.findMany({
      where: { schoolId },
      select: { key: true, value: true },
    }),
  ])
  if (!school) throw new Error("Authenticated school not found")

  const stored = new Map(rows.map((row) => [row.key, row.value]))
  return projectBranding(stored, school.name)
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

/**
 * Reads the school's report-card PDF archive policy, already parsed and
 * fail-safe. This is the single authoritative resolution point for the policy —
 * the report-card service calls it inside the issuance transaction so the
 * artifact gate is evaluated against the same committed state being mutated.
 */
export async function readRequireReportCardPdfArchive(
  client: SettingClient,
  schoolId: string,
): Promise<boolean> {
  return parseRequireReportCardPdfArchive(
    await readSchoolSetting(client, schoolId, REQUIRE_REPORT_CARD_PDF_ARCHIVE_SETTING_KEY),
  )
}
