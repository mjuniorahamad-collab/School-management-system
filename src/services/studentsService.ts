import { api } from "@/lib/apiClient"
import type { PhotoResult } from "@/types/photos"
import type {
  StudentDetail,
  StudentFormPayload,
  StudentListResult,
  StudentsMeta,
  StudentsQuery,
} from "@/types/students"

// Data seam for the Students module. Every method hits the real REST API
// through the shared apiClient and returns the unwrapped envelope payload.

export function buildStudentsQueryString(query: StudentsQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page))
  params.set("pageSize", String(query.pageSize))
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.sessionId) params.set("sessionId", query.sessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.sectionId) params.set("sectionId", query.sectionId)
  if (query.sortBy) params.set("sortBy", query.sortBy)
  if (query.sortDir) params.set("sortDir", query.sortDir)
  return params.toString()
}

export const studentsService = {
  list(query: StudentsQuery): Promise<StudentListResult> {
    return api.get<StudentListResult>(`/students?${buildStudentsQueryString(query)}`)
  },
  get(id: string): Promise<StudentDetail> {
    return api.get<StudentDetail>(`/students/${id}`)
  },
  meta(): Promise<StudentsMeta> {
    return api.get<StudentsMeta>("/students/meta")
  },
  create(payload: StudentFormPayload): Promise<StudentDetail> {
    return api.post<StudentDetail>("/students", payload)
  },
  update(id: string, payload: Partial<StudentFormPayload>): Promise<StudentDetail> {
    return api.patch<StudentDetail>(`/students/${id}`, payload)
  },
  /** Uploads or replaces the student's profile photo (multipart, field "photo"). */
  uploadPhoto(id: string, file: File): Promise<PhotoResult> {
    const formData = new FormData()
    formData.append("photo", file)
    return api.putForm<PhotoResult>(`/students/${id}/photo`, formData)
  },
  /** Removes the student's profile photo. */
  removePhoto(id: string): Promise<PhotoResult> {
    return api.delete<PhotoResult>(`/students/${id}/photo`)
  },
}

export function buildExportUrl(query: StudentsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.sessionId) params.set("sessionId", query.sessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.sectionId) params.set("sectionId", query.sectionId)
  const suffix = params.size > 0 ? `?${params.toString()}` : ""
  return `/students/export${suffix}`
}