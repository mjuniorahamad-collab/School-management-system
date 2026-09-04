import { describe, expect, it } from "vitest"
import {
  attendanceBulkMarkToPayload,
  defaultAttendanceMarkingForm,
} from "./attendanceFormRules"

describe("attendanceBulkMarkToPayload (frontend, DOM-free)", () => {
  it("maps records to payload, dropping empty notes", () => {
    const payload = attendanceBulkMarkToPayload({
      academicSessionId: "sess-1",
      classId: "class-1",
      sectionId: "section-A",
      date: "2026-05-01",
      records: [
        { studentId: "s1", studentName: "Ada", admissionNumber: "ADM-1", status: "PRESENT", note: "" },
        { studentId: "s2", studentName: "Bo", admissionNumber: "ADM-2", status: "ABSENT", note: "  sick  " },
      ],
    })
    expect(payload).toEqual({
      academicSessionId: "sess-1",
      classId: "class-1",
      sectionId: "section-A",
      date: "2026-05-01",
      records: [
        { studentId: "s1", status: "PRESENT", note: undefined },
        { studentId: "s2", status: "ABSENT", note: "  sick  " },
      ],
    })
  })

  it("preserves the section when present and null when absent", () => {
    const withSection = attendanceBulkMarkToPayload({
      ...defaultAttendanceMarkingForm(),
      classId: "class-1",
      sectionId: "section-A",
    })
    expect(withSection.sectionId).toBe("section-A")
    const withoutSection = attendanceBulkMarkToPayload({
      ...defaultAttendanceMarkingForm(),
      classId: "class-1",
      sectionId: null,
    })
    expect(withoutSection.sectionId).toBeNull()
  })

  it("defaults the date to today (YYYY-MM-DD)", () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(defaultAttendanceMarkingForm().date).toBe(today)
  })
})
