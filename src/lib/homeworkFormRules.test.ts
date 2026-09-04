import { describe, expect, it } from "vitest"
import {
  defaultHomeworkForm,
  homeworkCreatableStatuses,
  homeworkFormToPayload,
  validateHomeworkForm,
} from "./homeworkFormRules"

function validForm() {
  return {
    ...defaultHomeworkForm(),
    academicSessionId: "00000000-0000-4000-8000-000000000001",
    classId: "00000000-0000-4000-8000-000000000002",
    sectionId: "00000000-0000-4000-8000-000000000003",
    subjectId: "00000000-0000-4000-8000-000000000004",
    teacherId: "00000000-0000-4000-8000-000000000005",
    title: "Chapter 4 exercises",
    dueDate: "2026-06-20",
  }
}

describe("validateHomeworkForm (frontend, DOM-free)", () => {
  it("accepts a valid homework with required fields", () => {
    expect(validateHomeworkForm(validForm())).toEqual([])
  })

  it("flags missing targeting and title and a malformed due date", () => {
    const errors = validateHomeworkForm({ ...defaultHomeworkForm(), dueDate: "20/06/2026" })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "academicSessionId", message: "Academic session is required" },
        { field: "classId", message: "Class is required" },
        { field: "subjectId", message: "Subject is required" },
        { field: "teacherId", message: "Teacher is required" },
        { field: "title", message: "Title is required" },
        { field: "dueDate", message: "Use YYYY-MM-DD format" },
      ]),
    )
  })

  it("rejects an over-long title and instructions", () => {
    const errors = validateHomeworkForm({
      ...validForm(),
      title: "x".repeat(201),
      instructions: "y".repeat(5001),
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "title", message: "Title must be 200 characters or fewer" },
        { field: "instructions", message: "Instructions must be 5000 characters or fewer" },
      ]),
    )
  })
})

describe("homeworkFormToPayload (frontend, DOM-free)", () => {
  it("maps required fields with trimming", () => {
    const payload = homeworkFormToPayload({ ...validForm(), title: "  Exercises  ", instructions: "  Do all parts  " })
    expect(payload).toEqual({
      academicSessionId: expect.any(String),
      classId: expect.any(String),
      sectionId: "00000000-0000-4000-8000-000000000003",
      subjectId: expect.any(String),
      teacherId: expect.any(String),
      title: "Exercises",
      instructions: "Do all parts",
      dueDate: "2026-06-20",
      status: "DRAFT",
    })
  })

  it("treats an empty section as whole class (null)", () => {
    const payload = homeworkFormToPayload({ ...validForm(), sectionId: "" })
    expect(payload.sectionId).toBeNull()
  })

  it("drops blank instructions instead of sending an empty string", () => {
    const payload = homeworkFormToPayload(validForm())
    expect(payload.instructions).toBeUndefined()
  })
})

describe("homeworkCreatableStatuses (frontend, DOM-free)", () => {
  it("exposes only DRAFT and PUBLISHED for creation", () => {
    expect(homeworkCreatableStatuses()).toEqual(["DRAFT", "PUBLISHED"])
  })
})