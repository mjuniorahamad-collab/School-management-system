import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))

import { getPrisma } from "../src/lib/database.js"
import { getTeacherMembership } from "../src/modules/teachers/teacher.service.js"

type PrismaMock = {
  teacher: { findFirst: ReturnType<typeof vi.fn> }
  tenantMembership: { findFirst: ReturnType<typeof vi.fn> }
}

function createPrismaMock(): PrismaMock {
  return {
    teacher: { findFirst: vi.fn() },
    tenantMembership: { findFirst: vi.fn() },
  }
}

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
}

describe("getTeacherMembership - service (unit)", () => {
  let prisma: PrismaMock

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = createPrismaMock()
    vi.mocked(getPrisma).mockResolvedValue(prisma as never)
  })

  it("returns the eligible TEACHER membership id for a linked active user", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ userId: "uTeacher" })
    prisma.tenantMembership.findFirst.mockResolvedValue({ id: "mTeacher" })

    const result = await getTeacherMembership("t1", "sch1")

    expect(result).toEqual({ membershipId: "mTeacher" })
    expect(Object.keys(result)).toEqual(["membershipId"])
    expect(prisma.teacher.findFirst).toHaveBeenCalledTimes(1)
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", schoolId: "sch1" },
      select: { userId: true },
    })
    expect(prisma.tenantMembership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "uTeacher",
        schoolId: "sch1",
        status: "ACTIVE",
        removedAt: null,
        user: { is: { status: "ACTIVE" } },
        role: { is: { name: "TEACHER" } },
      },
      select: { id: true },
    })
  })

  it("returns null without querying memberships when the teacher has no linked login", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ userId: null })

    const result = await getTeacherMembership("t1", "sch1")

    expect(result).toEqual({ membershipId: null })
    expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled()
  })

  it("returns null for a linked login with no eligible active TEACHER membership in this school", async () => {
    prisma.teacher.findFirst.mockResolvedValue({ userId: "uTeacher" })
    prisma.tenantMembership.findFirst.mockResolvedValue(null)

    const result = await getTeacherMembership("t1", "sch1")

    expect(result).toEqual({ membershipId: null })
  })

  it("treats a missing or cross-school teacher as not found and never resolves memberships", async () => {
    prisma.teacher.findFirst.mockResolvedValue(null)

    await expect(getTeacherMembership("t1", "sch2")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Teacher not found",
    })
    expect(prisma.teacher.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", schoolId: "sch2" },
      select: { userId: true },
    })
    expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled()
  })
})

describe("teacher membership route - authorization contract", () => {
  const routeSource = readSource("../src/modules/teachers/teacher.route.ts")

  it("guards the lookup with separate teachers:view and membership-permissions:view checks", () => {
    expect(routeSource).toMatch(
      /teachersRouter\.get\(\s*"\/:teacherId\/membership",\s*requirePermission\("teachers:view"\),\s*requirePermission\("membership-permissions:view"\),\s*getTeacherMembershipHandler,?\s*\)/,
    )
  })

  it("registers the lookup before the generic teacher detail route", () => {
    const membershipIndex = routeSource.indexOf('"/:teacherId/membership"')
    const detailIndex = routeSource.indexOf('teachersRouter.get("/:id"')

    expect(membershipIndex).toBeGreaterThanOrEqual(0)
    expect(detailIndex).toBeGreaterThanOrEqual(0)
    expect(membershipIndex).toBeLessThan(detailIndex)
  })

  it("does not reuse user-management permissions for the lookup", () => {
    expect(routeSource).not.toContain("users:view")
    expect(routeSource).not.toContain("users:update")
  })
})
