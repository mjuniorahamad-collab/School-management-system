import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/apiClient"
import { concessionsService } from "./concessionsService"

vi.mock("@/lib/apiClient", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe("concessionsService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists adjustments under GET /fees/adjustments with the query string", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], pagination: { page: 1 } } as never)

    await concessionsService.list({ page: 2, status: "REQUESTED", kind: "PERCENTAGE", search: "Amina" })

    expect(api.get).toHaveBeenCalledWith("/fees/adjustments?page=2&status=REQUESTED&kind=PERCENTAGE&search=Amina")
  })

  it("fetches a single adjustment detail", async () => {
    vi.mocked(api.get).mockResolvedValue({ id: "adj-1" } as never)

    await concessionsService.get("adj-1")

    expect(api.get).toHaveBeenCalledWith("/fees/adjustments/adj-1")
  })

  it("requests a concession via POST /fees/adjustments", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "adj-1" } as never)

    await concessionsService.request({ invoiceId: "inv-1", kind: "FIXED_AMOUNT", value: 5000, reason: "Hardship" })

    expect(api.post).toHaveBeenCalledWith("/fees/adjustments", {
      invoiceId: "inv-1",
      kind: "FIXED_AMOUNT",
      value: 5000,
      reason: "Hardship",
    })
  })

  it("posts lifecycle actions to their transition endpoints", async () => {
    vi.mocked(api.post).mockResolvedValue({ id: "adj-1" } as never)

    await concessionsService.approve("adj-1")
    expect(api.post).toHaveBeenCalledWith("/fees/adjustments/adj-1/approve", {})

    await concessionsService.override("adj-1", { overrideReason: "Director override" })
    expect(api.post).toHaveBeenCalledWith("/fees/adjustments/adj-1/override", {
      overrideReason: "Director override",
    })

    await concessionsService.reject("adj-1", { reason: "Not eligible" })
    expect(api.post).toHaveBeenCalledWith("/fees/adjustments/adj-1/reject", { reason: "Not eligible" })

    await concessionsService.cancel("adj-1")
    expect(api.post).toHaveBeenCalledWith("/fees/adjustments/adj-1/cancel", {})

    await concessionsService.reverse("adj-1")
    expect(api.post).toHaveBeenCalledWith("/fees/adjustments/adj-1/reverse", {})
  })
})