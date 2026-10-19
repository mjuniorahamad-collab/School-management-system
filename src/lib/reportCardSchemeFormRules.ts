// Pure form rules for the Report Card scheme configuration UI (M7.1).
//
// This mirrors the backend's `normalizeSchemeInput` / `assertOverallPassModeConfig`
// / `validateExamWeights` (server/src/modules/report-card-schemes/...) so the
// form can fail fast with the same messages. The backend remains authoritative:
// these checks only prevent obviously invalid submissions and duplicate a few
// constants (weight tolerance, decimal grammar, percent bounds) on purpose.
//
// No React, no fetch: everything here is deterministic and unit-testable.

import {
  ABSENCE_POLICY_OPTIONS,
  AGGREGATION_POLICY_OPTIONS,
  OVERALL_PASS_MODE_OPTIONS,
} from "@/types/reportCardScheme"
import type {
  AbsencePolicy,
  AggregationPolicy,
  OverallPassMode,
  ReportCardSchemeDetail,
  ReportCardSchemeExamInput,
  UpsertReportCardSchemeInput,
} from "@/types/reportCardScheme"

/** Mirrors the backend `WEIGHT_SUM_TOLERANCE` (`Σw = 1 ± 0.0001`). */
export const WEIGHT_SUM_TOLERANCE = 0.0001

/** Mirrors the backend exact-decimal grammar (`report-card.schema.ts`). */
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/

export interface SchemeExamFormRow {
  /** Stable React list key. Never sent to the API. */
  key: string
  examTypeId: string
  /** Raw text; only meaningful (and only required) for PERCENTAGE_WEIGHTED. */
  weight: string
}

export interface ReportCardSchemeFormValue {
  academicSessionId: string
  classId: string
  /** Empty string means a class-level scheme (no section). */
  sectionId: string
  aggregationPolicy: AggregationPolicy
  absencePolicy: AbsencePolicy
  overallPassMode: OverallPassMode
  annualSubjectPassPercent: string
  overallPassPercent: string
  maxFailedSubjects: string
  coreSubjectIds: string[]
  exams: SchemeExamFormRow[]
}

export interface ReportCardSchemeFormError {
  /** Identifies the offending control; the form renders it beside the field. */
  field: string
  message: string
}

export function makeSchemeExamRow(key: string): SchemeExamFormRow {
  return { key, examTypeId: "", weight: "" }
}

export function emptyReportCardSchemeForm(): ReportCardSchemeFormValue {
  return {
    academicSessionId: "",
    classId: "",
    sectionId: "",
    aggregationPolicy: "RAW",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "ALL_SUBJECTS",
    annualSubjectPassPercent: "",
    overallPassPercent: "",
    maxFailedSubjects: "",
    coreSubjectIds: [],
    exams: [makeSchemeExamRow("exam-0")],
  }
}

export interface ReportCardSchemeFormDefaults {
  academicSessionId?: string
  classId?: string
  sectionId?: string
}

/** A fresh create-mode form, optionally pre-scoped to the current list filters. */
export function defaultReportCardSchemeForm(
  defaults: ReportCardSchemeFormDefaults = {},
): ReportCardSchemeFormValue {
  return {
    ...emptyReportCardSchemeForm(),
    academicSessionId: defaults.academicSessionId ?? "",
    classId: defaults.classId ?? "",
    sectionId: defaults.sectionId ?? "",
  }
}

/** Maps an authoritative scheme DTO into editable form state (edit mode). */
export function schemeDetailToFormValue(detail: ReportCardSchemeDetail): ReportCardSchemeFormValue {
  return {
    academicSessionId: detail.academicSessionId,
    classId: detail.classId,
    sectionId: detail.sectionId ?? "",
    aggregationPolicy: detail.aggregationPolicy,
    absencePolicy: detail.absencePolicy,
    overallPassMode: detail.overallPassMode,
    annualSubjectPassPercent: detail.annualSubjectPassPercent,
    overallPassPercent: detail.overallPassPercent ?? "",
    maxFailedSubjects: detail.maxFailedSubjects === null ? "" : String(detail.maxFailedSubjects),
    coreSubjectIds: [...detail.coreSubjectIds],
    exams:
      detail.exams.length > 0
        ? detail.exams.map((exam) => ({
            key: exam.id,
            examTypeId: exam.examTypeId,
            weight: exam.weight,
          }))
        : [makeSchemeExamRow("exam-0")],
  }
}

