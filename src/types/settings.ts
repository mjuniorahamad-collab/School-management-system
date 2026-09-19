// Domain type for the Settings module. Mirrors the backend contract
// (server/src/modules/settings/).

export interface BrandingResponse {
  schoolName: string
  tagline: string | null
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
}

export interface SettingsResponse {
  school: { id: string; name: string; code: string | null }
  settings: SchoolSettings
}

// Branding projection consumed by the application chrome (sidebar/header). It is
// a server-side projection of the canonical SchoolSetting store — the same rows
// the Settings UI reads — so any authenticated user (including portal-only
// roles) can render the editable school name without the full settings payload.
export interface BrandingResponse {
  schoolName: string
  tagline: string | null
}
