import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AcademicSessionListItem } from "@/types/academicSessions"
import type { ClassListItem } from "@/types/classes"
import type { SectionListItem } from "@/types/sections"
import {
  ADMISSION_STATUS_OPTIONS,
  INVOICE_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  type ReportCatalogItem,
  type ReportExamOption,
  type ReportKey,
} from "@/types/reports"
import { humanizeToken } from "@/components/reports/shared"

type FieldKind = "select" | "date" | "search"

interface FieldOption {
  value: string
  label: string
}

interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
  required: boolean
  options?: FieldOption[]
  predicates?: { noClass?: boolean; needsClass?: boolean; noSession?: boolean; needsSession?: boolean }
  placeholder?: string
  helper?: string
}

interface PanelContext {
  sessions: AcademicSessionListItem[]
  classes: ClassListItem[]
  sections: SectionListItem[]
  exams: ReportExamOption[]
  examsPending: boolean
}

function sessionOptions(sessions: AcademicSessionListItem[]): FieldOption[] {
  return sessions.map((session) => ({ value: session.id, label: session.name }))
}

function classOptions(classes: ClassListItem[]): FieldOption[] {
  return classes.map((cls) => ({ value: cls.id, label: cls.name }))
}

function sectionOptions(sections: SectionListItem[]): FieldOption[] {
  return sections.map((section) => ({ value: section.id, label: section.name }))
}

function examOptions(exams: ReportExamOption[]): FieldOption[] {
  return exams.map((exam) => ({
    value: exam.id,
    label: `${exam.name} · ${exam.className}${exam.sectionName ? ` · ${exam.sectionName}` : ""}`,
  }))
}

const PANEL_LAYOUT: Record<ReportKey, (ctx: PanelContext) => FieldSpec[]> = {
  "student-roster": (ctx) => [
    { key: "sessionId", label: "Academic session", kind: "select", required: true, options: sessionOptions(ctx.sessions) },
    {
      key: "classId",
      label: "Class",
      kind: "select",
      required: false,
      options: classOptions(ctx.classes),
      placeholder: "All classes",
    },
    {
      key: "sectionId",
      label: "Section",
      kind: "select",
      required: false,
      options: sectionOptions(ctx.sections),
      predicates: { needsClass: true },
      placeholder: "All sections",
      helper: "Pick a class to filter sections.",
    },
    { key: "search", label: "Search", kind: "search", required: false, placeholder: "Name or admission number…" },
  ],
  "admissions-summary": () => [
    { key: "from", label: "From", kind: "date", required: true },
    { key: "to", label: "To", kind: "date", required: true },
    {
      key: "status",
      label: "Status",
      kind: "select",
      required: false,
      options: ADMISSION_STATUS_OPTIONS.map((status) => ({ value: status, label: humanizeToken(status) })),
      placeholder: "All statuses",
    },
  ],
  "attendance-summary": (ctx) => [
    { key: "sessionId", label: "Academic session", kind: "select", required: true, options: sessionOptions(ctx.sessions) },
    {
      key: "classId",
      label: "Class",
      kind: "select",
      required: false,
      options: classOptions(ctx.classes),
      placeholder: "All classes",
    },
    {
      key: "sectionId",
      label: "Section",
      kind: "select",
      required: false,
      options: sectionOptions(ctx.sections),
      predicates: { needsClass: true },
      placeholder: "All sections",
      helper: "Pick a class to filter sections.",
    },
    { key: "from", label: "From", kind: "date", required: false, helper: "Defaults to the session start." },
    { key: "to", label: "To", kind: "date", required: false, helper: "Defaults to the session end." },
  ],
  "academic-performance": (ctx) => [
    { key: "sessionId", label: "Academic session", kind: "select", required: true, options: sessionOptions(ctx.sessions) },
    {
      key: "examId",
      label: "Examination",
      kind: "select",
      required: true,
      options: examOptions(ctx.exams),
      predicates: { needsSession: true },
      placeholder: "Select an examination…",
      helper: ctx.examsPending
        ? "Loading examinations…"
        : ctx.exams.length === 0
          ? "No examinations exist in this session yet."
          : "",
    },
    {
      key: "classId",
      label: "Class",
      kind: "select",
      required: false,
      options: classOptions(ctx.classes),
      placeholder: "All classes",
    },
  ],
  "fee-collection": (ctx) => [
    { key: "sessionId", label: "Academic session", kind: "select", required: true, options: sessionOptions(ctx.sessions) },
    {
      key: "classId",
      label: "Class",
      kind: "select",
      required: false,
      options: classOptions(ctx.classes),
      placeholder: "All classes",
    },
    {
      key: "status",
      label: "Invoice status",
      kind: "select",
      required: false,
      options: INVOICE_STATUS_OPTIONS.map((status) => ({ value: status, label: humanizeToken(status) })),
      placeholder: "All statuses",
    },
  ],
  "payment-register": () => [
    { key: "from", label: "From", kind: "date", required: true },
    { key: "to", label: "To", kind: "date", required: true },
    {
      key: "method",
      label: "Method",
      kind: "select",
      required: false,
      options: PAYMENT_METHOD_OPTIONS.map((method) => ({ value: method, label: humanizeToken(method) })),
      placeholder: "All methods",
    },
  ],
}

