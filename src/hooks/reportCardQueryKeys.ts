// Centralized TanStack Query keys for the Report Card domain. Every hook
// imports from here so invalidation targets stay consistent.

import type { ReportCardListQuery } from "@/types/reportCard"
import type { ReportCardSchemeListQuery } from "@/types/reportCardScheme"

export const reportCardKeys = {
  all: ["report-cards"] as const,
  lists: () => ["report-cards", "list"] as const,
  list: (query: ReportCardListQuery) => ["report-cards", "list", query] as const,
  details: () => ["report-cards", "detail"] as const,
  detail: (id: string) => ["report-cards", "detail", id] as const,
}

export const reportCardSchemeKeys = {
  all: ["report-card-schemes"] as const,
  lists: () => ["report-card-schemes", "list"] as const,
  list: (query: ReportCardSchemeListQuery) => ["report-card-schemes", "list", query] as const,
  details: () => ["report-card-schemes", "detail"] as const,
  detail: (id: string) => ["report-card-schemes", "detail", id] as const,
}
