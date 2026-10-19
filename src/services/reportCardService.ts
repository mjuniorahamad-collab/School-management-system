import { api } from "@/lib/apiClient"
import type {
  GenerateReportCardInput,
  ReportCardArtifact,
  ReportCardDetail,
  ReportCardListQuery,
  ReportCardListResult,
} from "@/types/reportCard"

// Data seam for the Annual Report Card module. Every method hits the real REST
// API through the shared apiClient and returns the unwrapped envelope payload.

export function buildReportCardsQueryString(query: ReportCardListQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  if (query.studentId) params.set("studentId", query.studentId)
  if (query.academicSessionId) params.set("academicSessionId", query.academicSessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.sectionId) params.set("sectionId", query.sectionId)
  if (query.status) params.set("status", query.status)
  return params.toString()
}

/**
 * Base-relative URL for a card's archived PDF. Callers prepend `API_BASE_URL`
 * and render an authenticated `<a download>` (matching the CSV-export
 * convention); the bytes are served behind `report-cards:view`. The URL never
 * addresses storage directly — the server resolves the artifact key.
 */
export function buildReportCardArchiveUrl(reportCardId: string): string {
  return `/report-cards/${reportCardId}/archive`
}

export const reportCardService = {
  list(query: ReportCardListQuery = {}): Promise<ReportCardListResult> {
    const qs = buildReportCardsQueryString(query)
    return api.get<ReportCardListResult>(qs ? `/report-cards?${qs}` : "/report-cards")
  },
  get(id: string): Promise<ReportCardDetail> {
    return api.get<ReportCardDetail>(`/report-cards/${id}`)
  },
  generate(input: GenerateReportCardInput): Promise<ReportCardDetail> {
    return api.post<ReportCardDetail>("/report-cards/generate", input)
  },
  /** DRAFT → PENDING_ARCHIVE (validated against the frozen snapshot). */
  publish(id: string): Promise<ReportCardDetail> {
    return api.post<ReportCardDetail>(`/report-cards/${id}/publish`, undefined)
  },
  /** PENDING_ARCHIVE → ISSUED (idempotent; gates on the archive policy). */
  issue(id: string): Promise<ReportCardDetail> {
    return api.post<ReportCardDetail>(`/report-cards/${id}/issue`, undefined)
  },
  /**
   * Uploads and confirms the version's PDF archive (multipart, field "pdf").
   * The endpoint is POST, hence `postForm` rather than `putForm`.
   */
  attachArchive(id: string, file: File): Promise<ReportCardArtifact> {
    const formData = new FormData()
    formData.append("pdf", file)
    return api.postForm<ReportCardArtifact>(`/report-cards/${id}/archive`, formData)
  },
}
