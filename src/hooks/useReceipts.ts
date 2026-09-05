import { useQuery } from "@tanstack/react-query"
import { receiptsService } from "@/services/receiptsService"
import type { ReceiptQuery } from "@/types/fees"

export function useReceipts(query: ReceiptQuery) {
  return useQuery({
    queryKey: ["receipts", "list", query],
    queryFn: () => receiptsService.list(query),
  })
}

export function useReceipt(id: string | null) {
  return useQuery({
    queryKey: ["receipts", "detail", id],
    queryFn: () => receiptsService.get(id ?? ""),
    enabled: Boolean(id),
  })
}