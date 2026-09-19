import { getPrisma } from "../../lib/database.js"
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
}

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

/** Coerces a stored string back to the typed value for the seeded defaults. */
function coerceSetting(key: keyof SchoolSettings, raw: string): unknown {
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
    for (const [key, value] of entries) {
      const raw = settingToStored(value)
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
      metadata: { keys: entries.map(([key]) => key) },
    })
  })

  return getSettings(schoolId)
}

function settingToStored(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  return String(value ?? "")
}
