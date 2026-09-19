import type { SchoolSettings } from "./setting.schema.js"

export interface SettingsResponse {
  school: { id: string; name: string; code: string | null }
  settings: SchoolSettings
}

/**
 * Slim branding projection shared by the application chrome (sidebar/header)
 * so any authenticated user of a tenant can render the school's editable name
 * without needing the full, permission-gated settings read. It is a projection
 * of the canonical SchoolSetting store — the same rows the Settings UI reads —
 * never an independent source.
 */
export interface BrandingResponse {
  schoolName: string
  tagline: string | null
}
