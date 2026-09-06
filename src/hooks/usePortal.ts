import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { portalService } from "@/services/portalService"
import type {
  CreateProfileLinkPayload,
  DeleteProfileLinkPayload,
} from "@/types/portal"

const GROUP = ["portal"] as const

export function usePortalOverview() {
  return useQuery({
    queryKey: ["portal", "overview"],
    queryFn: () => portalService.getOverview(),
  })
}

export function usePortalChildren() {
  return useQuery({
    queryKey: ["portal", "children"],
    queryFn: () => portalService.listChildren(),
  })
}

export function usePortalChild(studentId: string | null) {
  return useQuery({
    queryKey: ["portal", "child", studentId],
    queryFn: () => portalService.getChild(studentId ?? ""),
    enabled: Boolean(studentId),
  })
}

export function usePortalAttendance(studentId: string | null, sessionId?: string) {
  return useQuery({
    queryKey: ["portal", "attendance", studentId, sessionId],
    queryFn: () => portalService.getAttendance(studentId ?? "", sessionId),
    enabled: Boolean(studentId),
  })
}

export function usePortalFees(studentId: string | null, sessionId?: string) {
  return useQuery({
    queryKey: ["portal", "fees", studentId, sessionId],
    queryFn: () => portalService.getFees(studentId ?? "", sessionId),
    enabled: Boolean(studentId),
  })
}

export function usePortalResults(studentId: string | null, sessionId?: string) {
  return useQuery({
    queryKey: ["portal", "results", studentId, sessionId],
    queryFn: () => portalService.getResults(studentId ?? "", sessionId),
    enabled: Boolean(studentId),
  })
}

export function usePortalTasks(studentId: string | null, sessionId?: string) {
  return useQuery({
    queryKey: ["portal", "tasks", studentId, sessionId],
    queryFn: () => portalService.getTasks(studentId ?? "", sessionId),
    enabled: Boolean(studentId),
  })
}

export function usePortalTransport(studentId: string | null, sessionId?: string) {
  return useQuery({
    queryKey: ["portal", "transport", studentId, sessionId],
    queryFn: () => portalService.getTransport(studentId ?? "", sessionId),
    enabled: Boolean(studentId),
  })
}

export function usePortalLibraryLoans(studentId: string | null) {
  return useQuery({
    queryKey: ["portal", "library", studentId],
    queryFn: () => portalService.getLibraryLoans(studentId ?? ""),
    enabled: Boolean(studentId),
  })
}

export function usePortalNotices(limit = 30) {
  return useQuery({
    queryKey: ["portal", "notices", limit],
    queryFn: () => portalService.getNotices(limit),
  })
}

// Admin-side portal link management

export function usePortalLinks() {
  return useQuery({
    queryKey: ["portal", "links"],
    queryFn: () => portalService.listLinks(),
  })
}

export function usePortalLinkCandidates() {
  return useQuery({
    queryKey: ["portal", "links", "candidates"],
    queryFn: () => portalService.getLinkCandidates(),
  })
}

export function useCreatePortalLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProfileLinkPayload) => portalService.createLink(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Account linked", { description: "The profile is now accessible through the portal." })
    },
    onError: (e: Error) => toast.error("Could not link account", { description: e.message }),
  })
}

export function useDeletePortalLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DeleteProfileLinkPayload) => portalService.deleteLink(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Link removed", { description: "Portal access removed for that profile." })
    },
    onError: (e: Error) => toast.error("Could not remove link", { description: e.message }),
  })
}