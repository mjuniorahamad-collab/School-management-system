import type { SchoolSettings } from "./setting.schema.js"

export interface SettingsResponse {
  school: { id: string; name: string; code: string | null }
  settings: SchoolSettings
}

/**
 * Slim branding projection shared by the application chrome (sidebar/header) and
 * by the print letterhead, so any authenticated user of a tenant can render the
 * school's identity without needing the full, permission-gated settings read. It
 * is a projection of the canonical SchoolSetting store — the same rows the
 * Settings UI reads — never an independent source.
 *
 * The contact block is included deliberately: these are the school's own public
 * contact details, printed on every receipt, invoice and report a family or
 * visitor receives, so exposing them to an authenticated user of the same tenant
 * discloses nothing they could not already read. Operational settings
 * (grading, attendance, timetable, fees, currency, colours) are NOT projected
 * here and stay behind `settings:view`.
 *
 * Every optional field is `string | null` rather than `string | undefined`: the
 * key/value store persists an unset key as `""`, so the service normalises every
 * blank to `null` and clients can distinguish "not set" without string sniffing.
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
