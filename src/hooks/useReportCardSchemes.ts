import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { reportCardSchemeService } from "@/services/reportCardSchemeService"
import { reportCardSchemeKeys } from "@/hooks/reportCardQueryKeys"
import { reportCardErrorMessage } from "@/lib/reportCardErrors"
import type {
  ReportCardSchemeListQuery,
  UpsertReportCardSchemeInput,
} from "@/types/reportCardScheme"

/** Lists schemes, optionally filtered by session/class/section. */
export function useReportCardSchemes(query: ReportCardSchemeListQuery = {}) {
  return useQuery({
    queryKey: reportCardSchemeKeys.list(query),
    queryFn: () => reportCardSchemeService.list(query),
    placeholderData: (previous) => previous,
  })
}

/** A single scheme by id. */
export function useReportCardScheme(id: string | null) {
  return useQuery({
    queryKey: reportCardSchemeKeys.detail(id ?? ""),
    queryFn: () => reportCardSchemeService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

/** Idempotent upsert of a scheme scoped by (session, class, section). */
export function useUpsertReportCardScheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertReportCardSchemeInput) => reportCardSchemeService.upsert(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportCardSchemeKeys.all })
      toast.success("Scheme saved")
    },
    onError: (e: Error) =>
      toast.error("Could not save scheme", { description: reportCardErrorMessage(e) }),
  })
}
