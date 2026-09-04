import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { noticesService } from "@/services/communicationService"
import type { NoticeFormPayload, NoticesQuery } from "@/types/communication"

const NOTICES_GROUP = ["notices"] as const

export function useNotices(query: NoticesQuery) {
  return useQuery({
    queryKey: ["notices", query],
    queryFn: () => noticesService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useCreateNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: NoticeFormPayload) => noticesService.create(payload),
    onSuccess: (notice) => {
      qc.invalidateQueries({ queryKey: NOTICES_GROUP })
      toast.success("Notice created", { description: notice.title })
    },
    onError: (e: Error) => toast.error("Could not create notice", { description: e.message }),
  })
}

export function useUpdateNotice(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<NoticeFormPayload>) => noticesService.update(id, payload),
    onSuccess: (notice) => {
      qc.invalidateQueries({ queryKey: NOTICES_GROUP })
      toast.success("Notice updated", { description: notice.title })
    },
    onError: (e: Error) => toast.error("Could not update notice", { description: e.message }),
  })
}

/** Publishes a draft notice (server stamps `publishedAt`). */
export function usePublishNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => noticesService.update(id, { status: "PUBLISHED" }),
    onSuccess: (notice) => {
      qc.invalidateQueries({ queryKey: NOTICES_GROUP })
      toast.success("Notice published", { description: notice.title })
    },
    onError: (e: Error) => toast.error("Could not publish notice", { description: e.message }),
  })
}

export function useDeleteNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => noticesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTICES_GROUP })
      toast.success("Notice deleted")
    },
    onError: (e: Error) => toast.error("Could not delete notice", { description: e.message }),
  })
}
