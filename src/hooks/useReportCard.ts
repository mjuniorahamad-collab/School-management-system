import { useQuery } from "@tanstack/react-query"
import { reportCardService } from "@/services/reportCardService"
import { reportCardKeys } from "@/hooks/reportCardQueryKeys"

/** A single report card (with frozen subjects and exam resolutions). */
export function useReportCard(id: string | null) {
  return useQuery({
    queryKey: reportCardKeys.detail(id ?? ""),
    queryFn: () => reportCardService.get(id ?? ""),
    enabled: Boolean(id),
  })
}
