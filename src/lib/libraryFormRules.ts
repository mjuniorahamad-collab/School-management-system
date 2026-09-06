import type {
  LibraryBookFormPayload,
  LibraryBorrowerType,
  LibraryCategory,
  LibraryIssueLoanPayload,
} from "@/types/library"

export const LOAN_PERIOD_DAYS = 14
export const MAX_ACTIVE_LOANS_PER_BORROWER = 5

const CATEGORIES: LibraryCategory[] = [
  "FICTION",
  "NON_FICTION",
  "REFERENCE",
  "TEXTBOOK",
  "MAGAZINE",
  "JOURNAL",
  "OTHER",
]

const BORROWER_TYPES: LibraryBorrowerType[] = ["STUDENT", "TEACHER", "STAFF"]

export interface BookFormValue {
  title: string
  author: string
  isbn: string
  publisher: string
  edition: string
  category: LibraryCategory
  language: string
  description: string
  coverUrl: string
}

export interface IssueFormValue {
  borrowerType: LibraryBorrowerType
  borrowerId: string
  borrowername: string
  bookId: string
  bookTitle: string
  copyId: string
  copyCode: string
  issueDate: string
  dueDate: string
  notes: string
}

export type BookFormError = { field: keyof BookFormValue; message: string }
export type IssueFormError = { field: keyof IssueFormValue; message: string }

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

export function todayLocalDate(): string {
  return toLocalDateString(new Date())
}

export function validateBookForm(value: BookFormValue): BookFormError[] {
  const errors: BookFormError[] = []
  if (!value.title.trim()) errors.push({ field: "title", message: "Book title is required" })
  if (!value.author.trim()) errors.push({ field: "author", message: "Author is required" })
  if (value.title.trim().length > 300) errors.push({ field: "title", message: "Title is too long" })
  if (value.author.trim().length > 200) errors.push({ field: "author", message: "Author name is too long" })
  if (value.isbn.trim().length > 30) errors.push({ field: "isbn", message: "ISBN is too long" })
  if (!CATEGORIES.includes(value.category)) errors.push({ field: "category", message: "Invalid category" })
  return errors
}

export function bookFormToPayload(value: BookFormValue): LibraryBookFormPayload {
  const payload: LibraryBookFormPayload = {
    title: value.title.trim(),
    author: value.author.trim(),
    category: value.category,
  }
  if (value.isbn.trim()) payload.isbn = value.isbn.trim()
  if (value.publisher.trim()) payload.publisher = value.publisher.trim()
  if (value.edition.trim()) payload.edition = value.edition.trim()
  if (value.language.trim()) payload.language = value.language.trim()
  if (value.description.trim()) payload.description = value.description.trim()
  if (value.coverUrl.trim()) payload.coverUrl = value.coverUrl.trim()
  return payload
}

export function defaultBookForm(): BookFormValue {
  return {
    title: "",
    author: "",
    isbn: "",
    publisher: "",
    edition: "",
    category: "OTHER",
    language: "",
    description: "",
    coverUrl: "",
  }
}

export function validateIssueForm(value: IssueFormValue): IssueFormError[] {
  const errors: IssueFormError[] = []
  if (!BORROWER_TYPES.includes(value.borrowerType)) {
    errors.push({ field: "borrowerType", message: "Select a borrower type" })
  }
  if (!value.borrowerId) errors.push({ field: "borrowerId", message: "Select a borrower" })
  if (!value.copyId) errors.push({ field: "copyId", message: "Select an available copy" })
  if (!value.issueDate) errors.push({ field: "issueDate", message: "Issue date is required" })
  if (!value.dueDate) errors.push({ field: "dueDate", message: "Due date is required" })
  if (value.issueDate && value.dueDate && value.dueDate < value.issueDate) {
    errors.push({ field: "dueDate", message: "Due date cannot be before the issue date" })
  }
  return errors
}

export function issueFormToPayload(value: IssueFormValue): LibraryIssueLoanPayload {
  const payload: LibraryIssueLoanPayload = {
    copyId: value.copyId,
    borrowerType: value.borrowerType,
    borrowerId: value.borrowerId,
    issueDate: value.issueDate,
    dueDate: value.dueDate,
  }
  if (value.notes.trim()) payload.notes = value.notes.trim()
  return payload
}

export function defaultIssueForm(): IssueFormValue {
  const today = todayLocalDate()
  return {
    borrowerType: "STUDENT",
    borrowerId: "",
    borrowername: "",
    bookId: "",
    bookTitle: "",
    copyId: "",
    copyCode: "",
    issueDate: today,
    dueDate: addDays(today, LOAN_PERIOD_DAYS),
    notes: "",
  }
}