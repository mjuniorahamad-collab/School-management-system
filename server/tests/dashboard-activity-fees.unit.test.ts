import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { permissionFlag } from "../src/middleware/permissionFlag.js"
import { getRecentActivity } from "../src/modules/dashboard/dashboard.service.js"

const mockGetPrisma = vi.mocked(getPrisma)

const createdAt = new Date("2026-01-01T00:00:00.000Z")

const prismaMock = {
  student: { findMany: vi.fn() },
  feePayment: { findMany: vi.fn() },
  notice: { findMany: vi.fn() },
  exam: { findMany: vi.fn() },
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.student.findMany.mockResolvedValue([])
  prismaMock.feePayment.findMany.mockResolvedValue([])
  prismaMock.notice.findMany.mockResolvedValue([])
  prismaMock.exam.findMany.mockResolvedValue([])
  mockGetPrisma.mockResolvedValue(
    prismaMock as unknown as Awaited<ReturnType<typeof getPrisma>>,
  )
})

function resolveCanViewFeeActivity(roles: string[], permissions: string[]): boolean {
  const locals: Record<string, unknown> = {}
  const req = { auth: { roles, permissions } }
  const next = vi.fn()

  permissionFlag("canViewFeeActivity", "fees:view")(
    req as never,
    { locals } as never,
    next,
  )

  return locals.canViewFeeActivity === true
}

describe("getRecentActivity fee filtering", () => {
  it("excludes fee activity and never queries payments without fees:view", async () => {
    prismaMock.student.findMany.mockResolvedValue([
      {
        id: "s-1",
        firstName: "Ada",
        middleName: null,
        lastName: "Lovelace",
        createdAt,
      },
    ])

    const includeFees = resolveCanViewFeeActivity(["TEACHER"], [])
    const result = await getRecentActivity("school-1", includeFees)

    expect(includeFees).toBe(false)
    expect(prismaMock.feePayment.findMany).not.toHaveBeenCalled()
    expect(result.map((item) => item.id)).toEqual(["student-s-1"])
    expect(result.some((item) => item.source === "fee")).toBe(false)
  })

  it("includes fee activity when the caller has fees:view as an effective permission", async () => {
    prismaMock.feePayment.findMany.mockResolvedValue([
      {
        id: "p-1",
        amount: 100,
        invoice: {
          student: { firstName: "Ada", middleName: null, lastName: "Lovelace" },
        },
        createdAt,
      },
    ])

    const includeFees = resolveCanViewFeeActivity([], ["fees:view"])
    const result = await getRecentActivity("school-1", includeFees)

    expect(includeFees).toBe(true)
    expect(prismaMock.feePayment.findMany).toHaveBeenCalledTimes(1)
    const feeItem = result.find((item) => item.id === "payment-p-1")
    expect(feeItem?.source).toBe("fee")
  })
})

describe("permissionFlag fees:view resolution", () => {
  it("uses effective permissions and the SUPER_ADMIN bypass, never role labels alone", () => {
    expect(resolveCanViewFeeActivity(["TEACHER"], [])).toBe(false)
    expect(resolveCanViewFeeActivity([], ["fees:view"])).toBe(true)
    expect(resolveCanViewFeeActivity(["SUPER_ADMIN"], [])).toBe(true)
  })
})
