import { useState } from "react"
import type { FormEvent } from "react"
import { Link2, Link2Off, Plus, RefreshCw, UserPlus } from "lucide-react"
import {
  useCreatePortalLink,
  useDeletePortalLink,
  usePortalLinkCandidates,
  usePortalLinks,
  useRegenerateActivation,
} from "@/hooks/usePortal"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { ActivationLinkDialog } from "@/components/portal/ActivationLinkDialog"
import { CreatePortalAccountDialog } from "@/components/portal/CreatePortalAccountDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PortalActivationStatus, PortalLink, PortalLinkProfileType, ProvisionPortalAccountResult } from "@/types/portal"

const ACTIVATION_LABELS: Record<PortalActivationStatus, string> = {
  NONE: "Not activated",
  PENDING: "Invitation pending",
  ACTIVATED: "Active",
}

const ACTIVATION_CLASSES: Record<PortalActivationStatus, string> = {
  NONE: "text-muted-foreground",
  PENDING: "border-amber-300 text-amber-700",
  ACTIVATED: "border-emerald-300 text-emerald-700",
}

function activationActionLabel(status: PortalActivationStatus): string {
  if (status === "ACTIVATED") return "Reset password"
  if (status === "PENDING") return "Regenerate link"
  return "Send activation link"
}

function LinkRow({
  link,
  regenerating,
  onUnlink,
  onRegenerate,
}: {
  link: PortalLink
  regenerating: boolean
  onUnlink: (link: PortalLink) => void
  onRegenerate: (link: PortalLink) => void
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{link.profileName}</p>
          <Badge variant="outline">{link.profileType === "STUDENT" ? "Student" : "Guardian"}</Badge>
          <Badge variant="outline" className={ACTIVATION_CLASSES[link.activation.status]}>
            {ACTIVATION_LABELS[link.activation.status]}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {link.userName ?? "No user"} {link.userEmail ? ` · ${link.userEmail}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {link.userId && (
          <Button variant="outline" size="sm" disabled={regenerating} onClick={() => onRegenerate(link)}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {activationActionLabel(link.activation.status)}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onUnlink(link)}>
          <Link2Off className="size-4" aria-hidden="true" />
          Unlink
        </Button>
      </div>
    </li>
  )
}

interface CreateLinkFormState {
  profileType: PortalLinkProfileType
  profileId: string
  userId: string
}

export function PortalLinksPage() {
  const { data: links, isLoading, isError } = usePortalLinks()
  const { data: candidates } = usePortalLinkCandidates()
  const createLink = useCreatePortalLink()
  const deleteLink = useDeletePortalLink()
  const regenerate = useRegenerateActivation()

  const [createAccountOpen, setCreateAccountOpen] = useState(false)
  const [linkExistingOpen, setLinkExistingOpen] = useState(false)
  const [activationLink, setActivationLink] = useState<{ token: string; expiresAt: string } | null>(null)
  const [regeneratingUserId, setRegeneratingUserId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateLinkFormState>({
    profileType: "STUDENT",
    profileId: "",
    userId: "",
  })

  const profileOptions = form.profileType === "STUDENT" ? (candidates?.students ?? []) : (candidates?.guardians ?? [])
  const canSubmit = Boolean(form.profileId && form.userId)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    createLink.mutate(form, {
      onSuccess: () => {
        setForm({ profileType: "STUDENT", profileId: "", userId: "" })
        setLinkExistingOpen(false)
      },
    })
  }

  const handleUnlink = (link: PortalLink) => {
    if (!link.userId) return
    deleteLink.mutate({ profileType: link.profileType, profileId: link.profileId, userId: link.userId })
  }

  const handleRegenerate = async (link: PortalLink) => {
    if (!link.userId) return
    setRegeneratingUserId(link.userId)
    try {
      const result = await regenerate.mutateAsync({ userId: link.userId })
      setActivationLink({ token: result.token, expiresAt: result.expiresAt })
    } catch {
      // The hook surfaces the error via the mutation state; keep the dialog closed.
    } finally {
      setRegeneratingUserId(null)
    }
  }

  const handleProvisioned = (result: ProvisionPortalAccountResult) => {
    if (result.token && result.expiresAt) {
      setActivationLink({ token: result.token, expiresAt: result.expiresAt })
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Portal Accounts"
        description="Create parent portal accounts, send one-time activation links, and manage profile access."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setLinkExistingOpen(true)}>
              <Link2 className="size-4" aria-hidden="true" />
              Link existing user
            </Button>
            <Button onClick={() => setCreateAccountOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Create portal account
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : isError || !links ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Could not load portal account links.
        </p>
      ) : links.studentLinks.length === 0 && links.guardianLinks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <UserPlus className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No portal accounts yet. Use “Create portal account” to invite a parent.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
              Student portal access
            </h2>
            {links.studentLinks.length === 0 ? (
              <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">No student links.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {links.studentLinks.map((link) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    regenerating={regeneratingUserId === link.userId}
                    onUnlink={handleUnlink}
                    onRegenerate={handleRegenerate}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
              Guardian portal access
            </h2>
            {links.guardianLinks.length === 0 ? (
              <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">No guardian links.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {links.guardianLinks.map((link) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    regenerating={regeneratingUserId === link.userId}
                    onUnlink={handleUnlink}
                    onRegenerate={handleRegenerate}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <CreatePortalAccountDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        onProvisioned={handleProvisioned}
      />

      <ActivationLinkDialog
        open={activationLink !== null}
        onOpenChange={(open) => {
          if (!open) setActivationLink(null)
        }}
        token={activationLink?.token ?? null}
        expiresAt={activationLink?.expiresAt ?? null}
      />

      <Dialog open={linkExistingOpen} onOpenChange={setLinkExistingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link existing user</DialogTitle>
            <DialogDescription>
              Grant an existing user access to a student or guardian profile through the portal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profileType">Profile type</Label>
              <Select
                value={form.profileType}
                onValueChange={(value: PortalLinkProfileType) =>
                  setForm((prev) => ({ ...prev, profileType: value, profileId: "" }))
                }
              >
                <SelectTrigger id="profileType" aria-label="Profile type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">Student</SelectItem>
                  <SelectItem value="GUARDIAN">Guardian</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profileId">Profile</Label>
              <Select value={form.profileId} onValueChange={(value: string) => setForm((prev) => ({ ...prev, profileId: value }))}>
                <SelectTrigger id="profileId" aria-label="Profile">
                  <SelectValue placeholder="Select a student or guardian" />
                </SelectTrigger>
                <SelectContent>
                  {profileOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      {option.code ? ` (${option.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="userId">Portal user</Label>
              <Select value={form.userId} onValueChange={(value: string) => setForm((prev) => ({ ...prev, userId: value }))}>
                <SelectTrigger id="userId" aria-label="Portal user">
                  <SelectValue placeholder="Select a user account" />
                </SelectTrigger>
                <SelectContent>
                  {(candidates?.users ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                      {user.email ? ` · ${user.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!canSubmit || createLink.isPending}>
                {createLink.isPending ? "Linking…" : "Link account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}