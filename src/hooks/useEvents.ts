import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { eventsService } from "@/services/communicationService"
import type { EventFormPayload, EventsQuery } from "@/types/communication"

const EVENTS_GROUP = ["events"] as const

export function useEvents(query: EventsQuery) {
  return useQuery({
    queryKey: ["events", query],
    queryFn: () => eventsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: EventFormPayload) => eventsService.create(payload),
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: EVENTS_GROUP })
      toast.success("Event created", { description: event.title })
    },
    onError: (e: Error) => toast.error("Could not create event", { description: e.message }),
  })
}

export function useUpdateEvent(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<EventFormPayload>) => eventsService.update(id, payload),
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: EVENTS_GROUP })
      toast.success("Event updated", { description: event.title })
    },
    onError: (e: Error) => toast.error("Could not update event", { description: e.message }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => eventsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_GROUP })
      toast.success("Event deleted")
    },
    onError: (e: Error) => toast.error("Could not delete event", { description: e.message }),
  })
}
