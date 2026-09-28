// Domain type for the Settings module. Mirrors the backend contract
// (server/src/modules/settings/).

/**
 * Branding projection consumed by the application chrome (sidebar/header) and by
 * the print letterhead. It is a server-side projection of the canonical
 * SchoolSetting store — the same rows the Settings UI reads — so any
 * authenticated user (including portal-only roles) can render the school's
 * editable name and public contact details without the full settings payload,
 * which stays behind `settings:view`.
 *
 * Mirrors `BrandingResponse` in server/src/modules/settings/setting.types.ts.
 * Every optional field is `string | null` because the server normalises an unset
 * key/value row to `null`; `null` means "this tenant has not set it" and must
 * render as absent, never as a fallback value belonging to another school.
 */
export interface BrandingResponse {
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

/**
 * Tenant-scoped segregation-of-duties control for fee concessions. Mirrors
 * `ConcessionSelfApprovalPolicy` in server/src/lib/school-settings.ts.
 *
 * Not a permission: it only relaxes the self-approval guard for actors who
 * already hold `concessions:approve`. Independent approval is always possible,
 * so `SELF_APPROVAL_ALLOWED` already means "both" and there is no third value.
 */
export const CONCESSION_SELF_APPROVAL_VALUES = [
  "INDEPENDENT_APPROVAL_REQUIRED",
  "SELF_APPROVAL_ALLOWED",
] as const

export type ConcessionSelfApprovalPolicy = (typeof CONCESSION_SELF_APPROVAL_VALUES)[number]

/** `SchoolSetting.key` that stores the policy. Mirrors the server constant. */
export const CONCESSION_SELF_APPROVAL_SETTING_KEY = "feeConcessionSelfApproval"

/** Fail-safe default: matches the server's read-through default exactly. */
export const DEFAULT_CONCESSION_SELF_APPROVAL: ConcessionSelfApprovalPolicy = "INDEPENDENT_APPROVAL_REQUIRED"

export const CONCESSION_SELF_APPROVAL_LABELS: Record<ConcessionSelfApprovalPolicy, string> = {
  INDEPENDENT_APPROVAL_REQUIRED: "Require independent approval (recommended)",
  SELF_APPROVAL_ALLOWED: "Allow requesters to approve their own concessions",
}

export interface SchoolSettings {
  schoolName: string
  schoolShortName?: string
  tagline?: string
  contactPhone?: string
  contactEmail?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  logoUrl?: string
  primaryColor?: string
  academicTermLabel?: string
  academicCurrentSession?: string
  attendanceWorkdays?: string
  attendanceDefaultMarking?: "daily" | "period"
  attendanceLateGraceMinutes?: number
  timetablePeriodsPerDay?: number
  timetableStartTime?: string
  timetableEndTime?: string
  gradingPassPercent?: number
  gradingScale?: "100" | "4.0"
  feeCurrency?: string
  feeDefaultDueDay?: number
  feeEnableOnlinePayments?: boolean
  feeConcessionSelfApproval?: ConcessionSelfApprovalPolicy
}

export interface SettingsResponse {
  school: { id: string; name: string; code: string | null }
  settings: SchoolSettings
}
