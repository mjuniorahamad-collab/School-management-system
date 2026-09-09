import { api } from "@/lib/apiClient"
import type { PhotoResult } from "@/types/photos"
import type {
  StaffDetail,
  StaffFormPayload,
  StaffListResult,
  StaffMeta,
  StaffsQuery,
} from "@/types/staff"

export function buildStaffsQueryString(query: StaffsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.department) params.set("department", query.department)
  if (query.designation) params.set("designation", query.designation)
  if (query.gender) params.set("gender", query.gender)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

export const staffService = {
  list(query: StaffsQuery): Promise<StaffListResult> {
    return api.get<StaffListResult>(`/staff?${buildStaffsQueryString(query)}`)
  },
  get(id: string): Promise<StaffDetail> {
    return api.get<StaffDetail>(`/staff/${id}`)
  },
  meta(): Promise<StaffMeta> {
    return api.get<StaffMeta>("/staff/meta")
  },
  create(payload: StaffFormPayload): Promise<StaffDetail> {
    return api.post<StaffDetail>("/staff", payload)
  },
  update(id: string, payload: Partial<StaffFormPayload>): Promise<StaffDetail> {
    return api.patch<StaffDetail>(`/staff/${id}`, payload)
  },
  uploadPhoto(id: string, file: File): Promise<PhotoResult> {
    const formData = new FormData()
    formData.append("photo", file)
    return api.putForm<PhotoResult>(`/staff/${id}/photo`, formData)
  },
  removePhoto(id: string): Promise<PhotoResult> {
    return api.delete<PhotoResult>(`/staff/${id}/photo`)
  },
}
