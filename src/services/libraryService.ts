import { api } from "@/lib/apiClient"
import type {
  LibraryBookDetail,
  LibraryBookFormPayload,
  LibraryBookListResult,
  LibraryBooksQuery,
  LibraryBorrowerOption,
  LibraryCopiesQuery,
  LibraryCopyDetail,
  LibraryCopyListResult,
  LibraryCopyStatusPayload,
  LibraryIssueLoanPayload,
  LibraryLoanDetail,
  LibraryLoanListResult,
  LibraryLoansQuery,
} from "@/types/library"

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  return params.toString()
}

// Data seam for the Library module. All calls hit the real REST API through the
// shared apiClient and return the unwrapped envelope payload.
export const libraryService = {
  listBooks(query: LibraryBooksQuery = {}): Promise<LibraryBookListResult> {
    const qs = queryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      category: query.category,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    })
    return api.get<LibraryBookListResult>(`/library/books${qs ? `?${qs}` : ""}`)
  },

  getBook(id: string): Promise<LibraryBookDetail> {
    return api.get<LibraryBookDetail>(`/library/books/${id}`)
  },

  createBook(payload: LibraryBookFormPayload): Promise<LibraryBookDetail> {
    return api.post<LibraryBookDetail>("/library/books", payload)
  },

  updateBook(id: string, payload: LibraryBookFormPayload): Promise<LibraryBookDetail> {
    return api.patch<LibraryBookDetail>(`/library/books/${id}`, payload)
  },

  listCopies(query: LibraryCopiesQuery = {}): Promise<LibraryCopyListResult> {
    const qs = queryString({ bookId: query.bookId, status: query.status, search: query.search })
    return api.get<LibraryCopyListResult>(`/library/copies${qs ? `?${qs}` : ""}`)
  },

  createCopy(bookId: string): Promise<LibraryCopyDetail> {
    return api.post<LibraryCopyDetail>("/library/copies", { bookId })
  },

  updateCopyStatus(id: string, payload: LibraryCopyStatusPayload): Promise<LibraryCopyDetail> {
    return api.patch<LibraryCopyDetail>(`/library/copies/${id}/status`, payload)
  },

  listLoans(query: LibraryLoansQuery = {}): Promise<LibraryLoanListResult> {
    const qs = queryString({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      search: query.search,
      bookId: query.bookId,
      borrowerType: query.borrowerType,
      borrowerId: query.borrowerId,
    })
    return api.get<LibraryLoanListResult>(`/library/loans${qs ? `?${qs}` : ""}`)
  },

  issueLoan(payload: LibraryIssueLoanPayload): Promise<LibraryLoanDetail> {
    return api.post<LibraryLoanDetail>("/library/loans", payload)
  },

  returnLoan(id: string): Promise<LibraryLoanDetail> {
    return api.post<LibraryLoanDetail>(`/library/loans/${id}/return`, {})
  },

  listBorrowers(type?: string, search?: string): Promise<LibraryBorrowerOption[]> {
    const qs = queryString({ type, search })
    return api.get<LibraryBorrowerOption[]>(`/library/borrowers${qs ? `?${qs}` : ""}`)
  },
}