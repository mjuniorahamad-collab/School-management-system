import { describe, expect, it } from "vitest"
import {
  buildLibraryCopyCode,
  addDays,
  canTransitionCopyStatus,
  deriveLoanStatus,
  isCopyAvailableForIssue,
  joinName,
  normalizeBookIsbn,
  toLocalDateString,
} from "../src/modules/library/library.rules.js"
import {
  emptyCopyStatusCounts,
  toBookDetail,
  toBookListItem,
  toCopyDetail,
  toLoanListItem,
} from "../src/modules/library/library.mapper.js"

describe("library rules", () => {
  describe("buildLibraryCopyCode", () => {
    it("zero-pads the sequence to four digits", () => {
      expect(buildLibraryCopyCode(1)).toBe("LIB-0001")
      expect(buildLibraryCopyCode(42)).toBe("LIB-0042")
      expect(buildLibraryCopyCode(999)).toBe("LIB-0999")
    })

    it("passes through larger sequences without truncating", () => {
      expect(buildLibraryCopyCode(12345)).toBe("LIB-12345")
    })
  })

  describe("date helpers", () => {
    it("formats a date as a UTC YYYY-MM-DD string", () => {
      expect(toLocalDateString(new Date(Date.UTC(2026, 0, 2)))).toBe("2026-01-02")
      expect(toLocalDateString(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12-31")
    })

    it("adds days across month and year boundaries", () => {
      expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
      expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
      expect(addDays("2026-12-25", 7)).toBe("2027-01-01")
      expect(addDays("2026-09-07", 14)).toBe("2026-09-21")
    })
  })

  describe("joinName", () => {
    it("joins first, middle and last names, dropping empty parts", () => {
      expect(joinName("Ada", "May", "Lovelace")).toBe("Ada May Lovelace")
      expect(joinName("Ada", null, "Lovelace")).toBe("Ada Lovelace")
      expect(joinName("Ada", "", "")).toBe("Ada")
    })
  })

  describe("normalizeBookIsbn", () => {
    it("trims and removes interior whitespace", () => {
      expect(normalizeBookIsbn("  978-0-06  112008-4 ")).toBe("978-0-06112008-4")
      expect(normalizeBookIsbn("123")).toBe("123")
    })
  })

  describe("deriveLoanStatus", () => {
    it("returns RETURNED for any returned loan", () => {
      expect(deriveLoanStatus("2026-09-10", "2026-09-01", "2026-09-10")).toBe("RETURNED")
    })

    it("marks loans as OVERDUE when the due date has passed", () => {
      expect(deriveLoanStatus(null, "2026-09-01", "2026-09-10")).toBe("OVERDUE")
    })

    it("keeps loans ON_LOAN until the due date", () => {
      expect(deriveLoanStatus(null, "2026-09-10", "2026-09-10")).toBe("ON_LOAN")
      expect(deriveLoanStatus(null, "2026-09-11", "2026-09-10")).toBe("ON_LOAN")
    })
  })

  describe("copy status transitions", () => {
    it("allows self-transitions", () => {
      expect(canTransitionCopyStatus("AVAILABLE", "AVAILABLE").ok).toBe(true)
    })

    it("refuses to flip an ISSUED copy directly", () => {
      const result = canTransitionCopyStatus("ISSUED", "AVAILABLE")
      expect(result.ok).toBe(false)
      expect(result.reason).toContain("returned")
    })

    it("refuses to set ISSUED through the status endpoint", () => {
      const result = canTransitionCopyStatus("AVAILABLE", "ISSUED")
      expect(result.ok).toBe(false)
      expect(result.reason).toContain("issue flow")
    })

    it("allows AVAILABLE <-> LOST/MAINTENANCE", () => {
      expect(canTransitionCopyStatus("AVAILABLE", "LOST").ok).toBe(true)
      expect(canTransitionCopyStatus("LOST", "AVAILABLE").ok).toBe(true)
      expect(canTransitionCopyStatus("AVAILABLE", "MAINTENANCE").ok).toBe(true)
      expect(canTransitionCopyStatus("MAINTENANCE", "LOST").ok).toBe(true)
    })
  })

  describe("isCopyAvailableForIssue", () => {
    it("only lets AVAILABLE copies be issued", () => {
      expect(isCopyAvailableForIssue("AVAILABLE")).toBe(true)
      expect(isCopyAvailableForIssue("ISSUED")).toBe(false)
      expect(isCopyAvailableForIssue("LOST")).toBe(false)
      expect(isCopyAvailableForIssue("MAINTENANCE")).toBe(false)
    })
  })
})

describe("library mappers", () => {
  const bookFields = {
    id: "book-1",
    title: "To Kill a Mockingbird",
    author: "Harper Lee",
    isbn: "978-0-0611",
    publisher: "J.B. Lippincott",
    edition: "1st",
    category: "FICTION" as const,
    language: "English",
    isActive: true,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-02T00:00:00.000Z"),
  }

  it("maps a book list item with copy counts", () => {
    const item = toBookListItem(bookFields, { totalCopies: 3, availableCopies: 1 })
    expect(item.title).toBe("To Kill a Mockingbird")
    expect(item.totalCopies).toBe(3)
    expect(item.availableCopies).toBe(1)
    expect(item.createdAt).toBe("2026-09-01T00:00:00.000Z")
  })

  it("maps a book detail with copy status counts and description", () => {
    const counts = emptyCopyStatusCounts()
    counts.AVAILABLE = 2
    counts.ISSUED = 1
    const detail = toBookDetail({ ...bookFields, description: "A classic", coverUrl: "https://x/y.jpg" }, counts)
    expect(detail.description).toBe("A classic")
    expect(detail.coverUrl).toBe("https://x/y.jpg")
    expect(detail.copies).toEqual({ AVAILABLE: 2, ISSUED: 1, LOST: 0, MAINTENANCE: 0 })
    expect(detail.totalCopies).toBe(3)
    expect(detail.availableCopies).toBe(2)
  })

  it("maps a copy detail with nested book info", () => {
    const copy = toCopyDetail(
      {
        id: "copy-1",
        copyCode: "LIB-0001",
        status: "AVAILABLE" as const,
        note: null,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      { id: "book-1", title: "To Kill a Mockingbird", author: "Harper Lee" },
    )
    expect(copy.copyCode).toBe("LIB-0001")
    expect(copy.bookTitle).toBe("To Kill a Mockingbird")
    expect(copy.bookAuthor).toBe("Harper Lee")
  })

  it("maps a loan list item with derived status and actor names", () => {
    const loan = toLoanListItem(
      {
        id: "loan-1",
        copyId: "copy-1",
        borrowerType: "STUDENT" as const,
        borrowerId: "student-1",
        borrowerName: "Ada Lovelace",
        borrowerCode: "ADM-2026-0001",
        issuedAt: new Date("2026-09-01T00:00:00.000Z"),
        dueAt: new Date(Date.UTC(2026, 8, 15)),
        returnedAt: null,
        notes: null,
      },
      { copyCode: "LIB-0001", book: { id: "book-1", title: "To Kill a Mockingbird" } },
      { issuedByName: "Grace Admin", returnedByName: null },
      "2026-09-20",
    )
    expect(loan.issuedAt).toBe("2026-09-01")
    expect(loan.dueAt).toBe("2026-09-15")
    expect(loan.status).toBe("OVERDUE")
    expect(loan.issuedByName).toBe("Grace Admin")
  })

  it("reports RETURNED for a returned loan and formats the return date", () => {
    const loan = toLoanListItem(
      {
        id: "loan-2",
        copyId: "copy-1",
        borrowerType: "TEACHER" as const,
        borrowerId: "teacher-1",
        borrowerName: "Grace Hopper",
        borrowerCode: "T-101",
        issuedAt: new Date("2026-09-01T00:00:00.000Z"),
        dueAt: new Date(Date.UTC(2026, 8, 15)),
        returnedAt: new Date("2026-09-09T00:00:00.000Z"),
        notes: null,
      },
      { copyCode: "LIB-0001", book: { id: "book-1", title: "To Kill a Mockingbird" } },
      { issuedByName: null, returnedByName: "Grace Admin" },
      "2026-09-10",
    )
    expect(loan.status).toBe("RETURNED")
    expect(loan.returnedAt).toBe("2026-09-09")
    expect(loan.returnedByName).toBe("Grace Admin")
  })
})