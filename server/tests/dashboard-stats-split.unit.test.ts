import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { getFeeStat, getStats } from "../src/modules/dashboard/dashboard.service.js"

const serverSrcDir = path.resolve(import.meta.dirname, "../src")
const mockGetPrisma = vi.mocked(getPrisma)

const prismaMock = {
  student: { count: vi.fn() },
  teacher: { count: vi.fn() },
  class: { count: vi.fn() },
  academicSession: { findFirst: vi.fn() },
  feePayment: { aggregate: vi.fn() },
}

function compactSource(file: string): string {
  return readFileSync(path.join(serverSrcDir, file), "utf8").replace(/\s+/g, "")
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.student.count.mockResolvedValue(0)
  prismaMock.teacher.count.mockResolvedValue(0)
  prismaMock.class.count.mockResolvedValue(0)
  prismaMock.academicSession.findFirst.mockResolvedValue(null)
  prismaMock.feePayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  mockGetPrisma.mockResolvedValue(
    prismaMock as unknown as Awaited<ReturnType<typeof getPrisma>>,
  )
})

describe("dashboard stats route contract", () => {
  it("guards the non-fee stats with dashboard:view", () => {
    const routeSource = compactSource("modules/dashboard/dashboard.route.ts")

    expect(routeSource).toContain(
      'dashboardRouter.get("/stats",requirePermission("dashboard:view"),getStatsHandler)',
    )
  })

  it("guards the fee stat with fees:view", () => {
    const routeSource = compactSource("modules/dashboard/dashboard.route.ts")

    expect(routeSource).toContain(
      'dashboardRouter.get("/stats/fees",requirePermission("fees:view"),getFeeStatHandler)',
    )
  })

  it("keeps permission enforcement out of the fee-stat controller", () => {
    const controllerSource = compactSource("modules/dashboard/dashboard.controller.ts")

    expect(controllerSource).not.toContain("requirePermission")
    expect(controllerSource).not.toContain('"fees:view"')
  })
})

describe("dashboard stats service contract", () => {
  it("returns only the three non-fee stats and never queries fee data", async () => {
    const result = await getStats("school-1")

    expect(result.stats.map((stat) => stat.id)).toEqual([
      "total-students",
      "total-teachers",
      "total-classes",
    ])
    expect(result.stats.some((stat) => stat.id === "fees-collection")).toBe(false)
    expect(prismaMock.feePayment.aggregate).not.toHaveBeenCalled()
    expect(prismaMock.academicSession.findFirst).not.toHaveBeenCalled()
  })

  it("returns only the fee stat from the dedicated service", async () => {
    prismaMock.academicSession.findFirst.mockResolvedValue({ id: "session-1" })
    prismaMock.feePayment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 1500 } })
      .mockResolvedValueOnce({ _sum: { amount: 1000 } })
      .mockResolvedValueOnce({ _sum: { amount: 4000 } })

    const result = await getFeeStat("school-1")

    expect(result).toEqual({
      id: "fees-collection",
      label: "Fees Collection",
      value: "₹4,000",
      trendPercent: 50,
      comparison: "vs last month",
    })
    expect(prismaMock.student.count).not.toHaveBeenCalled()
    expect(prismaMock.teacher.count).not.toHaveBeenCalled()
    expect(prismaMock.class.count).not.toHaveBeenCalled()
  })
})