function isDecimal(value: string): boolean {
  return DECIMAL_PATTERN.test(value)
}

function isPercentInRange(value: string): boolean {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
}

function isNonNegativeInteger(value: string): boolean {
  if (!/^\d+$/.test(value)) return false
  return Number(value) >= 0
}

/** Validates the whole form; returns an empty array when it may be submitted. */
export function validateReportCardSchemeForm(
  value: ReportCardSchemeFormValue,
): ReportCardSchemeFormError[] {
  const errors: ReportCardSchemeFormError[] = []

  if (!value.academicSessionId) {
    errors.push({ field: "academicSessionId", message: "Academic session is required" })
  }
  if (!value.classId) {
    errors.push({ field: "classId", message: "Class is required" })
  }
  if (!AGGREGATION_POLICY_OPTIONS.includes(value.aggregationPolicy)) {
    errors.push({ field: "aggregationPolicy", message: "Select an aggregation policy" })
  }
  if (!ABSENCE_POLICY_OPTIONS.includes(value.absencePolicy)) {
    errors.push({ field: "absencePolicy", message: "Select an absence policy" })
  }
  if (!OVERALL_PASS_MODE_OPTIONS.includes(value.overallPassMode)) {
    errors.push({ field: "overallPassMode", message: "Select an overall pass mode" })
  }

  const annual = value.annualSubjectPassPercent.trim()
  if (annual === "" || !isDecimal(annual)) {
    errors.push({
      field: "annualSubjectPassPercent",
      message: "Annual subject pass percentage is required",
    })
  } else if (!isPercentInRange(annual)) {
    errors.push({
      field: "annualSubjectPassPercent",
      message: "Annual subject pass percentage must be between 0 and 100",
    })
  }

  validateExams(value, errors)
  validateOverallPass(value, errors)

  return errors
}

function validateExams(value: ReportCardSchemeFormValue, errors: ReportCardSchemeFormError[]): void {
  if (value.exams.length === 0) {
    errors.push({ field: "exams", message: "At least one exam is required" })
    return
  }

  const examTypeIds = value.exams.map((exam) => exam.examTypeId)
  if (examTypeIds.some((id) => id === "")) {
    errors.push({ field: "exams", message: "Every exam row must select an exam type" })
    return
  }
  if (new Set(examTypeIds).size !== examTypeIds.length) {
    errors.push({ field: "exams", message: "An exam type may only be selected once" })
    return
  }

  if (value.aggregationPolicy !== "PERCENTAGE_WEIGHTED") return

  const weights = value.exams.map((exam) => exam.weight.trim())
  if (weights.some((weight) => weight === "" || !isDecimal(weight))) {
    errors.push({
      field: "exams",
      message: "Every exam requires an exact decimal weight for percentage-weighted aggregation",
    })
    return
  }
  const parsed = weights.map((weight) => Number(weight))
  if (parsed.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    errors.push({ field: "exams", message: "Every exam weight must be strictly positive" })
    return
  }
  const sum = parsed.reduce((acc, weight) => acc + weight, 0)
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    errors.push({
      field: "exams",
      message: `Exam weights must sum to 1 (±0.0001); got ${sum}`,
    })
  }
}

