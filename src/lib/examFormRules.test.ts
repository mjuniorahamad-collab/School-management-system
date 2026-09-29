import { describe, expect, it } from "vitest"
import {
  defaultExamForm,
  emptySubjectRow,
  examFormToPayload,
  examMetadataToPayload,
  validateExamForm,
} from "./examFormRules"

const SESSION = "00000000-0000-4000-8000-000000000001"
const EXAM_TYPE = "00000000-0000-4000-8000-000000000002"
const CLASS = "00000000-0000-4000-8000-000000000003"
const SUBJECT = "00000000-0000-4000-8000-000000000005"
const TEACHER = "00000000-0000-4000-8000-000000000006"

function validForm() {
  return {
    ...defaultExamForm(),
    academicSessionId: SESSION,
    examTypeId: EXAM_TYPE,
    classId: CLASS,
    name: "Term 1 Examination",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    subjects: [{ subjectId: SUBJECT, teacherId: TEACHER, maxMarks: "100", passMarks: "40" }],
  }
}

/** What the edit path actually holds: the subject list is not surfaced there. */
function editForm() {
  return { ...validForm(), subjects: [] as ReturnType<typeof validForm>["subjects"] }
}

/** Distinct subject ids, so the unconditional duplicate-subject rule stays quiet. */
function manyRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    subjectId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    teacherId: TEACHER,
    maxMarks: "100",
    passMarks: "40",
  }))
}

describe("validateExamForm — create (frontend, DOM-free)", () => {
  it("accepts a fully-populated create form", () => {
    expect(validateExamForm(validForm())).toEqual([])
  })

  // Both ids are required by the backend schema and sent by examFormToPayload.
  // A regression here means an exam cannot be created at all.
  it("rejects a missing academic session", () => {
    const errors = validateExamForm({ ...validForm(), academicSessionId: "" })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "academicSessionId", message: "Academic session is required" },
      ]),
    )
  })

  it("rejects a missing exam type", () => {
    const errors = validateExamForm({ ...validForm(), examTypeId: "" })
    expect(errors).toEqual(
      expect.arrayContaining([{ field: "examTypeId", message: "Exam type is required" }]),
    )
  })

  it("still requires at least one subject on create", () => {
    const errors = validateExamForm({ ...validForm(), subjects: [] })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "subjects.row", message: "At least one subject is required" },
      ]),
    )
  })

  it("caps the subject list at 30 on create", () => {
    const errors = validateExamForm({ ...validForm(), subjects: manyRows(31) })
    expect(errors).toContainEqual({ field: "subjects.row", message: "At most 30 subjects per exam" })
  })

  it("defaults to the create mode when no mode is passed", () => {
    // The stricter behaviour is the default, so a caller that forgets the mode
    // cannot silently skip the subject requirement.
    expect(validateExamForm({ ...validForm(), subjects: [] }, "create")).not.toEqual([])
    expect(validateExamForm({ ...validForm(), subjects: [] })).toEqual(
      validateExamForm({ ...validForm(), subjects: [] }, "create"),
    )
  })
})

describe("validateExamForm — edit", () => {
  // Regression: the edit form hides the subject editor, so `subjects` is always
  // []. Requiring one made "Save changes" unsubmittable — it always toasted
  // "At least one subject is required" and never reached the update API.
  it("accepts a draft edit whose subject list is not surfaced", () => {
    expect(validateExamForm(editForm(), "edit")).toEqual([])
  })

  it("does not cap the subject list on edit", () => {
    const errors = validateExamForm({ ...editForm(), subjects: manyRows(31) }, "edit")
    expect(errors).toEqual([])
  })

  it("still enforces the metadata rules on edit", () => {
    expect(validateExamForm({ ...editForm(), name: "  " }, "edit")).toEqual(
      expect.arrayContaining([{ field: "name", message: "Name is required" }]),
    )
    expect(validateExamForm({ ...editForm(), endDate: "2026-08-01" }, "edit")).toEqual(
      expect.arrayContaining([
        { field: "endDate", message: "End date must be on or after start date" },
      ]),
    )
  })
})

describe("examFormToPayload (frontend, DOM-free)", () => {
  it("sends the selected session and exam type verbatim", () => {
    const payload = examFormToPayload(validForm())
    expect(payload.academicSessionId).toBe(SESSION)
    expect(payload.examTypeId).toBe(EXAM_TYPE)
  })

  it("trims the name, nulls a blank section and normalises the status", () => {
    const payload = examFormToPayload({
      ...validForm(),
      name: "  Term 1 Examination  ",
      sectionId: "",
      status: "FINAL",
    })
    expect(payload.name).toBe("Term 1 Examination")
    expect(payload.sectionId).toBeNull()
    expect(payload.status).toBe("DRAFT")
  })

  it("coerces the subject marks to numbers", () => {
    const payload = examFormToPayload(validForm())
    expect(payload.subjects).toEqual([
      { subjectId: SUBJECT, teacherId: TEACHER, maxMarks: 100, passMarks: 40 },
    ])
  })
})

describe("examMetadataToPayload (frontend, DOM-free)", () => {
  // The backend update schema is `.strict()` and accepts only these four keys.
  // Emitting anything else would 400, and adding session/type/class to it would
  // widen a contract that is deliberately metadata-only.
  it("emits only the four updatable fields", () => {
    expect(Object.keys(examMetadataToPayload(validForm())).sort()).toEqual([
      "endDate",
      "name",
      "sectionId",
      "startDate",
    ])
  })

  it("nulls a blank section", () => {
    expect(examMetadataToPayload({ ...validForm(), sectionId: "" }).sectionId).toBeNull()
  })
})

describe("defaultExamForm (frontend, DOM-free)", () => {
  it("starts with no session and no exam type, so the user must choose", () => {
    const form = defaultExamForm()
    expect(form.academicSessionId).toBe("")
    expect(form.examTypeId).toBe("")
    expect(form.status).toBe("DRAFT")
    expect(form.subjects).toEqual([])
  })

  it("provides an empty subject row", () => {
    expect(emptySubjectRow()).toEqual({ subjectId: "", teacherId: "", maxMarks: "", passMarks: "" })
  })
})
