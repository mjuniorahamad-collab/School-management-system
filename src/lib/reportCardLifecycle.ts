// Pure presentational helpers for the Report Cards lifecycle UI (M7.2).
//
// These functions NEVER compute or alter official report-card values. They only:
// - map frozen/server-provided enum values to labels and format server values;
// - resolve human-readable labels for ids the frozen snapshot does not carry
//   (names are LIVE reference data, not part of the snapshot);
// - describe the prerequisites for generating a new version.
//
// Every helper degrades to a safe fallback and never invents a value or surfaces
// a raw id as a friendly label.

import type { ReportCardStatus } from "@/types/reportCard"

/** The minimal shape of a reference row used for id-to-name resolution. */
export interface ReportCardLabelSource {
  id: string
  name: string
}

/** Resolved id-to-name maps for the labels the frozen snapshot does not carry. */
export interface ReportCardLabelMaps {
  sessionNames: ReadonlyMap<string, string>
  classNames: ReadonlyMap<string, string>
  sectionNames: ReadonlyMap<string, string>
  subjectNames: ReadonlyMap<string, string>
  examTypeNames: ReadonlyMap<string, string>
}

function toMap(rows?: readonly ReportCardLabelSource[]): Map<string, string> {
  return new Map((rows ?? []).map((row) => [row.id, row.name]))
}

/**
 * Builds the id-to-name maps from the loaded reference option lists. These names
 * are LIVE reference data: they are deliberately NOT part of the frozen
 * snapshot, so a rename after freeze changes the label but never the frozen
 * value.
 */
export function buildReportCardLabelMaps(source: {
  sessions?: readonly ReportCardLabelSource[]
  classes?: readonly ReportCardLabelSource[]
  sections?: readonly ReportCardLabelSource[]
  subjects?: readonly ReportCardLabelSource[]
  examTypes?: readonly ReportCardLabelSource[]
}): ReportCardLabelMaps {
  return {
    sessionNames: toMap(source.sessions),
    classNames: toMap(source.classes),
    sectionNames: toMap(source.sections),
    subjectNames: toMap(source.subjects),
    examTypeNames: toMap(source.examTypes),
  }
}

export function reportCardSessionName(
  id: string | null | undefined,
  maps: ReportCardLabelMaps,
): string {
  if (!id) return "—"
  return maps.sessionNames.get(id) ?? "Unknown session"
}

export function reportCardSubjectName(
  id: string | null | undefined,
  maps: ReportCardLabelMaps,
): string {
  if (!id) return "Unknown subject"
  return maps.subjectNames.get(id) ?? "Unknown subject"
}

export function reportCardExamTypeName(
  id: string | null | undefined,
  maps: ReportCardLabelMaps,
): string {
  if (!id) return "Unknown exam type"
  return maps.examTypeNames.get(id) ?? "Unknown exam type"
}

/** Human-readable class/section label. Never returns a raw id for a known row. */
export function describeReportCardScope(
  card: { classId: string; sectionId: string | null },
  maps: ReportCardLabelMaps,
): string {
  const className = maps.classNames.get(card.classId) ?? "Unknown class"
  if (!card.sectionId) return className
  const sectionName = maps.sectionNames.get(card.sectionId)
  return sectionName ? `${className} · Section ${sectionName}` : `${className} · Unknown section`
}

/**
 * Statuses that can legitimately have a PDF archive to retrieve. A DRAFT has no
 * archive (publishing precedes upload); a VOID version is never produced today.
 * This gates the download affordance only — the server remains authoritative and
 * returns 404 when no archive exists.
 */
export function canDownloadReportCardArchive(status: string | null | undefined): boolean {
  return status === "PENDING_ARCHIVE" || status === "ISSUED" || status === "SUPERSEDED"
}

/** Newest-first ordering by version (the API returns createdAt order). */
export function sortReportCardsByVersionDesc<T extends { version: number }>(
  cards: readonly T[],
): T[] {
  return [...cards].sort((a, b) => b.version - a.version)
}

export interface ReportCardGenerationPreconditions {
  /** A DRAFT already exists for the (session, student) — generation will conflict. */
  hasActiveDraft: boolean
  activeDraftVersion: number | null
  latestVersion: number | null
  latestStatus: ReportCardStatus | null
  /** The latest version is published, so a new version must record a reason. */
  requiresReissueReason: boolean
}

/**
 * Mirrors the backend generation rules (report-card.service.ts) so the dialog
 * can warn before submitting. It reads only status/version of the existing
 * versions — it never derives academic values.
 */
export function describeReportCardGeneration(
  cards: readonly { status: ReportCardStatus; version: number }[],
): ReportCardGenerationPreconditions {
  const draft = cards.find((card) => card.status === "DRAFT") ?? null
  const latest = sortReportCardsByVersionDesc(cards)[0] ?? null
  const requiresReissueReason =
    latest !== null && (latest.status === "PENDING_ARCHIVE" || latest.status === "ISSUED")
  return {
    hasActiveDraft: draft !== null,
    activeDraftVersion: draft?.version ?? null,
    latestVersion: latest?.version ?? null,
    latestStatus: latest?.status ?? null,
    requiresReissueReason,
  }
}

/**
 * Formats a server decimal percentage string for display. The value is rendered
 * verbatim (it is already the canonical frozen value) with a `%` suffix — it is
 * never re-rounded or recomputed here.
 */
export function formatReportCardPercentage(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  return `${value}%`
}

export function formatReportCardCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value)
}
