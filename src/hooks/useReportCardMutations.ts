import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { reportCardService } from "@/services/reportCardService"
import { reportCardKeys } from "@/hooks/reportCardQueryKeys"
import { reportCardErrorMessage } from "@/lib/reportCardErrors"
import type { GenerateReportCardInput } from "@/types/reportCard"

/** Generates a new version (invalidates every report-card list). */
export function useGenerateReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: GenerateReportCardInput) => reportCardService.generate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportCardKeys.lists() })
      toast.success("Report card generated")
    },
    onError: (e: Error) =>
      toast.error("Could not generate report card", { description: reportCardErrorMessage(e) }),
  })
}

/** DRAFT → PENDING_ARCHIVE; invalidates lists and the affected detail. */
export function usePublishReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reportCardService.publish(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportCardKeys.all })
      toast.success("Report card published")
    },
    onError: (e: Error) =>
      toast.error("Could not publish report card", { description: reportCardErrorMessage(e) }),
  })
}

/** PENDING_ARCHIVE → ISSUED; invalidates lists and the affected detail. */
export function useIssueReportCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reportCardService.issue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportCardKeys.all })
      toast.success("Report card issued")
    },
    onError: (e: Error) =>
      toast.error("Could not issue report card", { description: reportCardErrorMessage(e) }),
  })
}

/** Uploads and confirms the version's PDF archive (multipart field "pdf"). */
export function useAttachReportCardArchive(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => reportCardService.attachArchive(id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportCardKeys.detail(id) })
      toast.success("PDF archive attached")
    },
    onError: (e: Error) =>
      toast.error("Could not attach PDF archive", { description: reportCardErrorMessage(e) }),
  })
}
