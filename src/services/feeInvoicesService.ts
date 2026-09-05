import { api } from "@/lib/apiClient"
import type {
  FeeInvoiceDetail,
  FeeInvoiceListResult,
  GenerateInvoicesInput,
  GenerateInvoicesResult,
  GenerationPreviewResult,
  InvoiceQuery,
} from "@/types/fees"

function queryString(query: InvoiceQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  if (query.sessionId) params.set("sessionId", query.sessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.status) params.set("status", query.status)
  if (query.search) params.set("search", query.search)
  if (query.sortBy) params.set("sortBy", query.sortBy)
  if (query.sortDir) params.set("sortDir", query.sortDir)
  return params.toString()
}

// Data seam for Fee Invoices. Generation is idempotent server-side: re-running
// the endpoint only invoices students who do not have an invoice yet.
export const feeInvoicesService = {
  list(query: InvoiceQuery = {}): Promise<FeeInvoiceListResult> {
    const qs = queryString(query)
    return api.get<FeeInvoiceListResult>(`/fees/invoices${qs ? `?${qs}` : ""}`)
  },
  get(id: string): Promise<FeeInvoiceDetail> {
    return api.get<FeeInvoiceDetail>(`/fees/invoices/${id}`)
  },
  generationPreview(sessionId: string, classId: string): Promise<GenerationPreviewResult> {
    return api.get<GenerationPreviewResult>(
      `/fees/invoices/generation-preview?sessionId=${encodeURIComponent(sessionId)}&classId=${encodeURIComponent(classId)}`,
    )
  },
  generate(payload: GenerateInvoicesInput): Promise<GenerateInvoicesResult> {
    return api.post<GenerateInvoicesResult>("/fees/invoices/generate", payload)
  },
}