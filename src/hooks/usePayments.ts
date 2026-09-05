import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { paymentsService } from "@/services/paymentsService"
import type { CreatePaymentInput, PaymentQuery } from "@/types/fees"

const PAYMENTS_GROUP = ["payments"] as const
const INVOICES_GROUP = ["fee-invoices"] as const
const RECEIPTS_GROUP = ["receipts"] as const

export function usePayments(query: PaymentQuery) {
  return useQuery({
    queryKey: ["payments", "list", query],
    queryFn: () => paymentsService.list(query),
  })
}

export function usePayment(id: string | null) {
  return useQuery({
    queryKey: ["payments", "detail", id],
    queryFn: () => paymentsService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useCreatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePaymentInput) => paymentsService.create(payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: PAYMENTS_GROUP })
      qc.invalidateQueries({ queryKey: INVOICES_GROUP })
      qc.invalidateQueries({ queryKey: RECEIPTS_GROUP })
      if (result.replayed) {
        toast.info("Payment already recorded", {
          description: "This submission was retried; the original payment and receipt were returned.",
        })
      } else if (result.receipt) {
        toast.success("Payment recorded", {
          description: `Receipt ${result.receipt.receiptNumber} issued`,
        })
      }
    },
    onError: (e: Error) => toast.error("Could not record payment", { description: e.message }),
  })
}