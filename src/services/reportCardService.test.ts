import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/apiClient"
import {
  buildReportCardArchiveUrl,
  buildReportCardsQueryString,
  reportCardService,
} from "./reportCardService"

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

describe("buildReportCardsQueryString", () => {
  it("omits absent filters", () => {
    expect(buildReportCardsQueryString({})).toBe("")
  })

  it("includes every provided filter", () => {
    const params = new URLSearchParams(
      buildReportCardsQueryString({
        page: 2,
        pageSize: 50,
        studentId: "stu-1",
        academicSessionId: "sess-1",
        classId: "cls-1",
        sectionId: "sec-1",
        status: "DRAFT",
      }),
    )
    expect(params.get("page")).toBe("2")
    expect(params.get("pageSize")).toBe("50")
    expect(params.get("studentId")).toBe("stu-1")
    expect(params.get("academicSessionId")).toBe("sess-1")
    expect(params.get("classId")).toBe("cls-1")
    expect(params.get("sectionId")).toBe("sec-1")
    expect(params.get("status")).toBe("DRAFT")
  })
})

describe("buildReportCardArchiveUrl", () => {
  it("returns the base-relative authenticated archive path", () => {
    expect(buildReportCardArchiveUrl("rc-1")).toBe("/report-cards/rc-1/archive")
  })
})

describe("reportCardService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists with a query string", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0 } as never)
    await reportCardService.list({ page: 1, pageSize: 20 })
    expect(api.get).toHaveBeenCalledWith("/report-cards?page=1&pageSize=20")
  })

  it("lists without a query string when no filters are set", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0 } as never)
    await reportCardService.list()
    expect(api.get).toHaveBeenCalledWith("/report-cards")
  })

  it("gets a single report card", async () => {
    vi.mocked(api.get).mockResolvedValue({ id: "rc-1" } as never)
    await reportCardService.get("rc-1")
    expect(api.get).toHaveBeenCalledWith("/report-cards/rc-1")
  })

  it("generates via POST /report-cards/generate with the input", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "rc-1" } as never)
    const input = { studentId: "s1", academicSessionId: "sess-1", classId: "c1" }
    await reportCardService.generate(input)
    expect(api.post).toHaveBeenCalledWith("/report-cards/generate", input)
  })

  it("publishes via POST /report-cards/:id/publish", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "rc-1" } as never)
    await reportCardService.publish("rc-1")
    expect(api.post).toHaveBeenCalledWith("/report-cards/rc-1/publish", undefined)
  })

  it("issues via POST /report-cards/:id/issue", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "rc-1" } as never)
    await reportCardService.issue("rc-1")
    expect(api.post).toHaveBeenCalledWith("/report-cards/rc-1/issue", undefined)
  })

  it("attaches the PDF archive via POST multipart with the exact 'pdf' field", async () => {
    vi.mocked(api.postForm).mockResolvedValue({ id: "art-1" } as never)
    const file = new File(["%PDF-1.4"], "card.pdf", { type: "application/pdf" })

    await reportCardService.attachArchive("rc-1", file)

    expect(api.postForm).toHaveBeenCalledTimes(1)
    const call = vi.mocked(api.postForm).mock.calls[0]
    const path = call[0]
    const formData = call[1] as FormData
    expect(path).toBe("/report-cards/rc-1/archive")
    expect(formData).toBeInstanceOf(FormData)
    const entry = formData.get("pdf")
    expect(entry).toBeInstanceOf(File)
    expect((entry as File).name).toBe("card.pdf")
    // The archive endpoint is POST, so it must never go through the PUT/JSON paths.
    expect(api.putForm).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
  })
})
