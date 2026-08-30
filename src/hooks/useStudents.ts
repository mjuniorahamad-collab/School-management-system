import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { studentsService } from "@/services/studentsService"
import type {
  StudentDetail,
  StudentFormPayload,
  StudentsMeta,
  StudentsQuery,
} from "@/types/students"

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
      toast.error("Could not add student", { description: error.message })
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
      toast.error("Could not update student", { description: error.message })
    },
  })
}