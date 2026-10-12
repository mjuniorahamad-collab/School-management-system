// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TimetablePage } from "@/pages/timetable/TimetablePage"
import type { TimetableEntryListItem } from "@/types/timetable"

// Page-level regression for the Grid/List view-mode bug.
//
// The page conditionally mounts either TimetableGrid or TimetableList, so a
// view that hides itself responsively (`hidden lg:block` on the populated
// grid, `lg:hidden` on the populated list) blanks the entire timetable when
// selected at the "wrong" width. These tests mount the real page and the real
// view components; only the data seams are substituted. jsdom cannot compute
// styles, so visibility is asserted as the class contract the bug violated:
// the mounted view's root must carry no hidden-utility token.
//
// NOTE: once a session is selected the page also renders TimetablePrintDocument,
// which itself contains a <table>. Queries below are scoped to the on-screen view
// root so the print copy never satisfies (or breaks) a screen assertion.
//
// Decision A: the weekly timetable is meaningful for one session only. Until a
// session is chosen the page renders a prompt, never runs the timetable query and
// never mounts the print document.

const {
  useTimetableEntriesMock,
  useDeleteTimetableEntryMock,
  refetchMock,
  listSessionsMock,
  listClassesMock,
  listSectionsMock,
  listSubjectsMock,
  listTeachersMock,
  listPeriodSlotsMock,
} = vi.hoisted(() => ({
  useTimetableEntriesMock: vi.fn(),
  useDeleteTimetableEntryMock: vi.fn(),
  refetchMock: vi.fn(),
  listSessionsMock: vi.fn(),
  listClassesMock: vi.fn(),
  listSectionsMock: vi.fn(),
  listSubjectsMock: vi.fn(),
  listTeachersMock: vi.fn(),
  listPeriodSlotsMock: vi.fn(),
}))

vi.mock("@/hooks/useTimetable", () => ({
  useTimetableEntries: useTimetableEntriesMock,
  useDeleteTimetableEntry: useDeleteTimetableEntryMock,
  useCreateTimetableEntry: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUpdateTimetableEntry: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCopyTimetableDay: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({ can: () => true }),
}))

// The page hosts the Timetable print document, whose letterhead reads
// branding through TanStack Query. Branding is stubbed like the other
// page-level suites do.
vi.mock("@/hooks/useBranding", () => ({
  useBranding: () => ({ data: { schoolName: "Test School", tagline: "" } }),
}))

vi.mock("@/services/academicSessionsService", () => ({
  academicSessionsService: { list: listSessionsMock },
}))
vi.mock("@/services/classesService", () => ({ classesService: { list: listClassesMock } }))
vi.mock("@/services/sectionsService", () => ({ sectionsService: { list: listSectionsMock } }))
vi.mock("@/services/subjectsService", () => ({ subjectsService: { list: listSubjectsMock } }))
vi.mock("@/services/teachersService", () => ({ teachersService: { list: listTeachersMock } }))
vi.mock("@/services/masterDataService", () => ({
  periodSlotsService: { list: listPeriodSlotsMock },
}))

const SESSION_ID = "sess-1"
const CLASS_SIX = "cls-6"
const CLASS_SEVEN = "cls-7"
const SECTION_A = "sec-6a"

function entry(overrides: Partial<TimetableEntryListItem> = {}): TimetableEntryListItem {
  return {
    id: "entry-math-6a",
    academicSessionId: SESSION_ID,
    dayOfWeek: "MONDAY",
    periodSlotId: "slot-1",
    periodSlotName: "Period 1",
    periodSlotStartTime: "08:00",
    periodSlotEndTime: "08:45",
    classId: CLASS_SIX,
    className: "6",
    sectionId: SECTION_A,
    sectionName: "A",
    subjectId: "subject-math",
    subjectName: "Mathematics",
    subjectCode: "MAT",
    teacherId: "teacher-1",
    teacherName: "Tim Timetable",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  }
}

