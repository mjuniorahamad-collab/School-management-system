import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { staffService } from "@/services/staffService"
import type { StaffDetail, StaffFormPayload, StaffsQuery } from "@/types/staff"

const STAFF_QUERY_KEY = ["staff"] as const

const QUERY_KEYS = {
  list: (query: StaffsQuery) => ["staff", "list", query] as const,
  detail: (id: string) => ["staff", "detail", id] as const,
  meta: ["staff", "meta"] as const,
}

export function useStaffs(query: StaffsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.list(query),
    queryFn: () => staffService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useStaff(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.detail(id ?? ""),
    queryFn: () => staffService.get(id!),
    enabled: Boolean(id),
  })
}

export function useStaffMeta() {
  return useQuery({
    queryKey: QUERY_KEYS.meta,
    queryFn: () => staffService.meta(),
    staleTime: 5 * 60_000,
  })
}

export function useCreateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: StaffFormPayload) => staffService.create(payload),
    onSuccess: (staff) => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY })
      toast.success("Staff member created", {
        description: `${staff.name} (${staff.employeeId})`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not create staff member", { description: error.message })
    },
  })
}

export function useUpdateStaff(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<StaffFormPayload>) => staffService.update(id, payload),
    onSuccess: (staff) => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY })
      queryClient.setQueryData(QUERY_KEYS.detail(id), staff)
      toast.success("Staff member updated", { description: staff.name })
    },
    onError: (error: Error) => {
      toast.error("Could not update staff member", { description: error.message })
    },
  })
}

/** Upload/replace + remove mutations for a staff member's profile photo. */
export function useStaffPhoto(id: string) {
  const queryClient = useQueryClient()

  const patchPhotoUrl = (photoUrl: string | null) => {
    queryClient.setQueryData<StaffDetail>(QUERY_KEYS.detail(id), (current) =>
      current ? { ...current, photoUrl } : current,
    )
    queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY })
  }

  const upload = useMutation({
    mutationFn: (file: File) => staffService.uploadPhoto(id, file),
    onSuccess: (result) => {
      patchPhotoUrl(result.photoUrl)
      toast.success("Photo updated", { description: "The profile photo was saved." })
    },
    onError: (error: Error) => {
      toast.error("Could not upload photo", { description: error.message })
    },
  })

  const remove = useMutation({
    mutationFn: () => staffService.removePhoto(id),
    onSuccess: (result) => {
      patchPhotoUrl(result.photoUrl)
      toast.success("Photo removed", { description: "The profile photo was removed." })
    },
    onError: (error: Error) => {
      toast.error("Could not remove photo", { description: error.message })
    },
  })

  return {
    uploadPhoto: upload.mutate,
    removePhoto: remove.mutate,
    isUploading: upload.isPending,
    isRemoving: remove.isPending,
  }
}
