import { api } from "@/lib/apiClient"
import type {
  ExamTypeDetail,
  ExamTypeFormPayload,
  ExamTypeListResult,
  ExamTypesQuery,
  FeeHeadDetail,
  FeeHeadFormPayload,
  FeeHeadListResult,
  FeeHeadsQuery,
  GradingBandDetail,
  GradingBandFormPayload,
  GradingBandListResult,
  GradingBandsQuery,
  PeriodSlotDetail,
  PeriodSlotFormPayload,
  PeriodSlotListResult,
  PeriodSlotsQuery,
} from "@/types/masterData"

function buildQuery(q: { search?: string; includeInactive?: boolean }): string {
  const params = new URLSearchParams()
  if (q.search) params.set("search", q.search)
  if (q.includeInactive) params.set("includeInactive", "true")
  return params.toString()
}

// Fee heads.
export const feeHeadsService = {
  list(query: FeeHeadsQuery): Promise<FeeHeadListResult> {
    return api.get<FeeHeadListResult>(`/fee-heads?${buildQuery(query)}`)
  },
  create(payload: FeeHeadFormPayload): Promise<FeeHeadDetail> {
    return api.post<FeeHeadDetail>("/fee-heads", payload)
  },
  update(id: string, payload: Partial<FeeHeadFormPayload>): Promise<FeeHeadDetail> {
    return api.patch<FeeHeadDetail>(`/fee-heads/${id}`, payload)
  },
}

// Exam types.
export const examTypesService = {
  list(query: ExamTypesQuery): Promise<ExamTypeListResult> {
    return api.get<ExamTypeListResult>(`/exam-types?${buildQuery(query)}`)
  },
  create(payload: ExamTypeFormPayload): Promise<ExamTypeDetail> {
    return api.post<ExamTypeDetail>("/exam-types", payload)
  },
  update(id: string, payload: Partial<ExamTypeFormPayload>): Promise<ExamTypeDetail> {
    return api.patch<ExamTypeDetail>(`/exam-types/${id}`, payload)
  },
}

// Grading bands.
export const gradingBandsService = {
  list(query: GradingBandsQuery): Promise<GradingBandListResult> {
    return api.get<GradingBandListResult>(`/grading-bands?${buildQuery(query)}`)
  },
  create(payload: GradingBandFormPayload): Promise<GradingBandDetail> {
    return api.post<GradingBandDetail>("/grading-bands", payload)
  },
  update(id: string, payload: Partial<GradingBandFormPayload>): Promise<GradingBandDetail> {
    return api.patch<GradingBandDetail>(`/grading-bands/${id}`, payload)
  },
}

// Period slots.
export const periodSlotsService = {
  list(query: PeriodSlotsQuery): Promise<PeriodSlotListResult> {
    return api.get<PeriodSlotListResult>(`/period-slots?${buildQuery(query)}`)
  },
  create(payload: PeriodSlotFormPayload): Promise<PeriodSlotDetail> {
    return api.post<PeriodSlotDetail>("/period-slots", payload)
  },
  update(id: string, payload: Partial<PeriodSlotFormPayload>): Promise<PeriodSlotDetail> {
    return api.patch<PeriodSlotDetail>(`/period-slots/${id}`, payload)
  },
}
