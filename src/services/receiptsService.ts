import { api } from "@/lib/apiClient"
import type { ReceiptDetail, ReceiptListResult, ReceiptQuery } from "@/types/fees"

function queryString(query: ReceiptQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  if (query.invoiceId) params.set("invoiceId", query.invoiceId)
  if (query.from) params.set("from", query.from)
  if (query.to) params.set("to", query.to)
  if (query.search) params.set("search", query.search)
  if (query.sortBy) params.set("sortBy", query.sortBy)
  if (query.sortDir) params.set("sortDir", query.sortDir)
  return params.toString()
}

// Data seam for Fee Receipts. Receipts are immutable: one receipt is issued per
// successful payment and there are intentionally no create/update/delete routes.
export const receiptsService = {
  list(query: ReceiptQuery = {}): Promise<ReceiptListResult> {
    const qs = queryString(query)
    return api.get<ReceiptListResult>(`/receipts${qs ? `?${qs}` : ""}`)
  },
  get(id: string): Promise<ReceiptDetail> {
    return api.get<ReceiptDetail>(`/receipts/${id}`)
  },
}