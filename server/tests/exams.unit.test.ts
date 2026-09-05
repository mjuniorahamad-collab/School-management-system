import { describe, expect, it } from "vitest"
import {
  EXAM_STATUSES,
  canArchiveExam,
  canFinalizeExam,
  canPublishExam,
  canReopenExam,
} from "../src/modules/exams/exam.rules.js"

describe("exam lifecycle rules (database-free)", () => {
  it("enumerates the four exam statuses in order", () => {
    expect(EXAM_STATUSES).toEqual(["DRAFT", "PUBLISHED", "FINAL", "ARCHIVED"])
  })

  it("accepts the canonical lifecycle path", () => {
    expect(canPublishExam("DRAFT")).toBe(true)
    expect(canFinalizeExam("PUBLISHED")).toBe(true)
    expect(canReopenExam("FINAL")).toBe(true)
    expect(canFinalizeExam("PUBLISHED")).toBe(true)
    expect(canArchiveExam("PUBLISHED")).toBe(true)
  })

  it("allows archiving a draft directly (withdraw without publishing)", () => {
    expect(canArchiveExam("DRAFT")).toBe(true)
  })

  it("rejects publishing anything other than a DRAFT", () => {
    expect(canPublishExam("PUBLISHED")).toBe(false)
    expect(canPublishExam("FINAL")).toBe(false)
    expect(canPublishExam("ARCHIVED")).toBe(false)
  })

  it("allows finalize only from PUBLISHED and reopen only from FINAL", () => {
    expect(canFinalizeExam("DRAFT")).toBe(false)
    expect(canFinalizeExam("FINAL")).toBe(false)
    expect(canFinalizeExam("ARCHIVED")).toBe(false)
    expect(canReopenExam("DRAFT")).toBe(false)
    expect(canReopenExam("PUBLISHED")).toBe(false)
    expect(canReopenExam("ARCHIVED")).toBe(false)
  })

  it("treats ARCHIVED as terminal (no transitions out)", () => {
    expect(canArchiveExam("ARCHIVED")).toBe(false)
    expect(canPublishExam("ARCHIVED")).toBe(false)
    expect(canReopenExam("ARCHIVED")).toBe(false)
    expect(canFinalizeExam("ARCHIVED")).toBe(false)
  })

  it("rejects no-op self transitions", () => {
    expect(canPublishExam("PUBLISHED")).toBe(false)
    expect(canFinalizeExam("FINAL")).toBe(false)
    expect(canArchiveExam("ARCHIVED")).toBe(false)
  })
})