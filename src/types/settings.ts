// Domain type for the Settings module. Mirrors the backend contract
// (server/src/modules/settings/).

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
