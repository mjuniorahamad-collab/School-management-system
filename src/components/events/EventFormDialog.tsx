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
import { useCreateEvent, useUpdateEvent } from "@/hooks/useEvents"
import { eventFormToPayload, validateEventForm, type EventFormValue } from "@/lib/eventFormRules"
import { eventsService } from "@/services/communicationService"
import type { EventDetail, EventListItem } from "@/types/communication"

interface EventFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: EventListItem | null
}

function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function EventFormDialog({ open, onOpenChange, editing }: EventFormDialogProps) {
  const { data: detail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["events", "detail", editing?.id],
    queryFn: () => eventsService.get(editing!.id),
    enabled: open && Boolean(editing),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open &&
        (editing && isDetailLoading ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit event</DialogTitle>
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
  editing: EventListItem | null
  detail?: EventDetail
  onOpenChange: (open: boolean) => void
}) {
  const [form, setForm] = useState<EventFormValue>(() =>
    editing && detail
      ? {
          title: detail.title,
          description: detail.description ?? "",
          category: (detail.category as EventFormValue["category"]) ?? "GENERAL",
          status: (detail.status as EventFormValue["status"]) ?? "SCHEDULED",
          startAt: toLocalInput(detail.startAt),
          endAt: toLocalInput(detail.endAt),
          location: detail.location ?? "",
        }
      : {
          title: "",
          description: "",
          category: "GENERAL",
          status: "SCHEDULED",
          startAt: "",
          endAt: "",
          location: "",
        },
  )

  const createMutation = useCreateEvent()
  const updateMutation = useUpdateEvent(editing?.id ?? "")
  const isSaving = createMutation.isPending || updateMutation.isPending

  const setField = <K extends keyof EventFormValue>(field: K, value: EventFormValue[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateEventForm(form)
    if (errors.length > 0) {
      toast.error(errors[0].message)
      return
    }
    const payload = eventFormToPayload(form)
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
        <DialogTitle>{editing ? "Edit event" : "New event"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the event details and timing."
            : "Schedule an event on the school calendar."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-title">Title</Label>
          <Input
            id="event-title"
            value={form.title}
            onChange={(event) => setField("title", event.target.value)}
            placeholder="e.g. Annual Sports Meet"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="event-description">Description</Label>
          <Textarea
            id="event-description"
            value={form.description}
            onChange={(event) => setField("description", event.target.value)}
            placeholder="Event description…"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(value) => setField("category", value as EventFormValue["category"])}
            >
              <SelectTrigger id="event-category" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GENERAL">General</SelectItem>
                <SelectItem value="ACADEMIC">Academic</SelectItem>
                <SelectItem value="SPORTS">Sports</SelectItem>
                <SelectItem value="CULTURAL">Cultural</SelectItem>
                <SelectItem value="COMMUNITY">Community</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setField("status", value as EventFormValue["status"])}
            >
              <SelectTrigger id="event-status" className="w-full">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="ONGOING">Ongoing</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-start">Starts</Label>
            <Input
              id="event-start"
              type="datetime-local"
              value={form.startAt}
              onChange={(event) => setField("startAt", event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event-end">Ends</Label>
            <Input
              id="event-end"
              type="datetime-local"
              value={form.endAt}
              onChange={(event) => setField("endAt", event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              value={form.location}
              onChange={(event) => setField("location", event.target.value)}
              placeholder="e.g. Main Hall"
            />
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
            {editing ? "Save changes" : "Create event"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
