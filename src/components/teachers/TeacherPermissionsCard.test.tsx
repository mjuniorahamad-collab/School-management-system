// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { canUser } from "@/auth/can"
import type { AuthUser } from "@/auth/types"
import { TeacherPermissionsCard } from "@/components/teachers/TeacherPermissionsCard"
import type { MembershipPermissionsView } from "@/types/membershipPermissions"
import type { TeacherMembershipLookup } from "@/types/teachers"

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  membership: vi.fn(),
  getPermissions: vi.fn(),
  grantPermission: vi.fn(),
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: mocks.useAuth }))
vi.mock("@/services/teachersService", () => ({
  teachersService: { membership: mocks.membership },
}))
vi.mock("@/services/membershipPermissionsService", () => ({
  membershipPermissionsService: {
    get: mocks.getPermissions,
    grant: mocks.grantPermission,
  },
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

function permissions(
  overrides: Partial<MembershipPermissionsView> = {},
): MembershipPermissionsView {
  return {
    membershipId: "m1",
    schoolId: "sch1",
    role: "TEACHER",
    roleDefaultPermissions: ["students:view", "notices:view"],
    effectivePermissions: ["students:view", "notices:view"],
    grantablePermissions: ["notices:create", "events:create"],
    overrides: [],
    ...overrides,
  }
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u-1",
    name: "Test User",
    email: "user@example.com",
    status: "ACTIVE",
    school: { id: "s-1", name: "Test School" },
    roles: ["TEACHER"],
    permissions: [],
    memberships: [],
    ...overrides,
  }
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface RenderOptions {
  user?: AuthUser
  membershipData?: TeacherMembershipLookup
  permissionsData?: MembershipPermissionsView
}

function renderCard({
  user = makeUser({
    permissions: ["membership-permissions:view", "membership-permissions:grant"],
  }),
  membershipData = { membershipId: "m1" },
  permissionsData = permissions(),
}: RenderOptions = {}) {
  mocks.useAuth.mockReturnValue({
    can: (permission: string) => canUser(user, permission),
  })
  mocks.membership.mockResolvedValue(membershipData)
  mocks.getPermissions.mockResolvedValue(permissionsData)

  return render(
    <QueryClientProvider client={makeClient()}>
      <TeacherPermissionsCard teacherId="t1" />
    </QueryClientProvider>,
  )
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("TeacherPermissionsCard", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset()
    mocks.membership.mockReset()
    mocks.getPermissions.mockReset()
    mocks.grantPermission.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("does not grant access from the TEACHER role label alone", async () => {
    const view = renderCard({
      user: makeUser({ roles: ["TEACHER"], permissions: [] }),
    })

    await flush()

    expect(view.container.innerHTML).toBe("")
    expect(mocks.membership).toHaveBeenCalledTimes(0)
    expect(mocks.getPermissions).toHaveBeenCalledTimes(0)
  })

  it("renders nothing and fires neither query without membership-permissions:view", async () => {
    const view = renderCard({
      user: makeUser({ permissions: ["students:view"] }),
    })

    await flush()

    expect(view.container.innerHTML).toBe("")
    expect(mocks.membership).toHaveBeenCalledTimes(0)
    expect(mocks.getPermissions).toHaveBeenCalledTimes(0)
  })

  it("renders inherited and effective permissions without grant controls when grant is denied", async () => {
    renderCard({
      user: makeUser({ permissions: ["membership-permissions:view"] }),
      permissionsData: permissions({
        overrides: [{ permissionCode: "notices:create", effect: "ALLOW" }],
        effectivePermissions: ["students:view", "notices:view", "notices:create"],
      }),
    })

    expect(await screen.findByText("Inherited role permissions")).toBeTruthy()
    expect(screen.getByText("Effective access (3)")).toBeTruthy()
    expect(screen.getAllByText("students:view").length).toBeGreaterThan(0)
    expect(screen.getAllByText("notices:create").length).toBeGreaterThan(0)

    expect(screen.queryByText("Grant an extra permission")).toBeNull()
    expect(screen.queryByRole("button", { name: "Grant notices:create" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Grant events:create" })).toBeNull()
  })

  it("renders grant controls when view and grant are both granted", async () => {
    renderCard()

    expect(await screen.findByRole("button", { name: "Grant notices:create" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Grant events:create" })).toBeTruthy()
  })

  it("does not render the Extra permissions heading or any permission chips without view", async () => {
    const view = renderCard({
      user: makeUser({ permissions: ["students:view"] }),
    })

    await flush()

    expect(screen.queryByText("Extra permissions")).toBeNull()
    expect(screen.queryByText("students:view")).toBeNull()
    expect(screen.queryByText("notices:view")).toBeNull()
    expect(view.container.querySelectorAll("code")).toHaveLength(0)
  })

  it("renders inherited permissions separately from extra grants without grant authority", async () => {
    renderCard({
      user: makeUser({ permissions: ["membership-permissions:view"] }),
      permissionsData: permissions({
        overrides: [{ permissionCode: "notices:create", effect: "ALLOW" }],
        effectivePermissions: ["students:view", "notices:view", "notices:create"],
      }),
    })

    expect(await screen.findByText("Inherited role permissions")).toBeTruthy()
    expect(screen.getAllByText("students:view").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Extra permissions").length).toBeGreaterThan(0)
    expect(screen.getAllByText("notices:create").length).toBeGreaterThan(0)
    expect(screen.queryByText("Grant an extra permission")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Grant / })).toBeNull()
  })

  it("offers only server-provided grantable permissions and grants the selected code", async () => {
    mocks.grantPermission.mockResolvedValue({
      ...permissions(),
      outcome: "GRANTED",
    })

    renderCard({
      permissionsData: permissions({
        roleDefaultPermissions: ["students:view"],
        effectivePermissions: ["students:view"],
      }),
    })

    const noticesButton = await screen.findByRole("button", {
      name: "Grant notices:create",
    })
    expect(screen.getByRole("button", { name: "Grant events:create" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /fees:create/ })).toBeNull()

    fireEvent.click(noticesButton)

    await waitFor(() =>
      expect(mocks.grantPermission).toHaveBeenCalledWith("m1", "notices:create"),
    )
  })

  it("explains when the teacher has no eligible linked membership", async () => {
    renderCard({ membershipData: { membershipId: null } })

    expect(await screen.findByText(/not linked to an active login account/i)).toBeTruthy()
    expect(mocks.getPermissions).toHaveBeenCalledTimes(0)
  })

  it("shows an existing deny override without offering the blocked grant", async () => {
    renderCard({
      permissionsData: permissions({
        overrides: [{ permissionCode: "notices:create", effect: "DENY" }],
      }),
    })

    expect(await screen.findByText("Existing deny overrides")).toBeTruthy()
    expect(screen.getByText("Blocked")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Grant notices:create" })).toBeNull()
    expect(screen.getByRole("button", { name: "Grant events:create" })).toBeTruthy()
  })

  it("surfaces membership load failures with a retry action", async () => {
    mocks.membership.mockRejectedValueOnce(new Error("membership unavailable"))
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))

    await waitFor(() => expect(mocks.membership).toHaveBeenCalledTimes(2))
  })
})
