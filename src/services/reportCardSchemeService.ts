import { api } from "@/lib/apiClient"
import type {
  ReportCardSchemeDetail,
  ReportCardSchemeListQuery,
  ReportCardSchemeListResult,
  UpsertReportCardSchemeInput,
} from "@/types/reportCardScheme"

// Data seam for the Report Card scheme configuration module. Every method hits
// the real REST API through the shared apiClient and returns the unwrapped
// envelope payload. There is intentionally no delete: a scheme's identity is
// its (session, class, section) scope and it is upserted idempotently via PUT.

export function buildReportCardSchemesQueryString(query: ReportCardSchemeListQuery): string {
  const params = new URLSearchParams()
  if (query.academicSessionId) params.set("academicSessionId", query.academicSessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.sectionId) params.set("sectionId", query.sectionId)
  return params.toString()
}

export const reportCardSchemeService = {
  list(query: ReportCardSchemeListQuery = {}): Promise<ReportCardSchemeListResult> {
    const qs = buildReportCardSchemesQueryString(query)
    return api.get<ReportCardSchemeListResult>(
      qs ? `/report-card-schemes?${qs}` : "/report-card-schemes",
    )
  },
  get(id: string): Promise<ReportCardSchemeDetail> {
    return api.get<ReportCardSchemeDetail>(`/report-card-schemes/${id}`)
  },
  /** Idempotent upsert scoped by (academicSessionId, classId, sectionId). */
  upsert(input: UpsertReportCardSchemeInput): Promise<ReportCardSchemeDetail> {
    return api.put<ReportCardSchemeDetail>("/report-card-schemes", input)
  },
}
