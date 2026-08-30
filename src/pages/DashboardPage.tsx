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
import { useDashboardStats } from "@/hooks/useDashboardData"

export function DashboardPage() {
  const { data: stats, isPending, isError } = useDashboardStats()

  return (
    <PageContainer>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isPending &&
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-7 w-28 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ))}
        {isError && <div className="sr-only">Could not load dashboard statistics.</div>}
        {stats?.map((stat) => <StatCard key={stat.id} stat={stat} />)}
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