function validateOverallPass(
  value: ReportCardSchemeFormValue,
  errors: ReportCardSchemeFormError[],
): void {
  const percent = value.overallPassPercent.trim()
  const maxFailed = value.maxFailedSubjects.trim()

  switch (value.overallPassMode) {
    case "ALL_SUBJECTS":
      if (percent !== "") {
        errors.push({
          field: "overallPassPercent",
          message: "Overall pass percentage must be omitted for all-subjects mode",
        })
      }
      if (maxFailed !== "") {
        errors.push({
          field: "maxFailedSubjects",
          message: "Max failed subjects must be omitted for all-subjects mode",
        })
      }
      if (value.coreSubjectIds.length > 0) {
        errors.push({
          field: "coreSubjectIds",
          message: "Core subjects must be omitted for all-subjects mode",
        })
      }
      return
    case "PERCENT_AND_MAX_FAILED":
      validateRequiredPercent(percent, errors)
      if (maxFailed === "" || !isNonNegativeInteger(maxFailed)) {
        errors.push({
          field: "maxFailedSubjects",
          message: "Max failed subjects is required and must be a whole number of at least 0",
        })
      }
      if (value.coreSubjectIds.length > 0) {
        errors.push({
          field: "coreSubjectIds",
          message: "Core subjects must be omitted for percent and max-failed mode",
        })
      }
      return
    case "CORE_SUBJECTS_AND_PERCENT":
      validateRequiredPercent(percent, errors)
      if (value.coreSubjectIds.length === 0) {
        errors.push({
          field: "coreSubjectIds",
          message: "Select at least one core subject",
        })
      } else if (new Set(value.coreSubjectIds).size !== value.coreSubjectIds.length) {
        errors.push({
          field: "coreSubjectIds",
          message: "Core subjects must not contain duplicates",
        })
      }
      if (maxFailed !== "") {
        errors.push({
          field: "maxFailedSubjects",
          message: "Max failed subjects must be omitted for core-subjects-and-percent mode",
        })
      }
      return
  }
}

function validateRequiredPercent(
  percent: string,
  errors: ReportCardSchemeFormError[],
): void {
  if (percent === "" || !isDecimal(percent)) {
    errors.push({
      field: "overallPassPercent",
      message: "Overall pass percentage is required for this mode",
    })
  } else if (!isPercentInRange(percent)) {
    errors.push({
      field: "overallPassPercent",
      message: "Overall pass percentage must be between 0 and 100",
    })
  }
}

/**
 * Builds the exact request body. RAW omits every weight (the backend pins the
 * column to "0"); PERCENTAGE_WEIGHTED sends the parsed weight strings. The
 * conditional overall-pass fields are emitted only for their own mode.
 */
export function reportCardSchemeFormToPayload(
  value: ReportCardSchemeFormValue,
): UpsertReportCardSchemeInput {
  const exams: ReportCardSchemeExamInput[] = value.exams.map((exam, index) => {
    const input: ReportCardSchemeExamInput = {
      examTypeId: exam.examTypeId,
      sortOrder: index,
    }
    if (value.aggregationPolicy === "PERCENTAGE_WEIGHTED") {
      input.weight = exam.weight.trim()
    }
    return input
  })

  const payload: UpsertReportCardSchemeInput = {
    academicSessionId: value.academicSessionId,
    classId: value.classId,
    sectionId: value.sectionId === "" ? null : value.sectionId,
    aggregationPolicy: value.aggregationPolicy,
    absencePolicy: value.absencePolicy,
    overallPassMode: value.overallPassMode,
    annualSubjectPassPercent: value.annualSubjectPassPercent.trim(),
    exams,
  }

  switch (value.overallPassMode) {
    case "ALL_SUBJECTS":
      break
    case "PERCENT_AND_MAX_FAILED":
      payload.overallPassPercent = value.overallPassPercent.trim() || null
      payload.maxFailedSubjects = Number(value.maxFailedSubjects.trim())
      payload.coreSubjectIds = []
      break
    case "CORE_SUBJECTS_AND_PERCENT":
      payload.overallPassPercent = value.overallPassPercent.trim() || null
      payload.coreSubjectIds = [...value.coreSubjectIds]
      break
  }

  return payload
}
