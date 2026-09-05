import { api } from "@/lib/apiClient"
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentDetail,
  PaymentListResult,
  PaymentQuery,
} from "@/types/fees"

function queryString(query: PaymentQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  if (query.invoiceId) params.set("invoiceId", query.invoiceId)
  if (query.method) params.set("method", query.method)
  if (query.from) params.set("from", query.from)
  if (query.to) params.set("to", query.to)
  if (query.search) params.set("search", query.search)
  if (query.sortBy) params.set("sortBy", query.sortBy)
  if (query.sortDir) params.set("sortDir", query.sortDir)
  return params.toString()
}

// Data seam for Fee Payments. Payments carry an idempotencyKey server-side so
// a retried submission replays the original payment + receipt instead of
// creating a duplicate.
export const paymentsService = {
  list(query: PaymentQuery = {}): Promise<PaymentListResult> {
    const qs = queryString(query)
    return api.get<PaymentListResult>(`/payments${qs ? `?${qs}` : ""}`)
  },
  get(id: string): Promise<PaymentDetail> {
    return api.get<PaymentDetail>(`/payments/${id}`)
  },
  create(payload: CreatePaymentInput): Promise<CreatePaymentResult> {
    return api.post<CreatePaymentResult>("/payments", payload)
  },
}