// Two lessons share Monday + Period 1 (the multi-entry cell case), one sits on
// Tuesday in another class.
const ENGLISH_6B = entry({
  id: "entry-eng-6b",
  sectionId: "sec-6b",
  sectionName: "B",
  subjectId: "subject-eng",
  subjectName: "English",
  subjectCode: "ENG",
  teacherId: "teacher-2",
  teacherName: "Rita Reader",
})
const SCIENCE_7 = entry({
  id: "entry-sci-7",
  dayOfWeek: "TUESDAY",
  classId: CLASS_SEVEN,
  className: "7",
  sectionId: null,
  sectionName: null,
  subjectId: "subject-sci",
  subjectName: "Science",
  subjectCode: "SCI",
  teacherId: "teacher-3",
  teacherName: "Sam Scholar",
})
const DEFAULT_ENTRIES = [entry(), ENGLISH_6B, SCIENCE_7]

function mockTimetableQuery(
  result: {
    items?: TimetableEntryListItem[]
    isPending?: boolean
    isError?: boolean
  } = {},
) {
  const items = result.items ?? DEFAULT_ENTRIES
  useTimetableEntriesMock.mockReturnValue({
    data: result.isPending || result.isError ? undefined : { items, total: items.length },
    isPending: result.isPending ?? false,
    isError: result.isError ?? false,
    refetch: refetchMock,
  })
}

const originalMatchMedia = window.matchMedia

function stubViewport(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*1024px/.test(query) ? width >= 1024 : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  vi.clearAllMocks()
  stubViewport(1280)
  mockTimetableQuery()
  useDeleteTimetableEntryMock.mockReturnValue({ mutate: vi.fn(), isPending: false })
  listSessionsMock.mockReturnValue({
    items: [{ id: SESSION_ID, name: "Academic Year 2026", code: "AY2026", status: "ACTIVE" }],
    total: 1,
  })
  listClassesMock.mockReturnValue({
    items: [
      { id: CLASS_SIX, name: "6" },
      { id: CLASS_SEVEN, name: "7" },
    ],
    total: 2,
  })
  listSectionsMock.mockReturnValue({ items: [{ id: SECTION_A, name: "A" }], total: 1 })
  listSubjectsMock.mockReturnValue({ items: [], total: 0 })
  listTeachersMock.mockReturnValue({ items: [], total: 0 })
  listPeriodSlotsMock.mockReturnValue({
    items: [
      {
        id: "slot-1",
        name: "Period 1",
        startTime: "08:00",
        endTime: "08:45",
        sortOrder: 1,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ],
    total: 1,
  })

  // Radix Select drives a scrollable listbox and measures the viewport. jsdom
  // provides neither, so the Select cannot open without these shims.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimetablePage />
    </QueryClientProvider>,
  )
}

const sessionTrigger = () => screen.queryByRole("combobox", { name: "Academic session" })
const classTrigger = () => screen.queryByRole("combobox", { name: "Class" })
const sectionTrigger = () => screen.queryByRole("combobox", { name: "Section" })

/**
 * Radix opens its listbox from a pointerdown that looks like a real primary
 * click. The options come from queries that resolve a tick after render, so
 * the matching option is awaited rather than read synchronously.
 */
async function pick(trigger: HTMLElement | null, label: string) {
  fireEvent.pointerDown(trigger as HTMLElement, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  })
  fireEvent.click(await screen.findByRole("option", { name: label }))
}

function switchView(label: "Grid view" | "List view") {
  fireEvent.click(screen.getByRole("button", { name: label }))
}

/** Renders the page, then selects the only session so the timetable is in scope. */
async function renderPageWithSession() {
  const utils = renderPage()
  await pick(sessionTrigger(), "Academic Year 2026")
  return utils
}

function lastTimetableQuery(): Record<string, string | undefined> {
  const calls = useTimetableEntriesMock.mock.calls
  return calls[calls.length - 1][0] as Record<string, string | undefined>
}

function lastTimetableEnabled(): boolean | undefined {
  const calls = useTimetableEntriesMock.mock.calls
  return (calls[calls.length - 1][1] as { enabled?: boolean } | undefined)?.enabled
}

