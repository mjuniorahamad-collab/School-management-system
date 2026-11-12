import { Banknote, Presentation, School, Users } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { StatCard } from "@/components/dashboard/StatCard"
import { AttendanceOverview } from "@/components/dashboard/AttendanceOverview"
import { FeesCollectionCard } from "@/components/dashboard/FeesCollectionCard"
import { RecentStudents } from "@/components/dashboard/RecentStudents"
import { TopPerformingClasses } from "@/components/dashboard/TopPerformingClasses"
import { QuickActions } from "@/components/dashboard/QuickActions"
import { UpcomingEvents } from "@/components/dashboard/UpcomingEvents"
import { ImportantNotices } from "@/components/dashboard/ImportantNotices"
import { FeeCollectionStatus } from "@/components/dashboard/FeeCollectionStatus"
import { BirthdayStudents } from "@/components/dashboard/BirthdayStudents"
import { RecentActivity } from "@/components/dashboard/RecentActivity"
import { useAuth } from "@/auth/useAuth"
import { useDashboardStats, useFeeStat } from "@/hooks/useDashboardData"
import type { DashboardStatTone } from "@/types/dashboard"

const STAT_PRESENTATION: Record<
  string,
  { icon: typeof Users; tone: DashboardStatTone }
> = {
  "total-students": { icon: Users, tone: "primary" },
  "total-teachers": { icon: Presentation, tone: "emerald" },
  "total-classes": { icon: School, tone: "sky" },
  "fees-collection": { icon: Banknote, tone: "amber" },
}

export function DashboardPage() {
  const { can } = useAuth()
  const canViewFees = can("fees:view")
  const statsQuery = useDashboardStats()
  const feeStatQuery = useFeeStat(canViewFees)

  const stats = [
    ...(statsQuery.data ?? []),
    ...(canViewFees && feeStatQuery.data ? [feeStatQuery.data] : []),
  ]
  const pendingCount =
    (statsQuery.isPending ? 3 : 0) + (canViewFees && feeStatQuery.isPending ? 1 : 0)
  const isError = statsQuery.isError || (canViewFees && feeStatQuery.isError)

  return (
    <PageContainer>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: pendingCount }).map((_, index) => (
          <div key={index} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-7 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        ))}
        {isError && <div className="sr-only">Could not load dashboard statistics.</div>}
        {stats.map((stat) => (
          <StatCard key={stat.id} stat={stat} presentation={STAT_PRESENTATION[stat.id]} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AttendanceOverview className="xl:col-span-2" />
        <TopPerformingClasses />
        <FeesCollectionCard className="xl:col-span-2" />
        <FeeCollectionStatus />
        <RecentStudents className="xl:col-span-2" />
        <UpcomingEvents />
        <QuickActions className="xl:col-span-1" />
        <ImportantNotices className="xl:col-span-2" />
        <RecentActivity className="xl:col-span-2" />
        <BirthdayStudents />
      </div>
    </PageContainer>
  )
}