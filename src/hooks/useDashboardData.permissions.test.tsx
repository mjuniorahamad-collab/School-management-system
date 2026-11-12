// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import type { Mock } from "vitest"
import {
  useAttendance,
  useBirthdayStudents,
  useDashboardStats,
  useFeeAnalytics,
  useFeeCollectionStatus,
  useFeeStat,
  useImportantNotices,
  useRecentActivities,
  useRecentStudents,
  useTopPerformingClasses,
  useUpcomingEvents,
} from "@/hooks/useDashboardData"
import { dashboardService } from "@/services/dashboardService"

vi.mock("@/services/dashboardService", () => {
  const query = () => vi.fn().mockResolvedValue({})
  return {
    dashboardService: {
      getStats: query(),
      getFeeStat: query(),
      getAttendance: query(),
      getFeeAnalytics: query(),
      getFeeCollectionStatus: query(),
      getRecentStudents: query(),
      getTopPerformingClasses: query(),
      getUpcomingEvents: query(),
      getImportantNotices: query(),
      getRecentActivities: query(),
      getBirthdayStudents: query(),
    },
  }
})

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

interface HookCase {
  name: string
  service: Mock
  render: (enabled?: boolean) => void
}

const CASES: HookCase[] = [
  {
    name: "useDashboardStats",
    service: dashboardService.getStats as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useDashboardStats(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useFeeStat",
    service: dashboardService.getFeeStat as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useFeeStat(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useAttendance",
    service: dashboardService.getAttendance as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useAttendance("today", enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useFeeAnalytics",
    service: dashboardService.getFeeAnalytics as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useFeeAnalytics("session", enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useFeeCollectionStatus",
    service: dashboardService.getFeeCollectionStatus as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useFeeCollectionStatus(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useRecentStudents",
    service: dashboardService.getRecentStudents as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useRecentStudents(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useTopPerformingClasses",
    service: dashboardService.getTopPerformingClasses as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useTopPerformingClasses(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useUpcomingEvents",
    service: dashboardService.getUpcomingEvents as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useUpcomingEvents(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useImportantNotices",
    service: dashboardService.getImportantNotices as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useImportantNotices(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useRecentActivities",
    service: dashboardService.getRecentActivities as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useRecentActivities(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
  {
    name: "useBirthdayStudents",
    service: dashboardService.getBirthdayStudents as unknown as Mock,
    render: (enabled) => {
      renderHook(() => useBirthdayStudents(enabled), { wrapper: wrapper(makeClient()) })
    },
  },
]

beforeEach(() => {
  for (const { service } of CASES) {
    service.mockReset()
    service.mockResolvedValue({})
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("dashboard query enabled gate", () => {
  it.each(CASES)("$name does not fetch when disabled", async ({ render, service }) => {
    render(false)
    await flush()
    expect(service).not.toHaveBeenCalled()
  })

  it.each(CASES)("$name defaults to enabled", async ({ render, service }) => {
    render()
    await waitFor(() => expect(service).toHaveBeenCalledTimes(1))
  })
})
