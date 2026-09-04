import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { StudentForm } from "@/components/students/StudentForm"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCreateStudent, useStudent, useStudentsMeta, useUpdateStudent } from "@/hooks/useStudents"
import type { StudentFormPayload } from "@/types/students"

export function StudentFormPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const { data: meta, isPending: metaPending } = useStudentsMeta()
  const { data: student, isPending: studentPending, isError: studentError } = useStudent(
    isEdit ? id : undefined,
  )
  const createMutation = useCreateStudent()
  const updateMutation = useUpdateStudent(id)

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const handleSubmit = async (payload: StudentFormPayload) => {
    if (isEdit) {
      const updated = await updateMutation.mutateAsync(payload)
      navigate(`/students/${updated.id}`, { replace: true })
    } else {
      const created = await createMutation.mutateAsync(payload)
      navigate(`/students/${created.id}`, { replace: true })
    }
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {isEdit ? "Edit student" : "Add a new student"}
        </h1>
        <Button variant="ghost" size="sm" asChild>
          <Link to={isEdit ? `/students/${id}` : "/students"}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {isEdit ? "Back to record" : "Back to students"}
          </Link>
        </Button>
      </div>

      {studentPending && isEdit ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      ) : studentError && isEdit ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">Could not load this student's record.</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/students">Back to students</Link>
          </Button>
        </div>
      ) : (
        <StudentForm
          mode={isEdit ? "edit" : "create"}
          meta={metaPending ? undefined : meta}
          initial={isEdit ? student : null}
          isSubmitting={isSubmitting}
          onSubmit={(payload) => void handleSubmit(payload)}
        />
      )}
    </PageContainer>
  )
}