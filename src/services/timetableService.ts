import { api } from "@/lib/apiClient"
import type {
  TimetableEntryCopyDayPayload,
  TimetableEntryDetail,
  TimetableEntryFormPayload,
  TimetableEntryListResult,
  TimetableEntryListQuery,
} from "@/types/timetable"

function timetableParams(query: TimetableEntryListQuery): string {
  const params = new URLSearchParams()
  if (query.academicSessionId) params.set("academicSessionId", query.academicSessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.sectionId) params.set("sectionId", query.sectionId)
  if (query.teacherId) params.set("teacherId", query.teacherId)
  if (query.dayOfWeek) params.set("dayOfWeek", query.dayOfWeek)
  return params.toString()
}

export const timetableService = {
  list(query: TimetableEntryListQuery): Promise<TimetableEntryListResult> {
    return api.get<TimetableEntryListResult>(`/timetable?${timetableParams(query)}`)
  },
  get(id: string): Promise<TimetableEntryDetail> {
    return api.get<TimetableEntryDetail>(`/timetable/${id}`)
  },
  create(payload: TimetableEntryFormPayload): Promise<TimetableEntryDetail> {
    return api.post<TimetableEntryDetail>("/timetable", payload)
  },
  update(id: string, payload: Partial<TimetableEntryFormPayload>): Promise<TimetableEntryDetail> {
    return api.patch<TimetableEntryDetail>(`/timetable/${id}`, payload)
  },
  remove(id: string): Promise<{ deleted: boolean }> {
    return api.delete<{ deleted: boolean }>(`/timetable/${id}`)
  },
  copyDay(payload: TimetableEntryCopyDayPayload): Promise<{ copied: number }> {
    return api.post<{ copied: number }>("/timetable/copy-day", payload)
  },
}
