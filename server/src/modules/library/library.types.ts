import type {
  LibraryBorrowerType,
  LibraryCategory,
  LibraryCopyStatus,
} from "@prisma/client"
import type { LibraryLoanStatus } from "./library.rules.js"

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

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

export interface LibraryBorrowerOption {
  id: string
  type: LibraryBorrowerType
  name: string
  code: string | null
}