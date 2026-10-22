import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  examTypesService,
  feeHeadsService,
  gradingBandsService,
  periodSlotsService,
} from "@/services/masterDataService"
import type {
  ExamTypeFormPayload,
  ExamTypesQuery,
  FeeHeadFormPayload,
  FeeHeadsQuery,
  GradingBandFormPayload,
  GradingBandsQuery,
  PeriodSlotFormPayload,
  PeriodSlotsQuery,
} from "@/types/masterData"

const QUERY_KEYS = {
  feeHeadsList: (q: FeeHeadsQuery) => ["fee-heads", "list", q] as const,
  examTypesList: (q: ExamTypesQuery) => ["exam-types", "list", q] as const,
  gradingBandsList: (q: GradingBandsQuery) => ["grading-bands", "list", q] as const,
  periodSlotsList: (q: PeriodSlotsQuery) => ["period-slots", "list", q] as const,
}

const GROUPS = {
  feeHeads: ["fee-heads"] as const,
  examTypes: ["exam-types"] as const,
  gradingBands: ["grading-bands"] as const,
  periodSlots: ["period-slots"] as const,
}

// Fee heads.
export function useFeeHeads(query: FeeHeadsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.feeHeadsList(query),
    queryFn: () => feeHeadsService.list(query),
  })
}
export function useCreateFeeHead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FeeHeadFormPayload) => feeHeadsService.create(payload),
    onSuccess: (fh) => {
      qc.invalidateQueries({ queryKey: GROUPS.feeHeads })
      toast.success("Fee head created", { description: `${fh.name} (${fh.code})` })
    },
    onError: (e: Error) => toast.error("Could not create fee head", { description: e.message }),
  })
}
export function useUpdateFeeHead(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<FeeHeadFormPayload>) => feeHeadsService.update(id, payload),
    onSuccess: (fh) => {
      qc.invalidateQueries({ queryKey: GROUPS.feeHeads })
      toast.success("Fee head updated", { description: fh.name })
    },
    onError: (e: Error) => toast.error("Could not update fee head", { description: e.message }),
  })
}

// Exam types.
export function useExamTypes(query: ExamTypesQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.examTypesList(query),
    queryFn: () => examTypesService.list(query),
  })
}
export function useCreateExamType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ExamTypeFormPayload) => examTypesService.create(payload),
    onSuccess: (et) => {
      qc.invalidateQueries({ queryKey: GROUPS.examTypes })
      toast.success("Exam type created", { description: `${et.name} (${et.code})` })
    },
    onError: (e: Error) => toast.error("Could not create exam type", { description: e.message }),
  })
}
export function useUpdateExamType(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<ExamTypeFormPayload>) => examTypesService.update(id, payload),
    onSuccess: (et) => {
      qc.invalidateQueries({ queryKey: GROUPS.examTypes })
      toast.success("Exam type updated", { description: et.name })
    },
    onError: (e: Error) => toast.error("Could not update exam type", { description: e.message }),
  })
}

// Grading bands.
export function useGradingBands(query: GradingBandsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.gradingBandsList(query),
    queryFn: () => gradingBandsService.list(query),
  })
}
export function useCreateGradingBand() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: GradingBandFormPayload) => gradingBandsService.create(payload),
    onSuccess: (gb) => {
      qc.invalidateQueries({ queryKey: GROUPS.gradingBands })
      toast.success("Grading band created", { description: `Grade ${gb.grade}` })
    },
    onError: (e: Error) => toast.error("Could not create grading band", { description: e.message }),
  })
}
export function useUpdateGradingBand(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<GradingBandFormPayload>) => gradingBandsService.update(id, payload),
    onSuccess: (gb) => {
      qc.invalidateQueries({ queryKey: GROUPS.gradingBands })
      toast.success("Grading band updated", { description: `Grade ${gb.grade}` })
    },
    onError: (e: Error) => toast.error("Could not update grading band", { description: e.message }),
  })
}

// Period slots.
export function usePeriodSlots(query: PeriodSlotsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.periodSlotsList(query),
    queryFn: () => periodSlotsService.list(query),
  })
}
export function useCreatePeriodSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PeriodSlotFormPayload) => periodSlotsService.create(payload),
    onSuccess: (ps) => {
      qc.invalidateQueries({ queryKey: GROUPS.periodSlots })
      toast.success("Period slot created", { description: ps.name })
    },
    onError: (e: Error) => toast.error("Could not create period slot", { description: e.message }),
  })
}
export function useUpdatePeriodSlot(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<PeriodSlotFormPayload>) => periodSlotsService.update(id, payload),
    onSuccess: (ps) => {
      qc.invalidateQueries({ queryKey: GROUPS.periodSlots })
      toast.success("Period slot updated", { description: ps.name })
    },
    onError: (e: Error) => toast.error("Could not update period slot", { description: e.message }),
  })
}

// Lifecycle (deactivate / reactivate) mutations. Each targets the row id passed
// at call time, so a table row can toggle itself without rebuilding hooks.
export function useSetFeeHeadActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      feeHeadsService.update(id, { isActive }),
    onSuccess: (fh) => {
      qc.invalidateQueries({ queryKey: GROUPS.feeHeads })
      toast.success(fh.isActive ? "Fee head activated" : "Fee head deactivated", {
        description: fh.name,
      })
    },
    onError: (e: Error) => toast.error("Could not update fee head status", { description: e.message }),
  })
}

export function useSetExamTypeActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      examTypesService.update(id, { isActive }),
    onSuccess: (et) => {
      qc.invalidateQueries({ queryKey: GROUPS.examTypes })
      toast.success(et.isActive ? "Exam type activated" : "Exam type deactivated", {
        description: et.name,
      })
    },
    onError: (e: Error) => toast.error("Could not update exam type status", { description: e.message }),
  })
}

export function useSetGradingBandActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      gradingBandsService.update(id, { isActive }),
    onSuccess: (gb) => {
      qc.invalidateQueries({ queryKey: GROUPS.gradingBands })
      toast.success(gb.isActive ? "Grading band activated" : "Grading band deactivated", {
        description: `Grade ${gb.grade}`,
      })
    },
    onError: (e: Error) => toast.error("Could not update grading band status", { description: e.message }),
  })
}

export function useSetPeriodSlotActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      periodSlotsService.update(id, { isActive }),
    onSuccess: (ps) => {
      qc.invalidateQueries({ queryKey: GROUPS.periodSlots })
      toast.success(ps.isActive ? "Period slot activated" : "Period slot deactivated", {
        description: ps.name,
      })
    },
    onError: (e: Error) => toast.error("Could not update period slot status", { description: e.message }),
  })
}
