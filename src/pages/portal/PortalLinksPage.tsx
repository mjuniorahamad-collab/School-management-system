import { useState } from "react"
import type { FormEvent } from "react"
import { Link2, Link2Off, Plus, UserPlus } from "lucide-react"
import { useCreatePortalLink, useDeletePortalLink, usePortalLinkCandidates, usePortalLinks } from "@/hooks/usePortal"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PortalLink, PortalLinkProfileType } from "@/types/portal"

function LinkRow({ link, onUnlink }: { link: PortalLink; onUnlink: (link: PortalLink) => void }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{link.profileName}</p>
          <Badge variant="outline">{link.profileType === "STUDENT" ? "Student" : "Guardian"}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {link.userName ?? "No user"} {link.userEmail ? ` · ${link.userEmail}` : ""}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => onUnlink(link)}>
        <Link2Off className="size-4" aria-hidden="true" />
        Unlink
      </Button>
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
  const [open, setOpen] = useState(false)
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
        setOpen(false)
      },
    })
  }

  const handleUnlink = (link: PortalLink) => {
    if (!link.userId) return
    deleteLink.mutate({ profileType: link.profileType, profileId: link.profileId, userId: link.userId })
  }

  return (
    <PageContainer>
      <PageHeader
        title="Portal Accounts"
        description="Link student and guardian profiles to portal accounts so parents and students can sign in to their self-service portal."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Link profile
          </Button>
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
            No portal accounts linked yet. Use “Link profile” to grant portal access.
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
                  <LinkRow key={link.id} link={link} onUnlink={handleUnlink} />
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
                  <LinkRow key={link.id} link={link} onUnlink={handleUnlink} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link portal account</DialogTitle>
            <DialogDescription>
              Grant a user access to a student or guardian profile through the portal.
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