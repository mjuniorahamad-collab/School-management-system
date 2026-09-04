import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { classesService } from "@/services/classesService"
import { sectionsService } from "@/services/sectionsService"
import type { SectionFormPayload, SectionsQuery } from "@/types/sections"

const SECTIONS_QUERY_KEY = ["sections"] as const
const CLASSES_QUERY_KEY = ["classes"] as const

const QUERY_KEYS = {
  list: (query: SectionsQuery) => ["sections", "list", query] as const,
}

export function useClassesOptions() {
  return useQuery({
    queryKey: ["classes", "options"],
    queryFn: () => classesService.list({}),
    staleTime: 5 * 60_000,
  })
}

export function useSections(query: SectionsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.list(query),
    queryFn: () => sectionsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useCreateSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SectionFormPayload) => sectionsService.create(payload),
    onSuccess: (section) => {
      queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY })
      toast.success("Section created", {
        description: `Section ${section.name} · Class ${section.className}`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not create section", { description: error.message })
    },
  })
}

export function useUpdateSection(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<SectionFormPayload>) => sectionsService.update(id, payload),
    onSuccess: (section) => {
      queryClient.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY })
      toast.success("Section updated", {
        description: `Section ${section.name} · Class ${section.className}`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not update section", { description: error.message })
    },
  })
}
