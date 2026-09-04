import { describe, expect, it } from "vitest"
import { isTaskOverdue } from "../src/modules/tasks/task-rules.js"
import {
  createAssignmentSchema,
  listAssignmentQuerySchema,
  updateAssignmentSchema,
} from "../src/modules/assignments/assignment.schema.js"

describe("createAssignmentSchema (database-free)", () => {
  const u = (n: string) => `00000000-0000-4000-8000-0000000000${n}`
  const valid = {
    academicSessionId: u("01"),
    classId: u("02"),
    sectionId: u("03"),
    subjectId: u("04"),
    teacherId: u("05"),
    title: "Essay on fractions",
    instructions: "Write two paragraphs.",
    dueDate: "2026-05-20",
  }

  it("accepts a valid payload with instructions", () => {
    const result = createAssignmentSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts a sectionless whole-class target (null, absent, or empty string)", () => {
    expect(createAssignmentSchema.safeParse({ ...valid, sectionId: null }).success).toBe(true)
    expect(createAssignmentSchema.safeParse({ ...valid, sectionId: undefined }).success).toBe(true)
    const result = createAssignmentSchema.safeParse({ ...valid, sectionId: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sectionId).toBeNull()
  })

  it("defaults status to DRAFT and rejects ARCHIVED on create", () => {
    const draft = createAssignmentSchema.safeParse(valid)
    expect(draft.success).toBe(true)
    if (draft.success) expect(draft.data.status).toBe("DRAFT")
    expect(createAssignmentSchema.safeParse({ ...valid, status: "ARCHIVED" }).success).toBe(false)
  })

  it("rejects a malformed due date and an empty title", () => {
    expect(createAssignmentSchema.safeParse({ ...valid, dueDate: "2026/05/20" }).success).toBe(false)
    expect(createAssignmentSchema.safeParse({ ...valid, title: "" }).success).toBe(false)
  })
})

describe("updateAssignmentSchema (database-free)", () => {
  it("accepts a partial status transition and field updates", () => {
    expect(updateAssignmentSchema.safeParse({ status: "PUBLISHED" }).success).toBe(true)
    expect(updateAssignmentSchema.safeParse({ title: "Revised" }).success).toBe(true)
  })

  it("rejects unknown fields (strict)", () => {
    expect(updateAssignmentSchema.safeParse({ nope: true }).success).toBe(false)
  })
})

describe("listAssignmentQuerySchema (database-free)", () => {
  it("applies pagination defaults", () => {
    const result = listAssignmentQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
      expect(result.data.sortBy).toBe("dueDate")
      expect(result.data.sortDir).toBe("asc")
    }
  })

  it("accepts the supported filters", () => {
    expect(
      listAssignmentQuerySchema.safeParse({
        subjectId: "00000000-0000-4000-8000-000000000004",
        status: "ARCHIVED",
        search: "essay",
        page: 3,
        pageSize: 10,
        sortBy: "title",
        sortDir: "desc",
      }).success,
    ).toBe(true)
  })

  it("rejects malformed filter values", () => {
    expect(listAssignmentQuerySchema.safeParse({ status: "OPEN" }).success).toBe(false)
    expect(listAssignmentQuerySchema.safeParse({ page: 0 }).success).toBe(false)
  })
})

describe("overdue derivation (database-free)", () => {
  it("treats past dates as overdue and today/future as not", () => {
    expect(isTaskOverdue("2026-03-01", "2026-05-01")).toBe(true)
    expect(isTaskOverdue("2026-05-01", "2026-05-01")).toBe(false)
    expect(isTaskOverdue("2026-07-01", "2026-05-01")).toBe(false)
  })
})