import { useState } from "react"
import type { FormEvent } from "react"
import { toast } from "sonner"
import { usePortalLinkCandidates, useProvisionPortalAccount } from "@/hooks/usePortal"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PortalLinkProfileType, ProvisionPortalAccountResult } from "@/types/portal"

interface CreatePortalAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProvisioned: (result: ProvisionPortalAccountResult) => void
}

/**
 * Form body is mounted only while the dialog is open (Radix unmounts closed
 * content), so it starts from clean state on every open without an effect.
 */
function ProvisionForm({
  onProvisioned,
  onCancel,
}: {
  onProvisioned: (result: ProvisionPortalAccountResult) => void
  onCancel: () => void
}) {
  const { data: candidates } = usePortalLinkCandidates()
  const provision = useProvisionPortalAccount()

  const [profileType, setProfileType] = useState<PortalLinkProfileType>("GUARDIAN")
  const [profileId, setProfileId] = useState("")
  const [parentName, setParentName] = useState("")
  const [email, setEmail] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const profileOptions = profileType === "STUDENT" ? (candidates?.students ?? []) : (candidates?.guardians ?? [])
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const canSubmit = Boolean(profileId && parentName.trim() && emailValid)

  const handleProfileType = (value: PortalLinkProfileType) => {
    setProfileType(value)
    setProfileId("")
  }

  const handleProfile = (value: string) => {
    setProfileId(value)
    if (profileType === "GUARDIAN") {
      const guardian = candidates?.guardians.find((option) => option.id === value)
      if (guardian) setParentName(guardian.name)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    try {
      const result = await provision.mutateAsync({
        profileType,
        profileId,
        parentName: parentName.trim(),
        email: email.trim().toLowerCase(),
      })
      onCancel()
      if (result.provisioned) {
        onProvisioned(result)
      } else {
        toast.success("Linked to an existing account", {
          description: `${result.profileName} is now linked to ${result.userEmail}. They can sign in with their existing password.`,
        })
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create the portal account")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profileType">Profile type</Label>
        <Select value={profileType} onValueChange={handleProfileType}>
          <SelectTrigger id="profileType" aria-label="Profile type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GUARDIAN">Guardian</SelectItem>
            <SelectItem value="STUDENT">Student</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="profileId">Profile</Label>
        <Select value={profileId} onValueChange={handleProfile}>
          <SelectTrigger id="profileId" aria-label="Profile">
            <SelectValue placeholder="Select a guardian or student" />
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
        {profileOptions.length === 0 && (
          <p className="text-xs text-muted-foreground">Every profile already has a portal account.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="parentName">Account holder name</Label>
        <Input
          id="parentName"
          value={parentName}
          maxLength={120}
          required
          onChange={(event) => setParentName(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="accountEmail">Email</Label>
        <Input
          id="accountEmail"
          type="email"
          autoComplete="email"
          placeholder="parent@example.com"
          value={email}
          maxLength={200}
          required
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {errorMessage}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={!canSubmit || provision.isPending}>
          {provision.isPending ? "Creating…" : "Create & generate link"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Creates a brand-new parent portal account for an unlinked profile: the
 * backend provisions the user + PARENT membership + profile link and mints a
 * one-time activation link. Existing emails are linked without an invite.
 */
export function CreatePortalAccountDialog({
  open,
  onOpenChange,
  onProvisioned,
}: CreatePortalAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create portal account</DialogTitle>
          <DialogDescription>
            Create a parent account and generate a one-time activation link they can use to set
            their own password.
          </DialogDescription>
        </DialogHeader>
        <ProvisionForm onProvisioned={onProvisioned} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}