import { api } from "@/lib/apiClient"
import type {
  AdmissionConvertResult,
  AdmissionDetail,
  AdmissionFormPayload,
  AdmissionListResult,
  AdmissionsMeta,
  AdmissionsQuery,
  ConvertAdmissionPayload,
  ReviewAdmissionPayload,
} from "@/types/admissions"

// Data seam for the Admissions module. Every method hits the real REST API
// through the shared apiClient and returns the unwrapped envelope payload.

export function buildAdmissionsQueryString(query: AdmissionsQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page))
  params.set("pageSize", String(query.pageSize))
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.sortBy) params.set("sortBy", query.sortBy)
  if (query.sortDir) params.set("sortDir", query.sortDir)
  return params.toString()
}

export const admissionsService = {
  list(query: AdmissionsQuery): Promise<AdmissionListResult> {
    return api.get<AdmissionListResult>(`/admissions?${buildAdmissionsQueryString(query)}`)
  },
  get(id: string): Promise<AdmissionDetail> {
    return api.get<AdmissionDetail>(`/admissions/${id}`)
  },
  meta(): Promise<AdmissionsMeta> {
    return api.get<AdmissionsMeta>("/admissions/meta")
  },
  create(payload: AdmissionFormPayload): Promise<AdmissionDetail> {
    return api.post<AdmissionDetail>("/admissions", payload)
  },
  update(id: string, payload: Partial<AdmissionFormPayload>): Promise<AdmissionDetail> {
    return api.patch<AdmissionDetail>(`/admissions/${id}`, payload)
  },
  review(id: string, payload: ReviewAdmissionPayload): Promise<AdmissionDetail> {
    return api.post<AdmissionDetail>(`/admissions/${id}/review`, payload)
  },
  convert(id: string, payload: ConvertAdmissionPayload): Promise<AdmissionConvertResult> {
    return api.post<AdmissionConvertResult>(`/admissions/${id}/convert`, payload)
  },
  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete<{ id: string; deleted: boolean }>(`/admissions/${id}`)
  },
}
