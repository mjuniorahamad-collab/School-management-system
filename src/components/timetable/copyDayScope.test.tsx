// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { useCopyTimetableDay } from "@/hooks/useTimetable"
import { timetableService } from "@/services/timetableService"
import { CopyDayDialog } from "@/components/timetable/CopyDayDialog"
import type { PermissionCode } from "@/types/permissions"

// Coverage for the copy-day scope and its reporting.
//
// WHY: an administrator copies the whole day, a teacher copies only their own
// lessons (the server enforces exactly that scope). When the target slot was
// already occupied the lesson is SKIPPED — a silent skip would look like a
// successful whole-day copy, so the count has to reach the user.
//
// The rules this test pins down:
//   - the toast reports how many entries were copied;
//   - skipped entries are reported explicitly;
//   - nothing is skipped when nothing was skipped;
//   - the dialog tells a teacher that only their own lessons are copied.

vi.mock("@/services/timetableService", () => ({ timetableService: { copyDay: vi.fn() } }))

const copyDay = vi.mocked(timetableService.copyDay)

const { toastSuccessMock, authStateMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  authStateMock: { user: undefined as { roles?: string[] } | undefined },
}))

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: vi.fn() },
}))

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({ user: authStateMock.user, can: (() => true) as (code: PermissionCode) => boolean }),
}))

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

beforeEach(() => {
  copyDay.mockReset()
  toastSuccessMock.mockReset()
  authStateMock.user = { roles: ["SCHOOL_ADMIN"] }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("useCopyTimetableDay reporting", () => {
  it("reports the copied count", async () => {
    copyDay.mockResolvedValue({ copied: 4, skipped: 0 })

    const { result } = renderHook(() => useCopyTimetableDay(), { wrapper: wrapper(makeClient()) })
    result.current.mutate({
      academicSessionId: "sess-1",
      sourceDay: "MONDAY",
      targetDay: "TUESDAY",
    })

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1))
    expect(toastSuccessMock.mock.calls[0][0]).toContain("4")
  })

  it("reports skipped entries explicitly", async () => {
    copyDay.mockResolvedValue({ copied: 2, skipped: 3 })

    const { result } = renderHook(() => useCopyTimetableDay(), { wrapper: wrapper(makeClient()) })
    result.current.mutate({
      academicSessionId: "sess-1",
      sourceDay: "MONDAY",
      targetDay: "TUESDAY",
    })

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1))
    const options = toastSuccessMock.mock.calls[0][1] as { description?: string }
    expect(options.description).toMatch(/3/)
    expect(options.description).toMatch(/skipped/i)
  })

  it("adds no skipped note when nothing was skipped", async () => {
    copyDay.mockResolvedValue({ copied: 2, skipped: 0 })

    const { result } = renderHook(() => useCopyTimetableDay(), { wrapper: wrapper(makeClient()) })
    result.current.mutate({
      academicSessionId: "sess-1",
      sourceDay: "MONDAY",
      targetDay: "TUESDAY",
    })

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1))
    const options = toastSuccessMock.mock.calls[0][1] as { description?: string }
    expect(options.description).toBeUndefined()
  })
})

describe("CopyDayDialog scope wording", () => {
  function renderDialog() {
    const client = makeClient()
    return render(
      <QueryClientProvider client={client}>
        <CopyDayDialog open onOpenChange={() => {}} academicSessionId="sess-1" />
      </QueryClientProvider>,
    )
  }

  it("tells an administrator that the whole day is copied", () => {
    authStateMock.user = { roles: ["SCHOOL_ADMIN"] }
    renderDialog()

    expect(screen.getByText(/copy all scheduled entries/i)).toBeTruthy()
  })

  it("tells a teacher that only their own lessons are copied", () => {
    authStateMock.user = { roles: ["TEACHER"] }
    renderDialog()

    expect(screen.getByText(/copy your scheduled entries/i)).toBeTruthy()
    expect(screen.getByText(/lessons of other teachers are left untouched/i)).toBeTruthy()
  })
})
