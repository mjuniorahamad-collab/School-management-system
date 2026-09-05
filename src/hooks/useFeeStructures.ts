import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { feeStructuresService } from "@/services/feeStructuresService"
import type { FeeStructureFormPayload, FeeStructuresQuery } from "@/types/fees"

const GROUP = ["fee-structures"] as const

export function useFeeStructures(query: FeeStructuresQuery) {
  return useQuery({
    queryKey: ["fee-structures", "list", query],
    queryFn: () => feeStructuresService.list(query),
  })
}

export function useFeeStructure(id: string | null) {
  return useQuery({
    queryKey: ["fee-structures", "detail", id],
    queryFn: () => feeStructuresService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useCreateFeeStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FeeStructureFormPayload) => feeStructuresService.create(payload),
    onSuccess: (structure) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Fee structure created", { description: structure.name })
    },
    onError: (e: Error) => toast.error("Could not create fee structure", { description: e.message }),
  })
}

export function useUpdateFeeStructure(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FeeStructureFormPayload) => feeStructuresService.update(id ?? "", payload),
    onSuccess: (structure) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Fee structure updated", { description: structure.name })
    },
    onError: (e: Error) => toast.error("Could not update fee structure", { description: e.message }),
  })
}