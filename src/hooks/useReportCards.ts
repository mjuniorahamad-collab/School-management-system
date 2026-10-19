import { useQuery } from "@tanstack/react-query"
import { reportCardService } from "@/services/reportCardService"
import { reportCardKeys } from "@/hooks/reportCardQueryKeys"
import type { ReportCardListQuery } from "@/types/reportCard"

/** Paginated report-card list. `placeholderData` keeps the previous page while the next loads. */
export function useReportCards(query: ReportCardListQuery = {}) {
  return useQuery({
    queryKey: reportCardKeys.list(query),
    queryFn: () => reportCardService.list(query),
    placeholderData: (previous) => previous,
  })
}
