import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/apiClient"
import {
  buildReportCardSchemesQueryString,
  reportCardSchemeService,
} from "./reportCardSchemeService"

vi.mock("@/lib/apiClient", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    putForm: vi.fn(),
    postForm: vi.fn(),
  },
}))

describe("buildReportCardSchemesQueryString", () => {
  it("omits absent filters", () => {
    expect(buildReportCardSchemesQueryString({})).toBe("")
  })

  it("includes only the provided filters", () => {
    const params = new URLSearchParams(
      buildReportCardSchemesQueryString({ academicSessionId: "sess-1", classId: "c1" }),
    )
    expect(params.get("academicSessionId")).toBe("sess-1")
    expect(params.get("classId")).toBe("c1")
    expect(params.has("sectionId")).toBe(false)
  })
})

describe("reportCardSchemeService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists with a query string", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0 } as never)
    await reportCardSchemeService.list({ classId: "c1" })
    expect(api.get).toHaveBeenCalledWith("/report-card-schemes?classId=c1")
  })

  it("lists without a query string when no filters are set", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0 } as never)
    await reportCardSchemeService.list()
    expect(api.get).toHaveBeenCalledWith("/report-card-schemes")
  })

  it("gets a single scheme", async () => {
    vi.mocked(api.get).mockResolvedValue({ id: "sch-1" } as never)
    await reportCardSchemeService.get("sch-1")
    expect(api.get).toHaveBeenCalledWith("/report-card-schemes/sch-1")
  })

  it("upserts via PUT /report-card-schemes", async () => {
    vi.mocked(api.put).mockResolvedValue({ id: "sch-1" } as never)
    const input = {
      academicSessionId: "sess-1",
      classId: "c1",
      aggregationPolicy: "RAW" as const,
      overallPassMode: "ALL_SUBJECTS" as const,
      annualSubjectPassPercent: 40,
      exams: [{ examTypeId: "et-1" }],
    }
    await reportCardSchemeService.upsert(input)
    expect(api.put).toHaveBeenCalledWith("/report-card-schemes", input)
    expect(api.post).not.toHaveBeenCalled()
  })
})
