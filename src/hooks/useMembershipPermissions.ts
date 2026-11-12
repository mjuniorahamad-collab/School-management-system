import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ApiClientError } from "@/lib/apiClient"
import { membershipPermissionsService } from "@/services/membershipPermissionsService"
import { teachersService } from "@/services/teachersService"

export const membershipPermissionsQueryKeys = {
  teacherMembership: (teacherId: string) => ["teachers", "membership", teacherId] as const,
  detail: (membershipId: string) => ["membership-permissions", "detail", membershipId] as const,
}

export function useTeacherMembership(teacherId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: membershipPermissionsQueryKeys.teacherMembership(teacherId ?? ""),
    queryFn: () => teachersService.membership(teacherId!),
    enabled: enabled && Boolean(teacherId),
  })
}

export function useMembershipPermissions(
  membershipId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: membershipPermissionsQueryKeys.detail(membershipId ?? ""),
    queryFn: () => membershipPermissionsService.get(membershipId!),
    enabled: enabled && Boolean(membershipId),
  })
}

interface GrantMembershipPermissionVariables {
  membershipId: string
  permissionCode: string
}

export function useGrantMembershipPermission(teacherId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ membershipId, permissionCode }: GrantMembershipPermissionVariables) =>
      membershipPermissionsService.grant(membershipId, permissionCode),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: membershipPermissionsQueryKeys.teacherMembership(teacherId),
      })
      void queryClient.invalidateQueries({
        queryKey: membershipPermissionsQueryKeys.detail(variables.membershipId),
      })

      if (result.outcome === "GRANTED") {
        toast.success("Extra permission granted", {
          description: `${variables.permissionCode} was added to this membership.`,
        })
        return
      }
      if (result.outcome === "ALREADY_GRANTED") {
        toast.info("Permission already granted", {
          description: `${variables.permissionCode} is already an extra permission.`,
        })
        return
      }
      toast.info("Permission already inherited", {
        description: `${variables.permissionCode} is already provided by the role.`,
      })
    },
    onError: (error: Error) => {
      const isConflict =
        error instanceof ApiClientError && error.code === "PERMISSION_GRANT_CONFLICT"
      toast.error(isConflict ? "Permission grant conflict" : "Could not grant permission", {
        description: error.message,
      })
    },
  })
}
