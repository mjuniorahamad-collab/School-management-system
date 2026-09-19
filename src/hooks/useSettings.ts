import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { settingsService } from "@/services/settingsService"
import type { SchoolSettings } from "@/types/settings"

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsService.get(),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<SchoolSettings>) => settingsService.update(payload),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] })
      // The chrome branding projection (sidebar/header) derives from the same
      // SchoolSetting rows; refresh it alongside so edits apply immediately.
      if (payload.schoolName !== undefined || payload.tagline !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["branding"] })
      }
      toast.success("Settings saved")
    },
    onError: (error: Error) => {
      toast.error("Could not save settings", { description: error.message })
    },
  })
}
