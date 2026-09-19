import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react"
import { usePortalChild } from "@/hooks/usePortal"
import { PageContainer } from "@/components/layout/PageContainer"
import { PersonAvatar } from "@/components/shared/PersonAvatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { formatFullDate } from "@/lib/format"
import { portalChildPhotoUrl } from "@/lib/photoUrl"
import { AttendanceSection } from "@/components/portal/AttendanceSection"
import { FeesSection } from "@/components/portal/FeesSection"
import { ResultsSection } from "@/components/portal/ResultsSection"
import { TasksSection } from "@/components/portal/TasksSection"
import { TransportSection } from "@/components/portal/TransportSection"
import { LibrarySection } from "@/components/portal/LibrarySection"

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  )
}

export function PortalChildPage() {
  const { studentId = "" } = useParams<{ studentId: string }>()
  const { data, isLoading, isError } = usePortalChild(studentId)
  const [tab, setTab] = useState("overview")

  return (
    <PageContainer>
      <Link
        to="/portal"
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to portal
      </Link>

      {isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : isError || !data ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          This record is not available. If it belongs to someone else, it is hidden from your portal.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <PersonAvatar
                name={data.name}
                photoUrl={portalChildPhotoUrl(data.id, data.photoUrl)}
                className="size-12 text-lg"
              />
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{data.name}</h1>
                <p className="font-mono text-sm text-muted-foreground">{data.admissionNumber}</p>
              </div>
            </div>
            {data.status && (
              <Badge variant="outline" className="w-fit">{data.status.toLowerCase()}</Badge>
            )}
          </div>

          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="fees">Fees</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="tasks">Homework & Assignments</TabsTrigger>
              <TabsTrigger value="transport">Transport</TabsTrigger>
              <TabsTrigger value="library">Library</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailItem label="Class" value={data.enrollment?.className ?? "—"} />
                  <DetailItem label="Section" value={data.enrollment?.sectionName ?? "—"} />
                  <DetailItem label="Session" value={data.enrollment?.academicSessionName ?? "—"} />
                  <DetailItem label="Date of birth" value={data.dateOfBirth ? formatFullDate(data.dateOfBirth) : "—"} />
                  <DetailItem label="Gender" value={data.gender ?? "—"} />
                  <DetailItem label="Admission date" value={data.admissionDate ? formatFullDate(data.admissionDate) : "—"} />
                  <DetailItem label="Phone" value={data.phone ?? "—"} />
                  <DetailItem label="Email" value={data.email ?? "—"} />
                  <DetailItem label="City" value={data.city ?? "—"} />
                </div>

                {data.guardians.length > 0 && (
                  <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                      Guardians
                    </p>
                    <ul className="flex flex-col gap-3">
                      {data.guardians.map((guardian) => (
                        <li key={guardian.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">{guardian.name}</span>
                          <span className="text-muted-foreground">· {guardian.relationshipType || "Guardian"}</span>
                          {guardian.isPrimary && (
                            <Badge variant="outline" className="bg-primary/10 text-primary">Primary</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  Enrolment recorded through the school's academic sessions. Data is visible only to this account.
                </div>
              </div>
            </TabsContent>

            <TabsContent value="attendance">
              <AttendanceSection studentId={data.id} />
            </TabsContent>
            <TabsContent value="fees">
              <FeesSection studentId={data.id} />
            </TabsContent>
            <TabsContent value="results">
              <ResultsSection studentId={data.id} />
            </TabsContent>
            <TabsContent value="tasks">
              <TasksSection studentId={data.id} />
            </TabsContent>
            <TabsContent value="transport">
              <TransportSection studentId={data.id} />
            </TabsContent>
            <TabsContent value="library">
              <LibrarySection studentId={data.id} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </PageContainer>
  )
}