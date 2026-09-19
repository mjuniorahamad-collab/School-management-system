import { api } from "@/lib/apiClient"
import type { BrandingResponse } from "@/types/settings"

// Data seam for the tenant-scoped branding projection consumed by the chrome.
// Reads /api/v1/branding — available to ANY authenticated user of the school
// (including portal-only roles that cannot read the full settings payload).

export const brandingService = {
  get(): Promise<BrandingResponse> {
    return api.get<BrandingResponse>("/branding")
  },
}