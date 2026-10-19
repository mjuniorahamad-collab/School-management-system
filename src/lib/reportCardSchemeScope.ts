// Pure scope helpers for the Report Card scheme configuration UI (M7.1).
//
// A scheme's identity is (academicSessionId, classId, scopeKey) where scopeKey is
// the section id, or the class-level sentinel when the scheme targets a whole
// class. Everything here is deterministic and unit-testable without a database.

import type { ReportCardSchemeDetail } from "@/types/reportCardScheme"

/**
 * Class-level scope key. Mirrors the backend `CLASS_SCOPE_KEY`
 * (server/src/modules/report-card-schemes/report-card-scheme.rules.ts). The
 * frontend needs its own copy because the backend does not export it over the API.
 */
export const CLASS_SCOPE_KEY = "__CLASS__"

/** Section-filter value meaning "every scheme in scope" (client-side only). */
export const SECTION_FILTER_ALL = "__ALL__"

/** Section-filter value meaning "class-level schemes only" (client-side only). */
export const SECTION_FILTER_CLASS = CLASS_SCOPE_KEY

export interface SchemeScope {
  academicSessionId: string
  classId: string
  sectionId: string | null
}

/** Derives the canonical scope key from a section id (`__CLASS__` when absent). */
export function deriveScopeKey(sectionId: string | null | undefined): string {
  return sectionId ? sectionId : CLASS_SCOPE_KEY
}

/** True when a scheme matches the exact (session, class, scope) identity. */
export function matchesSchemeScope(
  scheme: Pick<ReportCardSchemeDetail, "academicSessionId" | "classId" | "scopeKey">,
  scope: SchemeScope,
): boolean {
  return (
    scheme.academicSessionId === scope.academicSessionId &&
    scheme.classId === scope.classId &&
    scheme.scopeKey === deriveScopeKey(scope.sectionId)
  )
}

/** Finds the scheme for an exact scope, or `undefined` when none exists. */
export function findSchemeForScope(
  schemes: readonly ReportCardSchemeDetail[],
  scope: SchemeScope,
): ReportCardSchemeDetail | undefined {
  return schemes.find((scheme) => matchesSchemeScope(scheme, scope))
}

/**
 * Client-side section filter. `SECTION_FILTER_ALL` keeps every scheme;
 * `SECTION_FILTER_CLASS` keeps only class-level schemes; any other value is a
 * section id and keeps only that section's own scheme. The class-level scheme is
 * deliberately never merged in as a fallback — the list API returns schemes, not
 * effective inherited configuration, so the UI must not imply one.
 */
export function matchesSectionFilter(
  scheme: Pick<ReportCardSchemeDetail, "sectionId">,
  filter: string,
): boolean {
  if (filter === SECTION_FILTER_ALL) return true
  if (filter === SECTION_FILTER_CLASS) return scheme.sectionId === null
  return scheme.sectionId === filter
}

export interface SchemeScopeNames {
  classNames: ReadonlyMap<string, string>
  sectionNames: ReadonlyMap<string, string>
}

/** Human-readable scope label. Never returns a raw id for a known class/section. */
export function describeSchemeScope(
  scheme: Pick<ReportCardSchemeDetail, "classId" | "sectionId">,
  names: SchemeScopeNames,
): string {
  const className = names.classNames.get(scheme.classId) ?? "Unknown class"
  if (scheme.sectionId === null) return `${className} · Class-level`
  const sectionName = names.sectionNames.get(scheme.sectionId)
  return sectionName ? `${className} · Section ${sectionName}` : `${className} · Unknown section`
}

/** Builds the (id -> name) maps the scope labels need from the loaded option lists. */
export function buildSchemeScopeNames(
  classes: readonly { id: string; name: string }[],
  sections: readonly { id: string; name: string }[],
): SchemeScopeNames {
  return {
    classNames: new Map(classes.map((entry) => [entry.id, entry.name])),
    sectionNames: new Map(sections.map((entry) => [entry.id, entry.name])),
  }
}
