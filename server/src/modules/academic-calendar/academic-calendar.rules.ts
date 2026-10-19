import { badRequestError } from "../../lib/ApiError.js"
import { WEEKDAYS, type CalendarDayKindValue, type WeekdayValue } from "./academic-calendar.types.js"

// Canonical MON..SUN ordering used whenever a working-weekday set is persisted,
// so the stored array is deterministic regardless of client ordering.
const WEEKDAY_ORDER: Record<WeekdayValue, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
}

export function isWeekday(value: string): value is WeekdayValue {
  return (WEEKDAYS as readonly string[]).includes(value)
}

/** Deduplicates, validates and canonically orders a working-weekday set. */
export function normalizeWorkingWeekdays(input: readonly string[]): WeekdayValue[] {
  const unique = new Set<WeekdayValue>()
  for (const value of input) {
    if (!isWeekday(value)) throw badRequestError(`Unknown weekday "${value}"`)
    unique.add(value)
  }
  if (unique.size === 0) throw badRequestError("At least one working weekday is required")
  return [...unique].sort((a, b) => WEEKDAY_ORDER[a] - WEEKDAY_ORDER[b])
}

/**
 * Enforces the instructional-value domain for a day kind, mirroring the
 * `calendar_day_instructional_value_check` DB constraint so callers get a clean
 * 400 rather than a constraint violation.
 */
export function assertInstructionalValue(
  kind: CalendarDayKindValue,
  value: number,
): void {
  if (kind === "NON_INSTRUCTIONAL") {
    if (value !== 0) {
      throw badRequestError("A non-instructional day must have an instructional value of 0")
    }
    return
  }
  if (value !== 0.5 && value !== 1) {
    throw badRequestError("An instructional day must have an instructional value of 0.5 or 1")
  }
}

// JS Date.getUTCDay() order (0 = Sunday) mapped to the domain weekday names.
const WEEKDAY_BY_JS_INDEX: readonly WeekdayValue[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
]

const DAY_MS = 24 * 60 * 60 * 1000

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/**
 * The dates in `[startDate, endDate]` whose *weekly-derived* instructional
 * status changes when the working-weekday set changes from `previousWeekdays` to
 * `nextWeekdays`. An explicit CalendarDay override always wins, so overridden
 * dates are never included. An unchanged set yields no dates. Pure, so the
 * calendar service can decide exactly which VERIFIED registers to reopen.
 */
export function deriveWeeklyAffectedDates(params: {
  startDate: string
  endDate: string
  previousWeekdays: readonly string[]
  nextWeekdays: readonly string[]
  overriddenDates: readonly string[]
}): string[] {
  const previous = new Set(params.previousWeekdays)
  const next = new Set(params.nextWeekdays)
  const overridden = new Set(params.overriddenDates)

  let changed = false
  if (previous.size !== next.size) {
    changed = true
  } else {
    for (const weekday of next) {
      if (!previous.has(weekday)) {
        changed = true
        break
      }
    }
  }
  if (!changed) return []

  const start = new Date(`${params.startDate}T00:00:00.000Z`)
  const end = new Date(`${params.endDate}T00:00:00.000Z`)
  const affected: string[] = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const date = new Date(t)
    const day = dateOnly(date)
    if (overridden.has(day)) continue
    const weekday = WEEKDAY_BY_JS_INDEX[date.getUTCDay()]
    if (previous.has(weekday) !== next.has(weekday)) affected.push(day)
  }
  return affected
}
