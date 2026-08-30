import { ArrowLeft, BadgeCheck, CalendarDays, Hash, Mail, MapPin, Pencil, Phone, Users } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { StudentAvatar } from "@/components/shared/StudentAvatar"
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useStudent } from "@/hooks/useStudents"
import { formatFullDate } from "@/lib/format"

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string | null
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-sm text-foreground">{value || "—"}</p>
      </div>
    </div>
  )
}

export function StudentDetailPage() {
  const { id = "" } = useParams()
  const { can } = useAuth()
  const { data: student, isPending, isError, refetch } = useStudent(id)

  const place = student?.enrollment

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/students">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to students
          </Link>
        </Button>
        {can("students:update") && student && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/students/${student.id}/edit`}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit student
            </Link>
          </Button>
        )}
      </div>

      {isPending && <StudentDetailSkeleton />}

      {isError && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">Could not load this student's record.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {student && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start">
              <StudentAvatar name={student.name} className="size-16 text-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    {student.name}
                  </h2>
                  <StudentStatusBadge status={student.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {student.admissionNumber}
                  {place
                    ? ` · Class ${place.class.name}-${place.section.name}`
                    : " · Not placed this session"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {student.gender.charAt(0).toUpperCase() + student.gender.slice(1).toLowerCase()}
                  </Badge>
                  <Badge variant="outline">
                    Admitted {formatFullDate(student.admissionDate)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Personal & contact</CardTitle>
                <CardDescription data-slot="card-description">
                  Identity and communication details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  <DetailRow
                    icon={CalendarDays}
                    label="Date of birth"
                    value={formatFullDate(student.dateOfBirth)}
                  />
                  <DetailRow icon={BadgeCheck} label="Gender" value={student.gender} />
                  <DetailRow icon={Mail} label="Email" value={student.email} />
                  <DetailRow icon={Phone} label="Phone" value={student.phone} />
                  <DetailRow
                    icon={MapPin}
                    label="Address"
                    value={[student.addressLine1, student.addressLine2, student.city, student.state, student.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrollment</CardTitle>
                <CardDescription data-slot="card-description">
                  Current academic placement
                </CardDescription>
              </CardHeader>
              <CardContent>
                {place ? (
                  <div className="divide-y">
                    <DetailRow
                      icon={CalendarDays}
                      label="Academic session"
                      value={place.academicSession.name}
                    />
                    <DetailRow icon={Hash} label="Class" value={`Class ${place.class.name}`} />
                    <DetailRow icon={Hash} label="Section" value={`Section ${place.section.name}`} />
                    <DetailRow
                      icon={BadgeCheck}
                      label="Session status"
                      value={place.academicSession.status}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No enrollment record for the current academic session.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Guardians</CardTitle>
                <CardDescription data-slot="card-description">
                  Parent or guardian contact information
                </CardDescription>
              </CardHeader>
              <CardContent>
                {student.guardians.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No guardians on record.</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {student.guardians.map((guardian) => (
                      <li
                        key={guardian.id}
                        className="rounded-lg border border-border/60 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                          <p className="truncate text-sm font-medium text-foreground">
                            {guardian.name}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="secondary">
                            {guardian.relationshipType
                              .split("_")
                              .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                              .join(" ")}
                          </Badge>
                          {guardian.isPrimary && <Badge variant="outline">Primary</Badge>}
                          {guardian.isEmergencyContact && (
                            <Badge variant="outline">Emergency contact</Badge>
                          )}
                        </div>
                        <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Phone className="size-3.5" aria-hidden="true" />
                            {guardian.phone || "No phone"}
                          </span>
                          {guardian.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="size-3.5" aria-hidden="true" />
                              <span className="truncate">{guardian.email}</span>
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function StudentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-36" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}