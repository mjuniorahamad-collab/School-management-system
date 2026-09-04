import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateNotice, useUpdateNotice } from "@/hooks/useNotices"
import { defaultNoticeForm, noticeFormToPayload, validateNoticeForm } from "@/lib/noticeFormRules"
import type { NoticeFormValue } from "@/lib/noticeFormRules"
import { noticesService } from "@/services/communicationService"
import type { NoticeDetail, NoticeListItem } from "@/types/communication"

interface NoticeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: NoticeListItem | null
}

export function NoticeFormDialog({ open, onOpenChange, editing }: NoticeFormDialogProps) {
  const { data: detail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["notices", "detail", editing?.id],
    queryFn: () => noticesService.get(editing!.id),
    enabled: open && Boolean(editing),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open &&
        (editing && isDetailLoading ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit notice</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </DialogContent>
        ) : (
          <Content
            key={editing?.id ?? "new"}
            editing={editing}
            detail={detail}
            onOpenChange={onOpenChange}
          />
        ))}
    </Dialog>
  )
}

function Content({
  editing,
  detail,
  onOpenChange,
}: {
  editing: NoticeListItem | null
  detail?: NoticeDetail
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<NoticeFormValue>(() =>
    editing && detail
      ? {
          title: detail.title,
          body: detail.body,
          audience: (detail.audience as NoticeFormValue["audience"]) ?? "EVERYONE",
          status: (detail.status as NoticeFormValue["status"]) ?? "DRAFT",
          priority: (detail.priority as NoticeFormValue["priority"]) ?? "MEDIUM",
        }
      : defaultNoticeForm(),
  )

  const createMutation = useCreateNotice()
  const updateMutation = useUpdateNotice(editing?.id ?? "")
  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = <K extends keyof NoticeFormValue>(field: K, value: NoticeFormValue[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateNoticeForm(form)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    const payload = noticeFormToPayload(form)
    if (editing) {
      updateMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => toast.error(error.message),
      })
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit notice" : "New notice"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the notice details and lifecycle."
            : "Compose a notice to announce to your school audiences."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notice-title">Title</Label>
          <Input
            id="notice-title"
            value={form.title}
            onChange={(event) => setField("title", event.target.value)}
            placeholder="e.g. Mid-Term Break"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notice-body">Body</Label>
          <Textarea
            id="notice-body"
            value={form.body}
            onChange={(event) => setField("body", event.target.value)}
            placeholder="Write the notice content…"
            rows={5}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-audience">Audience</Label>
            <Select
              value={form.audience}
              onValueChange={(value) => setField("audience", value as NoticeFormValue["audience"])}
            >
              <SelectTrigger id="notice-audience" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EVERYONE">Everyone</SelectItem>
                <SelectItem value="STUDENTS">Students</SelectItem>
                <SelectItem value="PARENTS">Parents</SelectItem>
                <SelectItem value="TEACHERS">Teachers</SelectItem>
                <SelectItem value="STAFF">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-priority">Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(value) => setField("priority", value as NoticeFormValue["priority"])}
            >
              <SelectTrigger id="notice-priority" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setField("status", value as NoticeFormValue["status"])}
            >
              <SelectTrigger id="notice-status" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {editing ? "Save changes" : "Create notice"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
