import { useQuery } from "@tanstack/react-query"
import { brandingService } from "@/services/brandingService"

// Shared chrome hook for the tenant branding projection. Independent query key
// from the full settings read so it can resolve for portal-only users whose
// /settings read would 403; invalidated together with settings on edit.
export function useBranding() {
  return useQuery({
    queryKey: ["branding"],
    queryFn: brandingService.get,
  })
}