/** The on-screen grid table, never the always-mounted print document table. */
function screenTable(container: HTMLElement): HTMLTableElement | null {
  return container.querySelector("table:not(.print-document-table)")
}

/** Root element of whichever view is currently mounted on screen. */
function viewRoot(container: HTMLElement): HTMLElement {
  const table = screenTable(container)
  if (table) return table.closest("div.overflow-hidden") as HTMLElement
  const list = container.querySelector("ul.divide-y")
  if (list) return list.closest("div.overflow-hidden") as HTMLElement
  throw new Error("No timetable view is mounted")
}

/** Tokens like `hidden` / `lg:hidden` that force display:none at some width. */
function visibilityHidingTokens(root: Element | null): string[] {
  if (!root) return ["<no root>"]
  return root.className
    .split(/\s+/)
    .filter((token) => /^(?:[a-z0-9-]+:)*hidden$/.test(token))
}

function expectAllSubjectsVisible(container: HTMLElement) {
  const scope = viewRoot(container)
  expect(within(scope).getByText("Mathematics")).toBeTruthy()
  expect(within(scope).getByText("English")).toBeTruthy()
  expect(within(scope).getByText("Science")).toBeTruthy()
}

describe("TimetablePage session gating", () => {
  it("prompts for a session and neither runs the query nor mounts a view or print document", () => {
    const { container } = renderPage()

    expect(screen.getByText("Select an academic session to view the timetable.")).toBeTruthy()
    expect(container.querySelector("table")).toBeNull()
    expect(container.querySelector("ul.divide-y")).toBeNull()
    expect(lastTimetableEnabled()).toBe(false)
    expect(lastTimetableQuery()).toEqual({
      academicSessionId: undefined,
      classId: undefined,
      sectionId: undefined,
    })
  })

  it("keeps the print action hidden until a session is selected", async () => {
    renderPage()
    expect(screen.queryByRole("button", { name: "Print timetable" })).toBeNull()

    await pick(sessionTrigger(), "Academic Year 2026")
    expect(screen.queryByRole("button", { name: "Print timetable" })).toBeTruthy()
  })

  it("scopes the timetable query to the selected session once chosen", async () => {
    await renderPageWithSession()

    expect(lastTimetableEnabled()).toBe(true)
    expect(lastTimetableQuery()).toEqual({
      academicSessionId: SESSION_ID,
      classId: undefined,
      sectionId: undefined,
    })
  })
})

