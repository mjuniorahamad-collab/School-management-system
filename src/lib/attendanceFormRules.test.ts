import { describe, expect, it } from "vitest"
import {
  attendanceBulkMarkToPayload,
  buildAttendanceRosterQuery,
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

describe("buildAttendanceRosterQuery (frontend, DOM-free regression)", () => {
  it("always uses pageSize 100, the Students API maximum", () => {
    const query = buildAttendanceRosterQuery({
      academicSessionId: "sess-1",
      classId: "class-1",
      sectionId: "section-A",
    })
    expect(query.page).toBe(1)
    expect(query.pageSize).toBe(100)
    expect(query.pageSize).toBeLessThanOrEqual(100)
  })

  it("keeps the academic session and class filters", () => {
    const query = buildAttendanceRosterQuery({
      academicSessionId: "sess-1",
      classId: "class-1",
      sectionId: "section-A",
    })
    expect(query.sessionId).toBe("sess-1")
    expect(query.classId).toBe("class-1")
  })

  it("only sends a section filter when one is selected", () => {
    const withSection = buildAttendanceRosterQuery({
      academicSessionId: "sess-1",
      classId: "class-1",
      sectionId: "section-A",
    })
    expect(withSection.sectionId).toBe("section-A")
    const withoutSection = buildAttendanceRosterQuery({
      academicSessionId: "sess-1",
      classId: "class-1",
    })
    expect(withoutSection.sectionId).toBeUndefined()
  })
})
