import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { feeInvoicesService } from "@/services/feeInvoicesService"
import type { GenerateInvoicesInput, InvoiceQuery } from "@/types/fees"

const GROUP = ["fee-invoices"] as const

export function useFeeInvoices(query: InvoiceQuery) {
  return useQuery({
    queryKey: ["fee-invoices", "list", query],
    queryFn: () => feeInvoicesService.list(query),
  })
}

export function useFeeInvoice(id: string | null) {
  return useQuery({
    queryKey: ["fee-invoices", "detail", id],
    queryFn: () => feeInvoicesService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useGenerationPreview(sessionId: string, classId: string) {
  return useQuery({
    queryKey: ["fee-invoices", "preview", sessionId, classId],
    queryFn: () => feeInvoicesService.generationPreview(sessionId, classId),
    enabled: Boolean(sessionId && classId),
  })
}

export function useGenerateInvoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: GenerateInvoicesInput) => feeInvoicesService.generate(payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: GROUP })
      qc.invalidateQueries({ queryKey: ["students"] })
      toast.success("Invoices generated", {
        description: `${result.generated} created, ${result.skippedExisting} already existed`,
      })
    },
    onError: (e: Error) => toast.error("Could not generate invoices", { description: e.message }),
  })
}