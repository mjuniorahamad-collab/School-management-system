// Domain types for the Library module — books, copies, loans and borrowers.
// Mirrors the backend contracts under server/src/modules/library/. Keep the two
// sides in sync when the API changes.

export const LIBRARY_CATEGORY_OPTIONS = [
  "FICTION",
  "NON_FICTION",
  "REFERENCE",
  "TEXTBOOK",
  "MAGAZINE",
  "JOURNAL",
  "OTHER",
] as const
export type LibraryCategory = (typeof LIBRARY_CATEGORY_OPTIONS)[number]

export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  FICTION: "Fiction",
  NON_FICTION: "Non-fiction",
  REFERENCE: "Reference",
  TEXTBOOK: "Textbook",
  MAGAZINE: "Magazine",
  JOURNAL: "Journal",
  OTHER: "Other",
}

export const LIBRARY_COPY_STATUS_OPTIONS = ["AVAILABLE", "ISSUED", "LOST", "MAINTENANCE"] as const
export type LibraryCopyStatus = (typeof LIBRARY_COPY_STATUS_OPTIONS)[number]

export const LIBRARY_COPY_STATUS_LABELS: Record<LibraryCopyStatus, string> = {
  AVAILABLE: "Available",
  ISSUED: "Issued",
  LOST: "Lost",
  MAINTENANCE: "Maintenance",
}

export const LIBRARY_BORROWER_TYPE_OPTIONS = ["STUDENT", "TEACHER", "STAFF"] as const
export type LibraryBorrowerType = (typeof LIBRARY_BORROWER_TYPE_OPTIONS)[number]

export const LIBRARY_BORROWER_TYPE_LABELS: Record<LibraryBorrowerType, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  STAFF: "Staff",
}

export const LIBRARY_LOAN_STATUS_OPTIONS = ["ON_LOAN", "OVERDUE", "RETURNED"] as const
export type LibraryLoanStatus = (typeof LIBRARY_LOAN_STATUS_OPTIONS)[number]

export const LIBRARY_LOAN_STATUS_LABELS: Record<LibraryLoanStatus, string> = {
  ON_LOAN: "On loan",
  OVERDUE: "Overdue",
  RETURNED: "Returned",
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ------------------------- Books -------------------------

export interface LibraryBookListItem {
  id: string
  title: string
  author: string
  isbn: string | null
  publisher: string | null
  edition: string | null
  category: LibraryCategory
  language: string | null
  isActive: boolean
  totalCopies: number
  availableCopies: number
  createdAt: string
  updatedAt: string
}

export interface LibraryCopyStatusCounts {
  AVAILABLE: number
  ISSUED: number
  LOST: number
  MAINTENANCE: number
}

export interface LibraryBookDetail extends Omit<LibraryBookListItem, "totalCopies" | "availableCopies"> {
  description: string | null
  coverUrl: string | null
  totalCopies: number
  availableCopies: number
  copies: LibraryCopyStatusCounts
}

export interface LibraryBookListResult {
  items: LibraryBookListItem[]
  pagination: Pagination
}

export interface LibraryBookFormPayload {
  title: string
  author: string
  isbn?: string
  publisher?: string
  edition?: string
  category?: LibraryCategory
  language?: string
  description?: string
  coverUrl?: string
  isActive?: boolean
}

export interface LibraryBooksQuery {
  page?: number
  pageSize?: number
  search?: string
  category?: LibraryCategory
  isActive?: string
  sortBy?: "title" | "author" | "updatedAt"
  sortDir?: "asc" | "desc"
}

// ------------------------- Copies -------------------------

export interface LibraryCopyDetail {
  id: string
  copyCode: string
  bookId: string
  bookTitle: string
  bookAuthor: string
  status: LibraryCopyStatus
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface LibraryCopyListResult {
  items: LibraryCopyDetail[]
  total: number
}

export interface LibraryCopiesQuery {
  bookId?: string
  status?: LibraryCopyStatus
  search?: string
}

export interface LibraryCopyStatusPayload {
  status: Exclude<LibraryCopyStatus, "ISSUED">
  note?: string
}

// ------------------------- Loans -------------------------

export interface LibraryLoanListItem {
  id: string
  copyId: string
  copyCode: string
  bookId: string
  bookTitle: string
  borrowerType: LibraryBorrowerType
  borrowerId: string
  borrowerName: string
  borrowerCode: string | null
  issuedAt: string
  dueAt: string
  returnedAt: string | null
  status: LibraryLoanStatus
  notes: string | null
  issuedByName: string | null
  returnedByName: string | null
}

export type LibraryLoanDetail = LibraryLoanListItem

export interface LibraryLoanListResult {
  items: LibraryLoanListItem[]
  pagination: Pagination
}

export interface LibraryIssueLoanPayload {
  copyId: string
  borrowerType: LibraryBorrowerType
  borrowerId: string
  issueDate?: string
  dueDate?: string
  notes?: string
}

export interface LibraryLoansQuery {
  page?: number
  pageSize?: number
  status?: "active" | "overdue" | "returned"
  search?: string
  bookId?: string
  borrowerType?: LibraryBorrowerType
  borrowerId?: string
}

// ------------------------- Borrowers -------------------------

export interface LibraryBorrowerOption {
  id: string
  type: LibraryBorrowerType
  name: string
  code: string | null
}