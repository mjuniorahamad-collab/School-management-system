import { describe, expect, it } from "vitest"
import {
  addDays,
  bookFormToPayload,
  defaultBookForm,
  defaultIssueForm,
  issueFormToPayload,
  LOAN_PERIOD_DAYS,
  toLocalDateString,
  todayLocalDate,
  validateBookForm,
  validateIssueForm,
} from "./libraryFormRules"

describe("libraryFormRules", () => {
  describe("date helpers", () => {
    it("formats a date as local YYYY-MM-DD", () => {
      expect(toLocalDateString(new Date(2026, 8, 7))).toBe("2026-09-07")
      expect(toLocalDateString(new Date(2026, 0, 3))).toBe("2026-01-03")
    })

    it("adds days across month boundaries", () => {
      expect(addDays("2026-09-07", 14)).toBe("2026-09-21")
      expect(addDays("2026-09-30", 3)).toBe("2026-10-03")
      expect(addDays("2026-12-28", 5)).toBe("2027-01-02")
    })

    it("todayLocalDate returns the local date string", () => {
      const today = new Date()
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate(),
      ).padStart(2, "0")}`
      expect(todayLocalDate()).toBe(expected)
    })

    it("default issue form has due date LOAN_PERIOD_DAYS after issue date", () => {
      const form = defaultIssueForm()
      expect(form.dueDate).toBe(addDays(form.issueDate, LOAN_PERIOD_DAYS))
    })
  })

  describe("book form", () => {
    it("rejects missing title and author", () => {
      const errors = validateBookForm(defaultBookForm())
      expect(errors.some((error) => error.field === "title")).toBe(true)
      expect(errors.some((error) => error.field === "author")).toBe(true)
    })

    it("accepts title and author only", () => {
      const form = { ...defaultBookForm(), title: "To Kill a Mockingbird", author: "Harper Lee" }
      expect(validateBookForm(form)).toEqual([])
    })

    it("trims values and drops empty optional fields", () => {
      const form = {
        ...defaultBookForm(),
        title: "  Clean Code  ",
        author: "  Robert C. Martin  ",
        isbn: " 978-0-13-235088-4 ",
      }
      const payload = bookFormToPayload(form)
      expect(payload).toEqual({
        title: "Clean Code",
        author: "Robert C. Martin",
        isbn: "978-0-13-235088-4",
        category: "OTHER",
      })
    })
  })

  describe("issue form", () => {
    it("rejects missing copy and borrower", () => {
      const form = defaultIssueForm()
      expect(validateIssueForm(form).some((error) => error.field === "copyId")).toBe(true)
      expect(validateIssueForm(form).some((error) => error.field === "borrowerId")).toBe(true)
    })

    it("rejects a due date before the issue date", () => {
      const form = {
        ...defaultIssueForm(),
        borrowerId: "borrower-1",
        copyId: "copy-1",
        issueDate: "2026-09-10",
        dueDate: "2026-09-09",
      }
      expect(validateIssueForm(form).some((error) => error.field === "dueDate")).toBe(true)
    })

    it("accepts a valid issue", () => {
      const form = {
        ...defaultIssueForm(),
        borrowerId: "borrower-1",
        copyId: "copy-1",
      }
      expect(validateIssueForm(form)).toEqual([])
    })

    it("omits empty notes from the payload", () => {
      const form = {
        ...defaultIssueForm(),
        borrowerId: "borrower-1",
        copyId: "copy-1",
      }
      expect(issueFormToPayload(form)).not.toHaveProperty("notes")
    })
  })
})