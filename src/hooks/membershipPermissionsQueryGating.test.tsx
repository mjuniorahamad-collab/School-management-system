// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import {
  useGrantMembershipPermission,
  useMembershipPermissions,
  useTeacherMembership,
} from "@/hooks/useMembershipPermissions"
import { ApiClientError } from "@/lib/apiClient"
import { membershipPermissionsService } from "@/services/membershipPermissionsService"
import { teachersService } from "@/services/teachersService"
import type { MembershipPermissionsView } from "@/types/membershipPermissions"

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock("@/services/teachersService", () => ({
  teachersService: { membership: vi.fn() },
}))
vi.mock("@/services/membershipPermissionsService", () => ({
  membershipPermissionsService: { get: vi.fn(), grant: vi.fn() },
}))

const lookupMembership = vi.mocked(teachersService.membership)
const getPermissions = vi.mocked(membershipPermissionsService.get)
const grantPermission = vi.mocked(membershipPermissionsService.grant)

const PERMISSION_VIEW: MembershipPermissionsView = {
  membershipId: "m1",
  schoolId: "sch1",
  role: "TEACHER",
  roleDefaultPermissions: [],
  effectivePermissions: [],
  grantablePermissions: [],
  overrides: [],
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  lookupMembership.mockReset()
  getPermissions.mockReset()
  grantPermission.mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.info).mockReset()
  vi.mocked(toast.error).mockReset()
  lookupMembership.mockResolvedValue({ membershipId: "m1" })
  getPermissions.mockResolvedValue(PERMISSION_VIEW)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useTeacherMembership enabled gate", () => {
  it("does not call the teacher membership service when disabled", async () => {
    renderHook(() => useTeacherMembership("t1", false), {
      wrapper: wrapper(makeClient()),
    })

    await flush()
    expect(lookupMembership).not.toHaveBeenCalled()
  })

  it("calls the teacher membership service when enabled", async () => {
    renderHook(() => useTeacherMembership("t1", true), {
      wrapper: wrapper(makeClient()),
    })

    await waitFor(() => expect(lookupMembership).toHaveBeenCalledWith("t1"))
  })
})

describe("useMembershipPermissions enabled gate", () => {
  it("does not call the permission service when disabled", async () => {
    renderHook(() => useMembershipPermissions("m1", false), {
      wrapper: wrapper(makeClient()),
    })

    await flush()
    expect(getPermissions).not.toHaveBeenCalled()
  })

  it("does not call the permission service without a membership id", async () => {
    renderHook(() => useMembershipPermissions(null, true), {
      wrapper: wrapper(makeClient()),
    })

    await flush()
    expect(getPermissions).not.toHaveBeenCalled()
  })

  it("calls the permission service when enabled with a membership id", async () => {
    renderHook(() => useMembershipPermissions("m1", true), {
      wrapper: wrapper(makeClient()),
    })

    await waitFor(() => expect(getPermissions).toHaveBeenCalledWith("m1"))
  })
})

describe("useGrantMembershipPermission outcomes", () => {
  async function runGrant(client: QueryClient) {
    const hook = renderHook(() => useGrantMembershipPermission("t1"), {
      wrapper: wrapper(client),
    })
    await act(async () => {
      await hook.result.current.mutateAsync({
        membershipId: "m1",
        permissionCode: "notices:create",
      })
    })
    return hook
  }

  it("reports GRANTED and invalidates membership and permission queries", async () => {
    const client = makeClient()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    grantPermission.mockResolvedValue({ ...PERMISSION_VIEW, outcome: "GRANTED" })

    await runGrant(client)

    expect(grantPermission).toHaveBeenCalledWith("m1", "notices:create")
    expect(toast.success).toHaveBeenCalledWith("Extra permission granted", {
      description: "notices:create was added to this membership.",
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["teachers", "membership", "t1"],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["membership-permissions", "detail", "m1"],
    })
  })

  it.each([
    ["ALREADY_GRANTED", "Permission already granted"],
    ["ALREADY_INHERITED", "Permission already inherited"],
  ] as const)("reports %s as a no-op", async (outcome, title) => {
    const client = makeClient()
    grantPermission.mockResolvedValue({ ...PERMISSION_VIEW, outcome })

    await runGrant(client)

    expect(toast.info).toHaveBeenCalledWith(title, expect.any(Object))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("surfaces a DENY conflict without mutating the record", async () => {
    const client = makeClient()
    const invalidate = vi.spyOn(client, "invalidateQueries")
    grantPermission.mockRejectedValue(
      new ApiClientError(409, "An existing DENY override conflicts", "PERMISSION_GRANT_CONFLICT"),
    )

    const hook = renderHook(() => useGrantMembershipPermission("t1"), {
      wrapper: wrapper(client),
    })
    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({
          membershipId: "m1",
          permissionCode: "notices:create",
        }),
      ).rejects.toMatchObject({ code: "PERMISSION_GRANT_CONFLICT" })
    })

    expect(toast.error).toHaveBeenCalledWith("Permission grant conflict", {
      description: "An existing DENY override conflicts",
    })
    expect(invalidate).not.toHaveBeenCalled()
  })
})
