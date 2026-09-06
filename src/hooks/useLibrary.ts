import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { libraryService } from "@/services/libraryService"
import type {
  LibraryBookFormPayload,
  LibraryBooksQuery,
  LibraryCopiesQuery,
  LibraryCopyStatusPayload,
  LibraryIssueLoanPayload,
  LibraryLoansQuery,
} from "@/types/library"

const GROUP = ["library"] as const

// Books

export function useLibraryBooks(query: LibraryBooksQuery) {
  return useQuery({
    queryKey: ["library", "books", query],
    queryFn: () => libraryService.listBooks(query),
  })
}

export function useLibraryBook(id: string | null) {
  return useQuery({
    queryKey: ["library", "book", id],
    queryFn: () => libraryService.getBook(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useCreateLibraryBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LibraryBookFormPayload) => libraryService.createBook(payload),
    onSuccess: (book) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Book added", { description: book.title })
    },
    onError: (e: Error) => toast.error("Could not add book", { description: e.message }),
  })
}

export function useUpdateLibraryBook(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LibraryBookFormPayload) => libraryService.updateBook(id ?? "", payload),
    onSuccess: (book) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Book updated", { description: book.title })
    },
    onError: (e: Error) => toast.error("Could not update book", { description: e.message }),
  })
}

// Copies

export function useLibraryCopies(query: LibraryCopiesQuery, enabled = true) {
  return useQuery({
    queryKey: ["library", "copies", query],
    queryFn: () => libraryService.listCopies(query),
    enabled,
  })
}

export function useCreateLibraryCopy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (bookId: string) => libraryService.createCopy(bookId),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Copy added", { description: `${copy.copyCode} · ${copy.bookTitle}` })
    },
    onError: (e: Error) => toast.error("Could not add copy", { description: e.message }),
  })
}

export function useUpdateLibraryCopyStatus(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LibraryCopyStatusPayload) =>
      libraryService.updateCopyStatus(id ?? "", payload),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Copy updated", { description: copy.copyCode })
    },
    onError: (e: Error) => toast.error("Could not update copy", { description: e.message }),
  })
}

// Loans

export function useLibraryLoans(query: LibraryLoansQuery) {
  return useQuery({
    queryKey: ["library", "loans", query],
    queryFn: () => libraryService.listLoans(query),
  })
}

export function useIssueLibraryLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LibraryIssueLoanPayload) => libraryService.issueLoan(payload),
    onSuccess: (loan) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Book issued", {
        description: `${loan.bookTitle} → ${loan.borrowerName}`,
      })
    },
    onError: (e: Error) => toast.error("Could not issue book", { description: e.message }),
  })
}

export function useReturnLibraryLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => libraryService.returnLoan(id),
    onSuccess: (loan) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Book returned", { description: `${loan.bookTitle} · ${loan.copyCode}` })
    },
    onError: (e: Error) => toast.error("Could not return book", { description: e.message }),
  })
}

// Borrowers

export function useLibraryBorrowers(type: string | undefined, search: string, enabled = true) {
  return useQuery({
    queryKey: ["library", "borrowers", type, search],
    queryFn: () => libraryService.listBorrowers(type, search),
    enabled,
    staleTime: 30_000,
  })
}