const REQUIRED_KEYS: Record<ReportKey, string[]> = {
  "student-roster": ["sessionId"],
  "admissions-summary": ["from", "to"],
  "attendance-summary": ["sessionId"],
  "academic-performance": ["sessionId", "examId"],
  "fee-collection": ["sessionId"],
  "payment-register": ["from", "to"],
}

export function isReportRunnable(key: ReportKey, filters: Record<string, string>): boolean {
  return REQUIRED_KEYS[key].every((field) => Boolean(filters[field]))
}

interface ReportFilterPanelProps {
  report: ReportCatalogItem
  filters: Record<string, string>
  canRun: boolean
  sessions: AcademicSessionListItem[]
  classes: ClassListItem[]
  sections: SectionListItem[]
  exams: ReportExamOption[]
  examsPending: boolean
  onChange: (field: string, value: string) => void
  onRun: () => void
}

export function ReportFilterPanel({
  report,
  filters,
  canRun,
  sessions,
  classes,
  sections,
  exams,
  examsPending,
  onChange,
  onRun,
}: ReportFilterPanelProps) {
  const key = report.key as ReportKey
  const build = PANEL_LAYOUT[key]
  if (!build) return null
  const specs = build({ sessions, classes, sections, exams, examsPending })

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-end gap-3">
        {specs.map((spec) => {
          if (spec.predicates?.noClass && !!filters.classId) return null
          if (spec.predicates?.needsClass && !filters.classId) return null
          if (spec.predicates?.noSession && !!filters.sessionId) return null
          if (spec.predicates?.needsSession && !filters.sessionId) return null
          return (
            <div key={spec.key} className="flex min-w-0 flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                {spec.label}
                {spec.required && (
                  <span aria-hidden="true" className="text-primary">
                    *
                  </span>
                )}
              </label>
              {spec.kind === "search" ? (
                <Input
                  type="search"
                  value={filters[spec.key] ?? ""}
                  onChange={(event) => onChange(spec.key, event.target.value)}
                  placeholder={spec.placeholder}
                  aria-label={spec.label}
                  className="w-full sm:w-56"
                />
              ) : spec.kind === "date" ? (
                <Input
                  type="date"
                  value={filters[spec.key] ?? ""}
                  onChange={(event) => onChange(spec.key, event.target.value)}
                  aria-label={spec.label}
                  className="w-full sm:w-40"
                />
              ) : (
                <Select
                  value={filters[spec.key] || "all"}
                  onValueChange={(value) => onChange(spec.key, value === "all" ? "" : value)}
                  disabled={spec.key === "examId" && examsPending}
                >
                  <SelectTrigger className="w-full sm:w-56" aria-label={spec.label} disabled={spec.key === "examId" && examsPending}>
                    <SelectValue placeholder={spec.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {!spec.required && (
                      <SelectItem value="all">{spec.placeholder ?? "Any"}</SelectItem>
                    )}
                    {(spec.options ?? []).length === 0 ? (
                      <SelectItem value="__none" disabled>
                        {examsPending ? "Loading…" : "None available"}
                      </SelectItem>
                    ) : (
                      (spec.options ?? []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              {spec.helper && (spec.predicates?.needsSession ? Boolean(filters.sessionId) : true) && (
                <p className="text-[11px] text-muted-foreground">{spec.helper}</p>
              )}
            </div>
          )
        })}
        <Button onClick={onRun} disabled={!canRun} className="shrink-0">
          <Play className="size-4" aria-hidden="true" />
          Run report
        </Button>
      </div>
    </div>
  )
}