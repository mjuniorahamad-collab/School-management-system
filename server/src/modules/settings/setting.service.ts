import { getPrisma } from "../../lib/database.js"
import {
  CONCESSION_SELF_APPROVAL_SETTING_KEY,
  DEFAULT_CONCESSION_SELF_APPROVAL,
  DEFAULT_REQUIRE_REPORT_CARD_PDF_ARCHIVE,
  REQUIRE_REPORT_CARD_PDF_ARCHIVE_SETTING_KEY,
  brandingText,
  parseConcessionSelfApproval,
  parseReportCardSignatoriesForRead,
  parseRequireReportCardPdfArchive,
  readBranding,
} from "../../lib/school-settings.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { SchoolSettings, UpdateSettingsInput } from "./setting.schema.js"
import type { BrandingResponse, SettingsResponse } from "./setting.types.js"

// Re-exported so existing consumers (the print letterhead, branding tests) keep
// importing the projection helper from the settings seam; the implementation is
// owned by lib/school-settings.ts so the settings module and the report-card
// generation service share one normalisation rule.
export { brandingText }

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

/**
 * Canonical list of tenant-scoped setting keys and their defaults. Each value
 * is persisted as a row in the generic `SchoolSetting` key/value store (one
 * row per (school, key)), so settings are tenant-scoped and additive.
 */
const SETTING_DEFAULTS: Record<keyof SchoolSettings, string> = {
  schoolName: "",
  schoolShortName: "",
  tagline: "",
  contactPhone: "",
  contactEmail: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  logoUrl: "",
  primaryColor: "#4f46e5",
  academicTermLabel: "",
  academicCurrentSession: "",
  attendanceWorkdays: "Mon,Tue,Wed,Thu,Fri",
  attendanceDefaultMarking: "daily",
  attendanceLateGraceMinutes: "5",
  reportCardSignatories: "[]",
  timetablePeriodsPerDay: "6",
  timetableStartTime: "08:00",
  timetableEndTime: "14:00",
  gradingPassPercent: "40",
  gradingScale: "100",
  feeCurrency: "USD",
  feeDefaultDueDay: "10",
  feeEnableOnlinePayments: "true",
  // Fails SAFE: a school that never saved this key requires independent
  // approval, which is exactly the behavior that predates the setting.
  feeConcessionSelfApproval: DEFAULT_CONCESSION_SELF_APPROVAL,
  // Fails SAFE: a school that never saved this key must archive a PDF before a
  // report card may be issued (docs/report-card.md §9 default).
  requireReportCardPdfArchive: String(DEFAULT_REQUIRE_REPORT_CARD_PDF_ARCHIVE),
}

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

/**
 * Keys whose stored string belongs to a closed value set and therefore must be
 * validated on read, so a hand-edited or corrupt row can never hand an
 * out-of-contract value to a client or to a policy decision.
 */
const SETTING_PARSERS: Partial<Record<keyof SchoolSettings, (raw: string) => unknown>> = {
  feeConcessionSelfApproval: parseConcessionSelfApproval,
  // Not left to the generic boolean coercion (`raw === "true"`): a blank or
  // hand-edited row must fail safe to "archive required", never to "optional".
  requireReportCardPdfArchive: parseRequireReportCardPdfArchive,
  // A JSON-encoded list cannot use the generic string coercion: a corrupt row
  // must read back as an empty list for display rather than leak the raw JSON.
  reportCardSignatories: parseReportCardSignatoriesForRead,
}

/** Coerces a stored string back to the typed value for the seeded defaults. */
function coerceSetting(key: keyof SchoolSettings, raw: string): unknown {
  const parser = SETTING_PARSERS[key]
  if (parser) return parser(raw)
  const definition = schoolSettingsSchemaShape[key]
  if (definition === "number") return Number(raw)
  if (definition === "boolean") return raw.toLowerCase() === "true"
  return raw
}

const schoolSettingsSchemaShape: Record<keyof SchoolSettings, "string" | "number" | "boolean"> = {
  schoolName: "string",
  schoolShortName: "string",
  tagline: "string",
  contactPhone: "string",
  contactEmail: "string",
  addressLine1: "string",
  addressLine2: "string",
  city: "string",
  state: "string",
  postalCode: "string",
  country: "string",
  logoUrl: "string",
  primaryColor: "string",
  academicTermLabel: "string",
  academicCurrentSession: "string",
  attendanceWorkdays: "string",
  attendanceDefaultMarking: "string",
  attendanceLateGraceMinutes: "number",
  reportCardSignatories: "string",
  timetablePeriodsPerDay: "number",
  timetableStartTime: "string",
  timetableEndTime: "string",
  gradingPassPercent: "number",
  gradingScale: "string",
  feeCurrency: "string",
  feeDefaultDueDay: "number",
  feeEnableOnlinePayments: "boolean",
  feeConcessionSelfApproval: "string",
  // Kept as "string" so `SETTING_PARSERS` (which fails safe) is the only path
  // that interprets it; `coerceSetting` returns a parser's result unchanged.
  requireReportCardPdfArchive: "string",
}

