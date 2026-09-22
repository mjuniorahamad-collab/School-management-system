import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { concessionsService } from "@/services/concessionsService"
import { formatINR } from "@/lib/format"
import type {
  AdjustActionInput,
  AdjustmentDetail,
  AdjustmentQuery,
  OverrideAdjustmentInput,
  RequestAdjustmentInput,
} from "@/types/concessions"

const CONCESSIONS_GROUP = ["concessions"] as const
const INVOICES_GROUP = ["fee-invoices"] as const

/** "₹5,000" for fixed amounts, "10%" for percentages. */
function describeValue(detail: AdjustmentDetail): string {
  return detail.kind === "PERCENTAGE" ? `${detail.value}%` : formatINR(detail.computedAmount)
}

function invalidateAfterConcessionChange(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: CONCESSIONS_GROUP })
  // Approving/reversing a concession changes invoice totals and balances.
  queryClient.invalidateQueries({ queryKey: INVOICES_GROUP })
}

export function useConcessions(query: AdjustmentQuery) {
  return useQuery({
    queryKey: ["concessions", "list", query],
    queryFn: () => concessionsService.list(query),
  })
}

export function useConcession(id: string | null) {
  return useQuery({
    queryKey: ["concessions", "detail", id],
    queryFn: () => concessionsService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useRequestConcession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RequestAdjustmentInput) => concessionsService.request(payload),
    onSuccess: (detail) => {
      invalidateAfterConcessionChange(queryClient)
      toast.success("Concession requested", {
        description: `A ${describeValue(detail)} concession for ${detail.student.fullName} is awaiting approval.`,
      })
    },
    onError: (error: Error) => toast.error("Could not request concession", { description: error.message }),
  })
}

export function useApproveConcession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => concessionsService.approve(id),
    onSuccess: (detail) => {
      invalidateAfterConcessionChange(queryClient)
      toast.success("Concession approved", {
        description: `${detail.student.fullName}'s ${describeValue(detail)} concession was applied to the invoice.`,
      })
    },
    onError: (error: Error) => toast.error("Could not approve concession", { description: error.message }),
  })
}

export function useOverrideConcession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OverrideAdjustmentInput }) =>
      concessionsService.override(id, payload),
    onSuccess: (detail) => {
      invalidateAfterConcessionChange(queryClient)
      toast.success("Concession overridden and approved", {
        description: `${detail.student.fullName}'s ${describeValue(detail)} concession was applied.`,
      })
    },
    onError: (error: Error) => toast.error("Could not override concession", { description: error.message }),
  })
}

export function useRejectConcession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdjustActionInput }) =>
      concessionsService.reject(id, payload),
    onSuccess: (detail) => {
      invalidateAfterConcessionChange(queryClient)
      toast.success("Concession rejected", {
        description: `The concession for ${detail.student.fullName} was rejected.`,
      })
    },
    onError: (error: Error) => toast.error("Could not reject concession", { description: error.message }),
  })
}

export function useCancelConcession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => concessionsService.cancel(id),
    onSuccess: (detail) => {
      invalidateAfterConcessionChange(queryClient)
      toast.success("Concession cancelled", {
        description: `The concession for ${detail.student.fullName} was cancelled.`,
      })
    },
    onError: (error: Error) => toast.error("Could not cancel concession", { description: error.message }),
  })
}

export function useReverseConcession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => concessionsService.reverse(id),
    onSuccess: (detail) => {
      invalidateAfterConcessionChange(queryClient)
      toast.success("Concession reversed", {
        description: `The ${describeValue(detail)} concession for ${detail.student.fullName} was undone and the invoice schedule restored.`,
      })
    },
    onError: (error: Error) => toast.error("Could not reverse concession", { description: error.message }),
  })
}