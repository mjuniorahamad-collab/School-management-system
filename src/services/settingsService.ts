import { api } from "@/lib/apiClient"
import type { SchoolSettings, SettingsResponse } from "@/types/settings"

// Data seam for the Settings module. Reads/writes the tenant-scoped
// configuration through the shared apiClient.

export const settingsService = {
  get(): Promise<SettingsResponse> {
    return api.get<SettingsResponse>("/settings")
  },
  update(payload: Partial<SchoolSettings>): Promise<SettingsResponse> {
    return api.put<SettingsResponse>("/settings", payload)
  },
}
