import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { timetableService } from "@/services/timetableService"
import type {
  TimetableEntryCopyDayPayload,
  TimetableEntryFormPayload,
  TimetableEntryListQuery,
} from "@/types/timetable"

const TIMETABLE_GROUP = ["timetable"] as const

export function useTimetableEntries(query: TimetableEntryListQuery) {
  return useQuery({
    queryKey: ["timetable", query],
    queryFn: () => timetableService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useCreateTimetableEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TimetableEntryFormPayload) => timetableService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMETABLE_GROUP })
      toast.success("Timetable entry created")
    },
    onError: (e: Error) => toast.error("Could not create entry", { description: e.message }),
  })
}

export function useUpdateTimetableEntry(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<TimetableEntryFormPayload>) =>
      timetableService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMETABLE_GROUP })
      toast.success("Timetable entry updated")
    },
    onError: (e: Error) => toast.error("Could not update entry", { description: e.message }),
  })
}

export function useDeleteTimetableEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => timetableService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMETABLE_GROUP })
      toast.success("Timetable entry deleted")
    },
    onError: (e: Error) => toast.error("Could not delete entry", { description: e.message }),
  })
}

export function useCopyTimetableDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TimetableEntryCopyDayPayload) => timetableService.copyDay(payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: TIMETABLE_GROUP })
      toast.success(`Copied ${result.copied} entries`)
    },
    onError: (e: Error) => toast.error("Could not copy day", { description: e.message }),
  })
}
