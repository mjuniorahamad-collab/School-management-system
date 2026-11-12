import { api } from "@/lib/apiClient"
import type {
  GrantMembershipPermissionResult,
  MembershipPermissionsView,
} from "@/types/membershipPermissions"

export const membershipPermissionsService = {
  get(membershipId: string): Promise<MembershipPermissionsView> {
    return api.get<MembershipPermissionsView>(`/memberships/${membershipId}/permissions`)
  },
  grant(
    membershipId: string,
    permissionCode: string,
  ): Promise<GrantMembershipPermissionResult> {
    return api.post<GrantMembershipPermissionResult>(
      `/memberships/${membershipId}/permissions`,
      { permissionCode },
    )
  },
}
