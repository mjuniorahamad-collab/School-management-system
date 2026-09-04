import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { assignmentsService } from "@/services/assignmentsService"
import type { AssignmentFormPayload, AssignmentsQuery } from "@/types/assignments"

const ASSIGNMENTS_GROUP = ["assignments"] as const

export function useAssignmentsList(query: AssignmentsQuery) {
  return useQuery({
    queryKey: ["assignments", "list", query],
    queryFn: () => assignmentsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useAssignmentsContext() {
  return useQuery({
    queryKey: ["assignments", "context"],
    queryFn: () => assignmentsService.context(),
    staleTime: 5 * 60_000,
  })
}

export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: AssignmentFormPayload) => assignmentsService.create(payload),
    onSuccess: (assignment) => {
      qc.invalidateQueries({ queryKey: ASSIGNMENTS_GROUP })
      toast.success("Assignment created", { description: assignment.title })
    },
    onError: (e: Error) => toast.error("Could not create assignment", { description: e.message }),
  })
}

export function useUpdateAssignment(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<AssignmentFormPayload>) => assignmentsService.update(id, payload),
    onSuccess: (assignment) => {
      qc.invalidateQueries({ queryKey: ASSIGNMENTS_GROUP })
      toast.success("Assignment updated", { description: assignment.title })
    },
    onError: (e: Error) => toast.error("Could not update assignment", { description: e.message }),
  })
}

/** Publishes a draft assignment (the server stamps `publishedAt`). */
export function usePublishAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => assignmentsService.update(id, { status: "PUBLISHED" }),
    onSuccess: (assignment) => {
      qc.invalidateQueries({ queryKey: ASSIGNMENTS_GROUP })
      toast.success("Assignment published", { description: assignment.title })
    },
    onError: (e: Error) => toast.error("Could not publish assignment", { description: e.message }),
  })
}

export function useDeleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => assignmentsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ASSIGNMENTS_GROUP })
      toast.success("Assignment deleted")
    },
    onError: (e: Error) => toast.error("Could not delete assignment", { description: e.message }),
  })
}