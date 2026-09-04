import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ApiClientError } from "@/lib/apiClient"
import { admissionsService } from "@/services/admissionsService"
import type {
  AdmissionConvertResult,
  AdmissionDetail,
  AdmissionFormPayload,
  AdmissionsMeta,
  AdmissionsQuery,
  ConvertAdmissionPayload,
  ReviewAdmissionPayload,
} from "@/types/admissions"

interface ValidationIssue {
  path?: string
  message?: string
}

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

const ADMISSIONS_QUERY_KEY = ["admissions"] as const

const QUERY_KEYS = {
  admissions: (query: AdmissionsQuery) => ["admissions", "list", query] as const,
  admission: (id: string) => ["admissions", "detail", id] as const,
  meta: ["admissions", "meta"] as const,
}

export function useAdmissions(query: AdmissionsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.admissions(query),
    queryFn: () => admissionsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useAdmission(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.admission(id ?? ""),
    queryFn: () => admissionsService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useAdmissionsMeta() {
  return useQuery<AdmissionsMeta>({
    queryKey: QUERY_KEYS.meta,
    queryFn: admissionsService.meta,
    staleTime: 5 * 60_000,
  })
}

export function useCreateAdmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AdmissionFormPayload) => admissionsService.create(payload),
    onSuccess: (application: AdmissionDetail) => {
      queryClient.removeQueries({ queryKey: QUERY_KEYS.meta })
      queryClient.setQueryData<AdmissionDetail>(QUERY_KEYS.admission(application.id), application)
      queryClient.invalidateQueries({ queryKey: ADMISSIONS_QUERY_KEY })
      toast.success("Application added", {
        description: `${application.name} (${application.applicationNumber})`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not add application", { description: describeError(error) })
    },
  })
}

export function useUpdateAdmission(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<AdmissionFormPayload>) => admissionsService.update(id, payload),
    onSuccess: (application: AdmissionDetail) => {
      queryClient.setQueryData<AdmissionDetail>(QUERY_KEYS.admission(application.id), application)
      queryClient.invalidateQueries({ queryKey: ADMISSIONS_QUERY_KEY })
      toast.success("Application updated", { description: application.name })
    },
    onError: (error: Error) => {
      toast.error("Could not update application", { description: describeError(error) })
    },
  })
}

export function useReviewAdmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReviewAdmissionPayload }) =>
      admissionsService.review(id, payload),
    onSuccess: (application: AdmissionDetail) => {
      queryClient.setQueryData<AdmissionDetail>(QUERY_KEYS.admission(application.id), application)
      queryClient.invalidateQueries({ queryKey: ADMISSIONS_QUERY_KEY })
      toast.success("Application reviewed", { description: application.name })
    },
    onError: (error: Error) => {
      toast.error("Could not review application", { description: describeError(error) })
    },
  })
}

export function useConvertAdmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ConvertAdmissionPayload }) =>
      admissionsService.convert(id, payload),
    onSuccess: (result: AdmissionConvertResult) => {
      queryClient.setQueryData<AdmissionDetail>(
        QUERY_KEYS.admission(result.application.id),
        result.application,
      )
      queryClient.invalidateQueries({ queryKey: ADMISSIONS_QUERY_KEY })
      toast.success("Application converted", {
        description: `${result.student.name} is now enrolled (${result.student.admissionNumber}).`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not convert application", { description: describeError(error) })
    },
  })
}

export function useDeleteAdmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => admissionsService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMISSIONS_QUERY_KEY })
      toast.success("Application deleted")
    },
    onError: (error: Error) => {
      toast.error("Could not delete application", { description: describeError(error) })
    },
  })
}
