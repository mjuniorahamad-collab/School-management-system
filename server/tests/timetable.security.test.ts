import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))
vi.mock("../../src/lib/teacher-scope.js", () => ({
  getTeacherForUser: vi.fn(),
  isPlatformSuperAdmin: vi.fn(),
}))

import { listTimetableEntries } from "../src/modules/timetable/timetable.service.js"
import { getPrisma } from "../src/lib/database.js"

describe("timetable teacher scope (service)", () => {
  const prismaMock: any = {}

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction = vi.fn(async (arr: any[]) => {
      if (Array.isArray(arr)) {
        const count = await arr[0]
        const rows = await arr[1]
        return [count, rows]
      }
      return arr(prismaMock)
    })
    prismaMock.timetableEntry = { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) }
    ;(getPrisma as any).mockResolvedValue(prismaMock)
  })

  it("teacher scope forces teacherId filter", async () => {
    await listTimetableEntries({} as any, "sch1", { teacherId: "t1", classIds: ["c1"], sectionPairs: new Set(["c1:s1"]) })
    expect(prismaMock.timetableEntry.findMany).toHaveBeenCalled()
    const call = prismaMock.timetableEntry.findMany.mock.calls[0][0]
    expect(call.where.teacherId).toBe("t1")
    expect(call.where.schoolId).toBe("sch1")
  })

  it("teacher cannot request another teacherId", async () => {
    await expect(
      listTimetableEntries({ teacherId: "t2" } as any, "sch1", { teacherId: "t1", classIds: ["c1"], sectionPairs: new Set() }),
    ).rejects.toThrow(/Cannot view other teachers/i)
  })

  it("teacher cannot view unassigned class/section", async () => {
    await expect(
      listTimetableEntries({ classId: "c99", sectionId: "s99" } as any, "sch1", { teacherId: "t1", classIds: ["c1"], sectionPairs: new Set(["c1:s1"]) }),
    ).rejects.toThrow(/Not assigned/i)
  })
})