/** Reads all tenant-scoped settings for a school, merging defaults over DB rows. */
export async function getSettings(schoolId: string): Promise<SettingsResponse> {
  const prisma = await requirePrisma()

  const [school, rows] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId } }),
    prisma.schoolSetting.findMany({ where: { schoolId } }),
  ])

  if (!school) throw new Error("Authenticated school not found")

  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const settings = {} as SchoolSettings
  for (const key of Object.keys(SETTING_DEFAULTS) as (keyof SchoolSettings)[]) {
    const raw = stored.get(key) ?? SETTING_DEFAULTS[key]
    ;(settings as Record<string, unknown>)[key] = coerceSetting(key, raw)
  }

  return {
    school: { id: school.id, name: school.name, code: school.code },
    settings,
  }
}

/**
 * Branding projection for the application chrome and the print letterhead.
 * Reads the canonical `SchoolSetting` rows (falling back to the tenant's
 * `School.name` when the editable name is empty) so any authenticated user of
 * the tenant — including portal-only roles without `settings:view` — can render
 * the school's identity. Always scoped to the caller's own school.
 *
 * Delegates to `readBranding` so the app chrome and the frozen report-card
 * snapshot project the identical shape from the identical rows.
 *
 * Only identity and the public contact block are projected. This is not a
 * settings dump: grading, attendance, timetable, fee, currency and colour
 * settings stay behind the `settings:view` route.
 */
export async function getBranding(schoolId: string): Promise<BrandingResponse> {
  const prisma = await requirePrisma()
  return readBranding(prisma, schoolId)
}

/**
 * Settings whose before/after value is recorded in the audit metadata (rather
 * than just their name), because changing one changes what the system allows:
 *
 * - `feeConcessionSelfApproval` waives segregation of duties for self-approvals.
 * - `requireReportCardPdfArchive` changes whether a report card may be ISSUED
 *   with no archived PDF (docs/report-card.md §9/§9a).
 *
 * `field` is the metadata key each change is reported under, so the
 * pre-existing `policyChange` contract stays byte-identical for the concession
 * setting and the archive policy is reported alongside it under its own name.
 */
const TRACKED_POLICY_SETTINGS: {
  key: keyof SchoolSettings
  field: "policyChange" | "pdfArchivePolicyChange"
  fallback: string
}[] = [
  {
    key: CONCESSION_SELF_APPROVAL_SETTING_KEY,
    field: "policyChange",
    fallback: DEFAULT_CONCESSION_SELF_APPROVAL,
  },
  {
    key: REQUIRE_REPORT_CARD_PDF_ARCHIVE_SETTING_KEY,
    field: "pdfArchivePolicyChange",
    fallback: String(DEFAULT_REQUIRE_REPORT_CARD_PDF_ARCHIVE),
  },
]

/** Persists the provided settings into the tenant-scoped key/value store. */
export async function updateSettings(
  input: UpdateSettingsInput,
  schoolId: string,
  actor: AuthUser,
): Promise<SettingsResponse> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const entries = Object.entries(input) as [keyof SchoolSettings, unknown][]
  await prisma.$transaction(async (tx) => {
    // Read each tracked policy's current value inside the same transaction as
    // the write, so the audit row records a real before/after committed by this
    // same transaction (a value read outside it could be stale).
    const pendingChanges = new Map<string, { previousValue: string; newValue: string }>()
    for (const { key, fallback } of TRACKED_POLICY_SETTINGS) {
      if (!entries.some(([entryKey]) => entryKey === key)) continue
      const existing = await tx.schoolSetting.findUnique({
        where: { schoolId_key: { schoolId, key } },
        select: { value: true },
      })
      pendingChanges.set(key, { previousValue: existing?.value ?? fallback, newValue: "" })
    }

    for (const [key, value] of entries) {
      const raw = settingToStored(value)
      // Scoped to the policy key: a payload may carry many settings at once, and
      // a later unrelated entry must not overwrite the recorded new value with
      // its own stored representation.
      const pending = pendingChanges.get(key)
      if (pending) pending.newValue = raw
      await tx.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key } },
        update: { value: raw },
        create: { schoolId, key, value: raw },
      })
    }

    const metadata: Record<string, unknown> = { keys: entries.map(([key]) => key) }
    for (const { key, field } of TRACKED_POLICY_SETTINGS) {
      const change = pendingChanges.get(key)
      if (change) {
        metadata[field] = { key, previousValue: change.previousValue, newValue: change.newValue }
      }
    }

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "SETTING_CHANGE",
      entityType: "SCHOOL_SETTING",
      entityId: null,
      summary: `Updated ${entries.length} school setting(s)`,
      // Only the tracked policies above contribute values; every other key is
      // recorded by name, so no routine setting values enter the audit trail.
      metadata,
    })
  })

  return getSettings(schoolId)
}

function settingToStored(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value ?? "")
}
