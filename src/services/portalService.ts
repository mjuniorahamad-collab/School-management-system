import { api } from "@/lib/apiClient"
import type {
  CreateProfileLinkPayload,
  DeleteProfileLinkPayload,
  PortalAttendanceResult,
  PortalChild,
  PortalChildDetail,
  PortalFeesResult,
  PortalLibraryResult,
  PortalLinksResult,
  PortalNoticesResult,
  PortalOverview,
  PortalResultsResult,
  PortalTasksResult,
  PortalTransportResult,
  PortalLinkCandidatesResult,
} from "@/types/portal"

function queryString(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value)
  }
  return params.toString()
}

/**
 * Data seam for the Student/Parent Portal. Self-service reads hit `/me/*` which
 * are ownership-scoped server-side; link management hits `/portal/links` which
 * is guarded by `portal:update`. Never call fetch from components.
 */
export const portalService = {
  getOverview(): Promise<PortalOverview> {
    return api.get<PortalOverview>("/me")
  },

  listChildren(): Promise<PortalChild[]> {
    return api.get<PortalChild[]>("/me/children")
  },

  getChild(studentId: string): Promise<PortalChildDetail> {
    return api.get<PortalChildDetail>(`/me/children/${studentId}`)
  },

  getAttendance(studentId: string, sessionId?: string): Promise<PortalAttendanceResult> {
    const qs = queryString({ sessionId })
    return api.get<PortalAttendanceResult>(`/me/children/${studentId}/attendance${qs ? `?${qs}` : ""}`)
  },

  getFees(studentId: string, sessionId?: string): Promise<PortalFeesResult> {
    const qs = queryString({ sessionId })
    return api.get<PortalFeesResult>(`/me/children/${studentId}/fees${qs ? `?${qs}` : ""}`)
  },

  getResults(studentId: string, sessionId?: string): Promise<PortalResultsResult> {
    const qs = queryString({ sessionId })
    return api.get<PortalResultsResult>(`/me/children/${studentId}/results${qs ? `?${qs}` : ""}`)
  },

  getTasks(studentId: string, sessionId?: string): Promise<PortalTasksResult> {
    const qs = queryString({ sessionId })
    return api.get<PortalTasksResult>(`/me/children/${studentId}/tasks${qs ? `?${qs}` : ""}`)
  },

  getTransport(studentId: string, sessionId?: string): Promise<PortalTransportResult> {
    const qs = queryString({ sessionId })
    return api.get<PortalTransportResult>(`/me/children/${studentId}/transport${qs ? `?${qs}` : ""}`)
  },

  getLibraryLoans(studentId: string): Promise<PortalLibraryResult> {
    return api.get<PortalLibraryResult>(`/me/children/${studentId}/library`)
  },

  getNotices(limit?: number): Promise<PortalNoticesResult> {
    const qs = queryString({ limit: limit !== undefined ? String(limit) : undefined })
    return api.get<PortalNoticesResult>(`/me/notices${qs ? `?${qs}` : ""}`)
  },

  listLinks(): Promise<PortalLinksResult> {
    return api.get<PortalLinksResult>("/portal/links")
  },

  getLinkCandidates(): Promise<PortalLinkCandidatesResult> {
    return api.get<PortalLinkCandidatesResult>("/portal/links/candidates")
  },

  createLink(payload: CreateProfileLinkPayload): Promise<PortalLinksResult> {
    return api.post<PortalLinksResult>("/portal/links", payload)
  },

  deleteLink(payload: DeleteProfileLinkPayload): Promise<PortalLinksResult> {
    return api.delete<PortalLinksResult>("/portal/links", payload)
  },
}