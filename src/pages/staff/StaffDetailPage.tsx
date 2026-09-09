import { useState } from "react"
import { ArrowLeft, Edit } from "lucide-react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { ProfilePhotoField } from "@/components/shared/ProfilePhotoField"
import { StaffFormDialog } from "@/components/staff/StaffFormDialog"
import { StaffStatusBadge } from "@/components/staff/StaffStatusBadge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useStaff, useStaffPhoto } from "@/hooks/useStaff"
import { formatFullDate } from "@/lib/format"
import type { EmployeeStatus } from "@/types/staff"

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  )
}

export function StaffDetailPage() {
  const { id = "" } = useParams()
  const [searchParams] = useSearchParams()
  const { can } = useAuth()
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.max(1, Number(searchParams.get("pageSize")) || 25)
  const { data, isPending, isError, refetch } = useStaff(id)
  const { uploadPhoto, removePhoto, isUploading, isRemoving } = useStaffPhoto(id)
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/staff?page=${page}&pageSize=${pageSize}`}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to staff
          </Link>
        </Button>
        {can("staff:update") && data && (
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Edit className="size-4" aria-hidden="true" />
            Edit staff member
          </Button>
        )}
      </div>

      {isPending && <StaffDetailSkeleton />}

      {isError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">Could not load this staff member's record.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
              <ProfilePhotoField
                kind="staff"
                personId={data.id}
                name={data.name}
                photoUrl={data.photoUrl}
                canEdit={can("staff:update")}
                onUpload={uploadPhoto}
                onRemove={removePhoto}
                isUploading={isUploading}
                isRemoving={isRemoving}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {data.name}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {data.employeeId} · {data.designation}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StaffStatusBadge status={data.status as EmployeeStatus} />
                  <Badge variant="outline">
                    {data.gender.charAt(0).toUpperCase() + data.gender.slice(1).toLowerCase()}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <DetailRow label="First name" value={data.firstName} />
                  <DetailRow label="Middle name" value={data.middleName ?? "—"} />
                  <DetailRow label="Last name" value={data.lastName ?? "—"} />
                  <DetailRow label="Date of birth" value={data.dateOfBirth ? formatFullDate(data.dateOfBirth) : "—"} />
                  <DetailRow label="Email" value={data.email ?? "—"} />
                  <DetailRow label="Phone" value={data.phone ?? "—"} />
                  <DetailRow label="Address" value={data.address ?? "—"} />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Employment details</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <DetailRow label="Department" value={data.department} />
                  <DetailRow label="Designation" value={data.designation} />
                  <DetailRow label="Qualification" value={data.qualification ?? "—"} />
                  <DetailRow label="Experience" value={data.experience != null ? `${data.experience} years` : "—"} />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Emergency contact</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <DetailRow label="Contact name" value={data.emergencyContactName ?? "—"} />
                  <DetailRow label="Relationship" value={data.emergencyContactRelationship ?? "—"} />
                  <DetailRow label="Phone" value={data.emergencyContactPhone ?? "—"} />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Dates</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <DetailRow label="Joining date" value={formatFullDate(data.joiningDate)} />
                  <DetailRow label="Last updated" value={formatFullDate(data.updatedAt)} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <StaffFormDialog open={dialogOpen} onOpenChange={setDialogOpen} staff={data} />
    </PageContainer>
  )
}

function StaffDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><Skeleton className="h-4 w-36" /></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-4 w-28" /></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