describe("TimetablePage view modes", () => {
  it("opens on the Grid at desktop widths and renders shared-cell lessons together", async () => {
    stubViewport(1280)
    const { container } = await renderPageWithSession()

    const table = screenTable(container)
    expect(table).toBeTruthy()
    expectAllSubjectsVisible(container)

    const cell = within(table as HTMLElement).getByText("Mathematics").closest("td")
    expect(cell?.contains(within(table as HTMLElement).getByText("English"))).toBe(true)

    expect(visibilityHidingTokens(table?.closest("div.overflow-hidden") ?? null)).toEqual([])
  })

  it("renders the same entries in List on desktop instead of a blank area", async () => {
    stubViewport(1280)
    const { container } = await renderPageWithSession()

    switchView("List view")

    expect(screenTable(container)).toBeNull()
    expect(container.querySelectorAll("ul.divide-y > li")).toHaveLength(3)
    expectAllSubjectsVisible(container)
    expect(visibilityHidingTokens(viewRoot(container))).toEqual([])
  })

  it("keeps the same entries and query arguments across Grid → List → Grid → List", async () => {
    stubViewport(1280)
    const { container } = await renderPageWithSession()

    expectAllSubjectsVisible(container)

    switchView("List view")
    expectAllSubjectsVisible(container)
    expect(container.querySelectorAll("ul.divide-y > li")).toHaveLength(3)

    switchView("Grid view")
    expectAllSubjectsVisible(container)
    expect(screenTable(container)).toBeTruthy()

    switchView("List view")
    expectAllSubjectsVisible(container)
    expect(container.querySelectorAll("ul.divide-y > li")).toHaveLength(3)

    // Every enabled fetch stays scoped to the chosen session; no all-session union.
    const enabledCalls = useTimetableEntriesMock.mock.calls.filter(
      (call) => (call[1] as { enabled?: boolean } | undefined)?.enabled === true,
    )
    expect(enabledCalls.length).toBeGreaterThan(1)
    for (const [args] of enabledCalls) {
      expect(Object.keys(args as object).sort()).toEqual([
        "academicSessionId",
        "classId",
        "sectionId",
      ])
      expect(args).toEqual({
        academicSessionId: SESSION_ID,
        classId: undefined,
        sectionId: undefined,
      })
    }
  })

  it("passes the same class and section filter arguments in either view", async () => {
    stubViewport(1280)
    const { container } = renderPage()

    await pick(sessionTrigger(), "Academic Year 2026")
    expect(lastTimetableQuery()).toEqual({
      academicSessionId: SESSION_ID,
      classId: undefined,
      sectionId: undefined,
    })

    await pick(classTrigger(), "6")
    expect(lastTimetableQuery()).toEqual({
      academicSessionId: SESSION_ID,
      classId: CLASS_SIX,
      sectionId: undefined,
    })

    await screen.findByRole("combobox", { name: "Section" })
    await pick(sectionTrigger(), "A")
    expect(lastTimetableQuery()).toEqual({
      academicSessionId: SESSION_ID,
      classId: CLASS_SIX,
      sectionId: SECTION_A,
    })

    switchView("List view")
    expect(lastTimetableQuery()).toEqual({
      academicSessionId: SESSION_ID,
      classId: CLASS_SIX,
      sectionId: SECTION_A,
    })
    expectAllSubjectsVisible(container)

    await pick(classTrigger(), "All classes")
    expect(lastTimetableQuery()).toEqual({
      academicSessionId: SESSION_ID,
      classId: undefined,
      sectionId: undefined,
    })
    expect(screen.queryByRole("combobox", { name: "Section" })).toBeNull()
  })

  it("keeps the loading skeleton visible for the selected view", async () => {
    stubViewport(1280)
    mockTimetableQuery({ isPending: true })
    const { container } = await renderPageWithSession()

    expect(container.querySelector("[data-slot='skeleton']")).toBeTruthy()

    switchView("List view")
    expect(container.querySelector("[data-slot='skeleton']")).toBeTruthy()
  })

  it("keeps the empty state visible for the selected view", async () => {
    stubViewport(1280)
    mockTimetableQuery({ items: [] })
    await renderPageWithSession()

    expect(screen.getByText("No timetable entries")).toBeTruthy()

    switchView("List view")
    expect(screen.getByText("No timetable entries")).toBeTruthy()
  })

  it("keeps the error state visible, with a working retry, in the selected view", async () => {
    stubViewport(1280)
    mockTimetableQuery({ isError: true })
    await renderPageWithSession()

    expect(screen.getByText("Could not load the timetable.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(refetchMock).toHaveBeenCalledTimes(1)

    switchView("List view")
    expect(screen.getByText("Could not load the timetable.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(refetchMock).toHaveBeenCalledTimes(2)
  })

  it("starts on Grid at ≥1024px and on List below it", async () => {
    stubViewport(1280)
    const desktop = await renderPageWithSession()
    expect(screenTable(desktop.container)).toBeTruthy()
    cleanup()

    stubViewport(360)
    const mobile = await renderPageWithSession()
    expect(screenTable(mobile.container)).toBeNull()
    expect(mobile.container.querySelectorAll("ul.divide-y > li")).toHaveLength(3)
  })

  it("still renders the Grid on demand at mobile widths, without hiding classes", async () => {
    stubViewport(360)
    const { container } = await renderPageWithSession()
    expect(screenTable(container)).toBeNull()

    switchView("Grid view")

    const table = screenTable(container)
    expect(table).toBeTruthy()
    expectAllSubjectsVisible(container)
    expect(visibilityHidingTokens(table?.closest("div.overflow-hidden") ?? null)).toEqual([])
  })
})
