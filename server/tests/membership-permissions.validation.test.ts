import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/modules/membership-permissions/membership-permission.service.js", () => ({
  getMembershipPermissions: vi.fn(),
  grantMembershipPermission: vi.fn(),
}))

import { grantMembershipPermissionHandler } from "../src/modules/membership-permissions/membership-permission.controller.js"
import { grantMembershipPermission } from "../src/modules/membership-permissions/membership-permission.service.js"

const ACTOR = {
  id: "actor1",
  name: "Actor",
  email: "actor@example.com",
  school: { id: "sch1", name: "School" },
  roles: ["PRINCIPAL"],
  permissions: ["membership-permissions:grant"],
  status: "ACTIVE",
  memberships: [],
} as any

function makeResponse() {
  return { json: vi.fn() } as any
}

function makeRequest(body: unknown) {
  return {
    params: { membershipId: "mTarget" },
    body,
    auth: ACTOR,
  } as any
}

describe("membership permission grant - controller validation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects a DENY effect with the standard validation error before the service runs", async () => {
    const res = makeResponse()

    await expect(
      grantMembershipPermissionHandler(
        makeRequest({ permissionCode: "notices:create", effect: "DENY" }),
        res,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" })
    expect(grantMembershipPermission).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })

  it("rejects unexpected extra fields with the standard validation error", async () => {
    await expect(
      grantMembershipPermissionHandler(
        makeRequest({ permissionCode: "notices:create", reason: "because" }),
        makeResponse(),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" })
    expect(grantMembershipPermission).not.toHaveBeenCalled()
  })

  it("rejects a missing permission code", async () => {
    await expect(
      grantMembershipPermissionHandler(makeRequest({}), makeResponse()),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" })
    expect(grantMembershipPermission).not.toHaveBeenCalled()
  })

  it("passes a valid body to the service and returns the success envelope", async () => {
    ;(grantMembershipPermission as any).mockResolvedValue({ outcome: "GRANTED" })
    const res = makeResponse()

    await grantMembershipPermissionHandler(
      makeRequest({ permissionCode: "notices:create" }),
      res,
    )

    expect(grantMembershipPermission).toHaveBeenCalledWith(
      "mTarget",
      { permissionCode: "notices:create" },
      ACTOR,
    )
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { outcome: "GRANTED" } })
  })
})
