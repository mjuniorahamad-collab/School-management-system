import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ApiClientError } from "@/lib/apiClient"
import { studentsService } from "@/services/studentsService"
import type {
  StudentDetail,
  StudentFormPayload,
  StudentsMeta,
  StudentsQuery,
} from "@/types/students"

interface ValidationIssue {
  path?: string
  message?: string
}

/** Surfaces the most useful message from an API failure, including zod issues. */
function describeError(error: Error): string {
  if (!(error instanceof ApiClientError)) return error.message
  const issues = error.details as { issues?: ValidationIssue[] } | undefined
  if (issues?.issues && issues.issues.length > 0) {
    return issues.issues
      .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))
      .join("; ")
  }
  return error.message
}

const STUDENTS_QUERY_KEY = ["students"] as const

const QUERY_KEYS = {
  students: (query: StudentsQuery) => ["students", "list", query] as const,
  student: (id: string) => ["students", "detail", id] as const,
  meta: ["students", "meta"] as const,
}

export function useStudents(query: StudentsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.students(query),
    queryFn: () => studentsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.student(id ?? ""),
    queryFn: () => studentsService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useStudentsMeta() {
  return useQuery<StudentsMeta>({
    queryKey: QUERY_KEYS.meta,
    queryFn: studentsService.meta,
    staleTime: 5 * 60_000,
  })
}

export function useCreateStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: StudentFormPayload) => studentsService.create(payload),
    onSuccess: (student: StudentDetail) => {
      queryClient.removeQueries({ queryKey: QUERY_KEYS.meta })
      queryClient.setQueryData<StudentDetail>(QUERY_KEYS.student(student.id), student)
      queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY })
      toast.success("Student added", {
        description: `${student.name} (${student.admissionNumber}) enrolled in Class ${student.enrollment?.class.name ?? "—"}.`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not add student", { description: describeError(error) })
    },
  })
}

export function useUpdateStudent(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<StudentFormPayload>) => studentsService.update(id, payload),
    onSuccess: (student: StudentDetail) => {
      queryClient.setQueryData<StudentDetail>(QUERY_KEYS.student(student.id), student)
      queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY })
      toast.success("Student updated", { description: `${student.name}'s record was saved.` })
    },
    onError: (error: Error) => {
      toast.error("Could not update student", { description: describeError(error) })
    },
  })
}

/** Upload/replace + remove mutations for a student's profile photo. */
export function useStudentPhoto(id: string) {
  const queryClient = useQueryClient()

  const patchPhotoUrl = (photoUrl: string | null) => {
    queryClient.setQueryData<StudentDetail>(QUERY_KEYS.student(id), (current) =>
      current ? { ...current, photoUrl } : current,
    )
    queryClient.invalidateQueries({ queryKey: STUDENTS_QUERY_KEY })
  }

  const upload = useMutation({
    mutationFn: (file: File) => studentsService.uploadPhoto(id, file),
    onSuccess: (result) => {
      patchPhotoUrl(result.photoUrl)
      toast.success("Photo updated", { description: "The profile photo was saved." })
    },
    onError: (error: Error) => {
      toast.error("Could not upload photo", { description: describeError(error) })
    },
  })

  const remove = useMutation({
    mutationFn: () => studentsService.removePhoto(id),
    onSuccess: (result) => {
      patchPhotoUrl(result.photoUrl)
      toast.success("Photo removed", { description: "The profile photo was removed." })
    },
    onError: (error: Error) => {
      toast.error("Could not remove photo", { description: describeError(error) })
    },
  })

  return {
    uploadPhoto: upload.mutate,
    removePhoto: remove.mutate,
    isUploading: upload.isPending,
    isRemoving: remove.isPending,
  }
}