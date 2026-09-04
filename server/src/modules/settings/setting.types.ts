import type { SchoolSettings } from "./setting.schema.js"

export interface SettingsResponse {
  school: { id: string; name: string; code: string | null }
  settings: SchoolSettings
}
