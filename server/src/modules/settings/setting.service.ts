import { getPrisma } from "../../lib/database.js"
import {
  CONCESSION_SELF_APPROVAL_SETTING_KEY,
  DEFAULT_CONCESSION_SELF_APPROVAL,
  parseConcessionSelfApproval,
} from "../../lib/school-settings.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { SchoolSettings, UpdateSettingsInput } from "./setting.schema.js"
import type { BrandingResponse, SettingsResponse } from "./setting.types.js"

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
  timetablePeriodsPerDay: "number",
  timetableStartTime: "string",
  timetableEndTime: "string",
  gradingPassPercent: "number",
  gradingScale: "string",
  feeCurrency: "string",
  feeDefaultDueDay: "number",
  feeEnableOnlinePayments: "boolean",
  feeConcessionSelfApproval: "string",
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
 * Branding projection for the application chrome. Presolves the same canonical
 * `SchoolSetting` rows `getSettings` reads (falling back to the tenant's
 * `School.name` when the editable name is empty) so any authenticated user of
 * the tenant — including portal-only roles without `settings:view` — can render
 * the school's editable branding. Always scoped to the caller's own school.
 */
export async function getBranding(schoolId: string): Promise<BrandingResponse> {
  const { settings, school } = await getSettings(schoolId)
  return {
    schoolName: settings.schoolName.trim() || school.name,
    tagline: settings.tagline?.trim() || null,
  }
}

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
    // Read the concession self-approval policy's current value inside the same
    // transaction as the write, so the audit row records a real before/after.
    let policyChange: { previousValue: string; newValue: string } | null = null
    if (entries.some(([key]) => key === "feeConcessionSelfApproval")) {
      const existing = await tx.schoolSetting.findUnique({
        where: { schoolId_key: { schoolId, key: CONCESSION_SELF_APPROVAL_SETTING_KEY } },
        select: { value: true },
      })
      policyChange = { previousValue: existing?.value ?? DEFAULT_CONCESSION_SELF_APPROVAL, newValue: "" }
    }

    for (const [key, value] of entries) {
      const raw = settingToStored(value)
      // Scoped to the policy key: a payload may carry many settings at once, and
      // a later unrelated entry must not overwrite the recorded new value with
      // its own stored representation.
      if (policyChange && key === CONCESSION_SELF_APPROVAL_SETTING_KEY) policyChange.newValue = raw
      await tx.schoolSetting.upsert({
        where: { schoolId_key: { schoolId, key } },
        update: { value: raw },
        create: { schoolId, key, value: raw },
      })
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
      metadata: {
        keys: entries.map(([key]) => key),
        // The self-approval policy waives segregation of duties, so its
        // before/after value is recorded. Every other key keeps recording names
        // only, so no new setting values enter the audit trail.
        ...(policyChange
          ? {
              policyChange: {
                key: CONCESSION_SELF_APPROVAL_SETTING_KEY,
                previousValue: policyChange.previousValue,
                newValue: policyChange.newValue,
              },
            }
          : {}),
      },
    })
  })

  return getSettings(schoolId)
}

function settingToStored(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  return String(value ?? "")
}
