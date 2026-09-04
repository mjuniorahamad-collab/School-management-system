import { describe, expect, it } from "vitest"
import {
  assignmentCreatableStatuses,
  assignmentFormToPayload,
  defaultAssignmentForm,
  validateAssignmentForm,
} from "./assignmentsFormRules"

function validForm() {
  return {
    ...defaultAssignmentForm(),
    academicSessionId: "00000000-0000-4000-8000-000000000001",
    classId: "00000000-0000-4000-8000-000000000002",
    subjectId: "00000000-0000-4000-8000-000000000004",
    teacherId: "00000000-0000-4000-8000-000000000005",
    title: "Essay draft",
    dueDate: "2026-07-01",
  }
}

describe("validateAssignmentForm (frontend, DOM-free)", () => {
  it("accepts a valid sectionless assignment", () => {
    expect(validateAssignmentForm(validForm())).toEqual([])
  })

  it("flags missing targeting and title", () => {
    const errors = validateAssignmentForm(defaultAssignmentForm())
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "academicSessionId", message: "Academic session is required" },
        { field: "classId", message: "Class is required" },
        { field: "subjectId", message: "Subject is required" },
        { field: "teacherId", message: "Teacher is required" },
        { field: "title", message: "Title is required" },
      ]),
    )
  })
})

describe("assignmentFormToPayload (frontend, DOM-free)", () => {
  it("maps required fields and whole-class section", () => {
    const payload = assignmentFormToPayload(validForm())
    expect(payload.sectionId).toBeNull()
    expect(payload.title).toBe("Essay draft")
    expect(payload.status).toBe("DRAFT")
  })

  it("keeps an explicit section", () => {
    const payload = assignmentFormToPayload({
      ...validForm(),
      sectionId: "00000000-0000-4000-8000-000000000003",
    })
    expect(payload.sectionId).toBe("00000000-0000-4000-8000-000000000003")
  })
})

describe("assignmentCreatableStatuses (frontend, DOM-free)", () => {
  it("exposes only DRAFT and PUBLISHED for creation", () => {
    expect(assignmentCreatableStatuses()).toEqual(["DRAFT", "PUBLISHED"])
  })
})