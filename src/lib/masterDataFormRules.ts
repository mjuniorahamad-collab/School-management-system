import type {
  ExamTypeFormPayload,
  FeeHeadFormPayload,
  GradingBandFormPayload,
  PeriodSlotFormPayload,
} from "@/types/masterData"

export interface FeeHeadFormValue {
  code: string
  name: string
  isRecurring: boolean
}

export interface FeeHeadFormError {
  field: keyof FeeHeadFormValue
  message: string
}

export function validateFeeHeadForm(value: FeeHeadFormValue): FeeHeadFormError[] {
  const errors: FeeHeadFormError[] = []
  if (!value.code.trim()) errors.push({ field: "code", message: "Fee head code is required" })
  if (!value.name.trim()) errors.push({ field: "name", message: "Fee head name is required" })
  return errors
}

export function feeHeadFormToPayload(value: FeeHeadFormValue): FeeHeadFormPayload {
  return {
    code: normalizeCode(value.code),
    name: value.name.trim(),
    isRecurring: value.isRecurring,
  }
}

export interface ExamTypeFormValue {
  code: string
  name: string
  sortOrder: string
}

export interface ExamTypeFormError {
  field: keyof ExamTypeFormValue
  message: string
}

export function validateExamTypeForm(value: ExamTypeFormValue): ExamTypeFormError[] {
  const errors: ExamTypeFormError[] = []
  if (!value.code.trim()) errors.push({ field: "code", message: "Exam type code is required" })
  if (!value.name.trim()) errors.push({ field: "name", message: "Exam type name is required" })
  return errors
}

export function examTypeFormToPayload(value: ExamTypeFormValue): ExamTypeFormPayload {
  const payload: ExamTypeFormPayload = { code: normalizeCode(value.code), name: value.name.trim() }
  const sortOrder = value.sortOrder.trim()
  if (sortOrder) {
    const parsed = Number(sortOrder)
    if (Number.isInteger(parsed) && parsed >= 0) payload.sortOrder = parsed
  }
  return payload
}

export interface GradingBandFormValue {
  minPercent: string
  maxPercent: string
  grade: string
  description: string
  sortOrder: string
}

export interface GradingBandFormError {
  field: keyof GradingBandFormValue
  message: string
}

export function validateGradingBandForm(value: GradingBandFormValue): GradingBandFormError[] {
  const errors: GradingBandFormError[] = []
  const min = Number(value.minPercent)
  const max = Number(value.maxPercent)
  if (value.minPercent.trim() === "" || Number.isNaN(min)) {
    errors.push({ field: "minPercent", message: "Minimum percentage is required" })
  }
  if (value.maxPercent.trim() === "" || Number.isNaN(max)) {
    errors.push({ field: "maxPercent", message: "Maximum percentage is required" })
  }
  if (!value.grade.trim()) errors.push({ field: "grade", message: "Grade is required" })
  if (
    value.minPercent.trim() !== "" &&
    value.maxPercent.trim() !== "" &&
    !Number.isNaN(min) &&
    !Number.isNaN(max) &&
    min > max
  ) {
    errors.push({ field: "maxPercent", message: "Maximum must be ≥ minimum" })
  }
  return errors
}

export function gradingBandFormToPayload(value: GradingBandFormValue): GradingBandFormPayload {
  const payload: GradingBandFormPayload = {
    minPercent: Number(value.minPercent),
    maxPercent: Number(value.maxPercent),
    grade: value.grade.trim(),
  }
  if (value.description.trim()) payload.description = value.description.trim()
  const sortOrder = value.sortOrder.trim()
  if (sortOrder) {
    const parsed = Number(sortOrder)
    if (Number.isInteger(parsed) && parsed >= 0) payload.sortOrder = parsed
  }
  return payload
}

export interface PeriodSlotFormValue {
  name: string
  startTime: string
  endTime: string
  sortOrder: string
}

export interface PeriodSlotFormError {
  field: keyof PeriodSlotFormValue
  message: string
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function validatePeriodSlotForm(value: PeriodSlotFormValue): PeriodSlotFormError[] {
  const errors: PeriodSlotFormError[] = []
  if (!value.name.trim()) errors.push({ field: "name", message: "Period name is required" })
  if (!TIME_RE.test(value.startTime)) {
    errors.push({ field: "startTime", message: "Start time must be a valid HH:MM time" })
  }
  if (!TIME_RE.test(value.endTime)) {
    errors.push({ field: "endTime", message: "End time must be a valid HH:MM time" })
  }
  if (
    TIME_RE.test(value.startTime) &&
    TIME_RE.test(value.endTime) &&
    value.endTime <= value.startTime
  ) {
    errors.push({ field: "endTime", message: "End time must be after start time" })
  }
  return errors
}

export function periodSlotFormToPayload(value: PeriodSlotFormValue): PeriodSlotFormPayload {
  const payload: PeriodSlotFormPayload = {
    name: value.name.trim(),
    startTime: value.startTime,
    endTime: value.endTime,
  }
  const sortOrder = value.sortOrder.trim()
  if (sortOrder) {
    const parsed = Number(sortOrder)
    if (Number.isInteger(parsed) && parsed >= 0) payload.sortOrder = parsed
  }
  return payload
}

/** Mirrors backend normalization: trim, collapse whitespace, uppercase. */
export function normalizeCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}
