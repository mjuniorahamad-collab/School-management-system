import { describe, expect, it } from "vitest"
import {
  defaultMarkCell,
  subjectDraftToPayload,
  validateSubjectDraft,
} from "./resultFormRules"
import type { ResultSheetRow } from "@/types/results"

const SUBJECT_ID = "00000000-0000-4000-8000-0000000000aa"

function rosterRow(overrides: Partial<ResultSheetRow> = {}): ResultSheetRow {
  return {
    enrollmentId: "00000000-0000-4000-8000-0000000000e1",
    studentId: "00000000-0000-4000-8000-0000000000s1",
    admissionNumber: "ADM-2026-001",
    studentName: "Alpha Student",
    marks: [],
    isComplete: false,
    totalObtained: null,
    totalMaxMarks: null,
    totalPercentage: null,
    grade: null,
    isPass: null,
    rank: null,
    ...overrides,
  }
}

describe("validateSubjectDraft", () => {
  it("accepts valid marks up to the max", () => {
    expect(validateSubjectDraft([{ value: "79", isAbsent: false }], 100)).toBeNull()
    expect(validateSubjectDraft([{ value: "100", isAbsent: false }], 100)).toBeNull()
  })

  it("rejects negative, oversized, and malformed marks", () => {
    expect(validateSubjectDraft([{ value: "-4", isAbsent: false }], 100)).not.toBeNull()
    expect(validateSubjectDraft([{ value: "101", isAbsent: false }], 100)).toBe(
      "Marks cannot exceed 100",
    )
    expect(validateSubjectDraft([{ value: "1.234", isAbsent: false }], 100)).not.toBeNull()
    expect(validateSubjectDraft([{ value: "abc", isAbsent: false }], 100)).not.toBeNull()
  })

  it("ignores absent cells and untouched cells", () => {
    expect(
      validateSubjectDraft([{ value: "", isAbsent: true }, { value: "", isAbsent: false }], 100),
    ).toBeNull()
  })
})

describe("subjectDraftToPayload", () => {
  it("sends null when a cell is blank or absent", () => {
    const rows = [rosterRow()]
    const payload = subjectDraftToPayload(rows, {}, SUBJECT_ID)
    expect(payload).toEqual([
      { enrollmentId: rows[0].enrollmentId, obtainedMarks: null, isAbsent: false },
    ])
  })

  it("reuses saved server marks when the cell is untouched", () => {
    const rows = [
      rosterRow({
        marks: [{ examResultId: "r", examSubjectId: SUBJECT_ID, obtainedMarks: "66.5", isAbsent: false, percentage: "66", grade: "C", isPass: true }],
      }),
    ]
    const payload = subjectDraftToPayload(rows, {}, SUBJECT_ID)
    expect(payload[0].obtainedMarks).toBe(66.5)
  })

  it("overrides the server value with a local draft", () => {
    const rows = [rosterRow()]
    const payload = subjectDraftToPayload(rows, { [`${SUBJECT_ID}:${rows[0].enrollmentId}`]: { value: "88", isAbsent: false } }, SUBJECT_ID)
    expect(payload[0].obtainedMarks).toBe(88)
  })
})

describe("defaultMarkCell", () => {
  it("returns an empty editable cell when no mark exists", () => {
    expect(defaultMarkCell(undefined)).toEqual({ value: "", isAbsent: false })
  })

  it("maps an absent mark to the absent draft", () => {
    expect(
      defaultMarkCell({ examResultId: "r", examSubjectId: SUBJECT_ID, obtainedMarks: null, isAbsent: true, percentage: null, grade: null, isPass: null }),
    ).toEqual({ value: "", isAbsent: true })
  })
})