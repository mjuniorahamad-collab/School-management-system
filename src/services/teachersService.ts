import { api } from "@/lib/apiClient"
import type { PhotoResult } from "@/types/photos"
import type {
  TeacherDetail,
  TeacherFormPayload,
  TeacherListResult,
  TeacherMeta,
  TeachersQuery,
} from "@/types/teachers"

export function buildTeachersQueryString(query: TeachersQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.designation) params.set("designation", query.designation)
  if (query.gender) params.set("gender", query.gender)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

export const teachersService = {
  list(query: TeachersQuery): Promise<TeacherListResult> {
    return api.get<TeacherListResult>(`/teachers?${buildTeachersQueryString(query)}`)
  },
  get(id: string): Promise<TeacherDetail> {
    return api.get<TeacherDetail>(`/teachers/${id}`)
  },
  meta(): Promise<TeacherMeta> {
    return api.get<TeacherMeta>("/teachers/meta")
  },
  create(payload: TeacherFormPayload): Promise<TeacherDetail> {
    return api.post<TeacherDetail>("/teachers", payload)
  },
  update(id: string, payload: Partial<TeacherFormPayload>): Promise<TeacherDetail> {
    return api.patch<TeacherDetail>(`/teachers/${id}`, payload)
  },
  uploadPhoto(id: string, file: File): Promise<PhotoResult> {
    const formData = new FormData()
    formData.append("photo", file)
    return api.putForm<PhotoResult>(`/teachers/${id}/photo`, formData)
  },
  removePhoto(id: string): Promise<PhotoResult> {
    return api.delete<PhotoResult>(`/teachers/${id}/photo`)
  },
}
