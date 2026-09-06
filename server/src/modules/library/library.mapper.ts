import type { LibraryBook, LibraryCopy, LibraryLoan } from "@prisma/client"
import { deriveLoanStatus, todayLocalDate } from "./library.rules.js"
import type {
  LibraryBookDetail,
  LibraryBookListItem,
  LibraryCopyDetail,
  LibraryCopyStatusCounts,
  LibraryLoanListItem,
} from "./library.types.js"

export function emptyCopyStatusCounts(): LibraryCopyStatusCounts {
  return { AVAILABLE: 0, ISSUED: 0, LOST: 0, MAINTENANCE: 0 }
}

export function toBookListItem(
  book: Pick<
    LibraryBook,
    | "id"
    | "title"
    | "author"
    | "isbn"
    | "publisher"
    | "edition"
    | "category"
    | "language"
    | "isActive"
    | "createdAt"
    | "updatedAt"
  >,
  counts: { totalCopies: number; availableCopies: number },
): LibraryBookListItem {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    publisher: book.publisher,
    edition: book.edition,
    category: book.category,
    language: book.language,
    isActive: book.isActive,
    totalCopies: counts.totalCopies,
    availableCopies: counts.availableCopies,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  }
}

export function toBookDetail(
  book: Pick<
    LibraryBook,
    | "id"
    | "title"
    | "author"
    | "isbn"
    | "publisher"
    | "edition"
    | "category"
    | "language"
    | "description"
    | "coverUrl"
    | "isActive"
    | "createdAt"
    | "updatedAt"
  >,
  counts: LibraryCopyStatusCounts,
): LibraryBookDetail {
  const totalCopies =
    counts.AVAILABLE + counts.ISSUED + counts.LOST + counts.MAINTENANCE
  const item = toBookListItem(book, { totalCopies, availableCopies: counts.AVAILABLE })
  return {
    ...item,
    description: book.description,
    coverUrl: book.coverUrl,
    copies: counts,
  }
}

export function toCopyDetail(
  copy: Pick<LibraryCopy, "id" | "copyCode" | "status" | "note" | "createdAt" | "updatedAt">,
  book: { id: string; title: string; author: string },
): LibraryCopyDetail {
  return {
    id: copy.id,
    copyCode: copy.copyCode,
    bookId: book.id,
    bookTitle: book.title,
    bookAuthor: book.author,
    status: copy.status,
    note: copy.note,
    createdAt: copy.createdAt.toISOString(),
    updatedAt: copy.updatedAt.toISOString(),
  }
}

export function toLoanListItem(
  loan: Pick<
    LibraryLoan,
    | "id"
    | "copyId"
    | "borrowerType"
    | "borrowerId"
    | "borrowerName"
    | "borrowerCode"
    | "issuedAt"
    | "dueAt"
    | "returnedAt"
    | "notes"
  >,
  copy: { copyCode: string; book: { id: string; title: string } },
  actors: { issuedByName: string | null; returnedByName: string | null },
  today = todayLocalDate(),
): LibraryLoanListItem {
  return {
    id: loan.id,
    copyId: loan.copyId,
    copyCode: copy.copyCode,
    bookId: copy.book.id,
    bookTitle: copy.book.title,
    borrowerType: loan.borrowerType,
    borrowerId: loan.borrowerId,
    borrowerName: loan.borrowerName,
    borrowerCode: loan.borrowerCode,
    issuedAt: toDateString(loan.issuedAt),
    dueAt: toDateString(loan.dueAt),
    returnedAt: loan.returnedAt ? toDateString(loan.returnedAt) : null,
    status: deriveLoanStatus(loan.returnedAt, loan.dueAt, today),
    notes: loan.notes,
    issuedByName: actors.issuedByName,
    returnedByName: actors.returnedByName,
  }
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10)
}