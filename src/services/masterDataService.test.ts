import { describe, expect, it, vi, beforeEach } from "vitest"
import { api } from "@/lib/apiClient"
import {
  examTypesService,
  feeHeadsService,
  gradingBandsService,
  periodSlotsService,
} from "./masterDataService"

vi.mock("@/lib/apiClient", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

// The lifecycle list endpoints default to active-only. The client must send
// `includeInactive=true` only when the caller explicitly asks for the retired
// records, and the toggle action must PATCH the status field alone.
describe("masterDataService lifecycle query and toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const services = [
    ["fee heads", feeHeadsService, "/fee-heads"],
    ["exam types", examTypesService, "/exam-types"],
    ["grading bands", gradingBandsService, "/grading-bands"],
    ["period slots", periodSlotsService, "/period-slots"],
  ] as const

  it.each(services)("%s list omits includeInactive by default", async (_label, service, path) => {
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0 } as never)

    await service.list({})

    expect(api.get).toHaveBeenCalledWith(`${path}?`)
  })

  it.each(services)("%s list sends includeInactive=true when asked", async (_label, service, path) => {
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0 } as never)

    await service.list({ includeInactive: true })

    expect(api.get).toHaveBeenCalledWith(`${path}?includeInactive=true`)
  })

  it.each(services)("%s list combines search and includeInactive", async (_label, service, path) => {
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0 } as never)

    await service.list({ search: "term", includeInactive: true })

    expect(api.get).toHaveBeenCalledWith(`${path}?search=term&includeInactive=true`)
  })

  it.each(services)("%s update sends the isActive flag alone for a toggle", async (_label, service, path) => {
    vi.mocked(api.patch).mockResolvedValue({ id: "row-1" } as never)

    await service.update("row-1", { isActive: false })

    expect(api.patch).toHaveBeenCalledWith(`${path}/row-1`, { isActive: false })
  })
})
