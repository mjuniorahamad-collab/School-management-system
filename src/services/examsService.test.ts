import { describe, expect, it, vi, beforeEach } from "vitest"
import { api } from "@/lib/apiClient"
import { examsService } from "./examsService"

vi.mock("@/lib/apiClient", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe("examsService.updateSubjects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends PUT /exams/:id/subjects with the subject list", async () => {
    vi.mocked(api.put).mockResolvedValue({ id: "exam-1", subjects: [] } as never)

    await examsService.updateSubjects("exam-1", [
      { subjectId: "s1", teacherId: "t1", maxMarks: 50, passMarks: 20 },
    ])

    expect(api.put).toHaveBeenCalledWith("/exams/exam-1/subjects", {
      subjects: [{ subjectId: "s1", teacherId: "t1", maxMarks: 50, passMarks: 20 }],
    })
    expect(api.patch).not.toHaveBeenCalled()
  })
})