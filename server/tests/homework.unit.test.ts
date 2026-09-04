import { Prisma, TaskStatus, TaskSubmissionStatus } from "@prisma/client"
import { describe, expect, it } from "vitest"
import {
  canTransitionTaskStatus,
  isTaskOverdue,
  todayLocalDate,
} from "../src/modules/tasks/task-rules.js"
import {
  createHomeworkSchema,
  listHomeworkQuerySchema,
  updateHomeworkSchema,
} from "../src/modules/homework/homework.schema.js"

describe("task-rules (database-free)", () => {
  it("accepts the canonical status transitions", () => {
    expect(canTransitionTaskStatus("DRAFT", "PUBLISHED")).toBe(true)
    expect(canTransitionTaskStatus("DRAFT", "ARCHIVED")).toBe(true)
    expect(canTransitionTaskStatus("PUBLISHED", "ARCHIVED")).toBe(true)
  })

  it("rejects illegal transitions (ARCHIVED is terminal, no DRAFT re-open)", () => {
    expect(canTransitionTaskStatus("ARCHIVED", "PUBLISHED")).toBe(false)
    expect(canTransitionTaskStatus("ARCHIVED", "DRAFT")).toBe(false)
    expect(canTransitionTaskStatus("PUBLISHED", "DRAFT")).toBe(false)
    expect(canTransitionTaskStatus("DRAFT", "DRAFT")).toBe(false)
  })

  it("flags a task as overdue only when the due date is before today (YYYY-MM-DD compare)", () => {
    expect(isTaskOverdue("2026-01-01", "2026-05-01")).toBe(true)
    expect(isTaskOverdue("2026-05-01", "2026-05-01")).toBe(false)
    expect(isTaskOverdue("2026-12-31", "2026-05-01")).toBe(false)
  })

  it("returns the server-local calendar date in YYYY-MM-DD", () => {
    const today = todayLocalDate()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("createHomeworkSchema (database-free)", () => {
  const u = (n: string) => `00000000-0000-4000-8000-0000000000${n}`
  const valid = {
    academicSessionId: u("01"),
    classId: u("02"),
    sectionId: u("03"),
    subjectId: u("04"),
    teacherId: u("05"),
    title: "Multiplication drill",
    dueDate: "2026-05-15",
  }

  it("accepts a valid payload", () => {
    const result = createHomeworkSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("accepts a sectionless whole-class target (null, absent, or empty string)", () => {
    expect(createHomeworkSchema.safeParse({ ...valid, sectionId: null }).success).toBe(true)
    expect(createHomeworkSchema.safeParse({ ...valid, sectionId: undefined }).success).toBe(true)
    const result = createHomeworkSchema.safeParse({ ...valid, sectionId: "" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sectionId).toBeNull()
  })

  it("defaults status to DRAFT and accepts a PUBLISHED shortcut", () => {
    const draft = createHomeworkSchema.safeParse(valid)
    expect(draft.success).toBe(true)
    if (draft.success) expect(draft.data.status).toBe("DRAFT")
    expect(createHomeworkSchema.safeParse({ ...valid, status: "PUBLISHED" }).success).toBe(true)
  })

  it("rejects ARCHIVED on create (archived tasks are terminal, never created as such)", () => {
    expect(createHomeworkSchema.safeParse({ ...valid, status: "ARCHIVED" }).success).toBe(false)
  })

  it("rejects a malformed due date", () => {
    expect(createHomeworkSchema.safeParse({ ...valid, dueDate: "15/05/2026" }).success).toBe(false)
  })

  it("rejects an empty title", () => {
    expect(createHomeworkSchema.safeParse({ ...valid, title: "   " }).success).toBe(false)
  })

  it("rejects unknown fields (strict)", () => {
    expect(createHomeworkSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })
})

describe("updateHomeworkSchema (database-free)", () => {
  const u = (n: string) => `00000000-0000-4000-8000-0000000000${n}`

  it("accepts a partial status transition", () => {
    expect(updateHomeworkSchema.safeParse({ status: "PUBLISHED" }).success).toBe(true)
    expect(updateHomeworkSchema.safeParse({ status: "ARCHIVED" }).success).toBe(true)
  })

  it("accepts partial field updates", () => {
    expect(
      updateHomeworkSchema.safeParse({ title: "New title", dueDate: "2026-06-01" }).success,
    ).toBe(true)
    expect(updateHomeworkSchema.safeParse({ teacherId: u("05") }).success).toBe(true)
  })

  it("rejects unknown fields (strict)", () => {
    expect(updateHomeworkSchema.safeParse({ bogus: true }).success).toBe(false)
  })

  it("treats an omitted sectionId as unchanged, an empty string as whole-class", () => {
    const omitted = updateHomeworkSchema.safeParse({ title: "New title" })
    expect(omitted.success).toBe(true)
    if (omitted.success) expect(omitted.data.sectionId).toBeUndefined()

    const cleared = updateHomeworkSchema.safeParse({ title: "New title", sectionId: "" })
    expect(cleared.success).toBe(true)
    if (cleared.success) expect(cleared.data.sectionId).toBeNull()
  })
})

describe("listHomeworkQuerySchema (database-free)", () => {
  it("applies pagination defaults", () => {
    const result = listHomeworkQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
      expect(result.data.sortBy).toBe("dueDate")
      expect(result.data.sortDir).toBe("asc")
    }
  })

  it("accepts the supported filters", () => {
    const result = listHomeworkQuerySchema.safeParse({
      academicSessionId: "00000000-0000-4000-8000-000000000001",
      classId: "00000000-0000-4000-8000-000000000002",
      status: "PUBLISHED",
      dueDateFrom: "2026-05-01",
      dueDateTo: "2026-05-31",
      search: "multiplication",
      page: 2,
      pageSize: 50,
      sortBy: "title",
      sortDir: "desc",
    })
    expect(result.success).toBe(true)
  })

  it("rejects non-uuid filter values and bad dates", () => {
    expect(listHomeworkQuerySchema.safeParse({ classId: "nope" }).success).toBe(false)
    expect(listHomeworkQuerySchema.safeParse({ dueDateFrom: "05/01/2026" }).success).toBe(false)
  })
})

describe("submission schema presence (database-free)", () => {
  it("exposes the submission models on the generated client (schema-ready for the portal phase)", () => {
    expect(Object.keys(Prisma.HomeworkSubmissionScalarFieldEnum)).toEqual(
      expect.arrayContaining([
        "homeworkId",
        "studentId",
        "enrollmentId",
        "content",
        "attachmentUrl",
        "status",
        "marks",
        "feedback",
        "gradedBy",
        "gradedAt",
        "submittedAt",
      ]),
    )
    expect(Object.keys(Prisma.AssignmentSubmissionScalarFieldEnum)).toEqual(
      expect.arrayContaining(["assignmentId", "enrollmentId", "status", "marks", "gradedAt"]),
    )
  })

  it("enumerates the shared task statuses on the client", () => {
    expect(Object.values(TaskStatus)).toEqual(["DRAFT", "PUBLISHED", "ARCHIVED"])
    expect(Object.values(TaskSubmissionStatus)).toEqual(["SUBMITTED", "LATE", "GRADED"])
  })
})