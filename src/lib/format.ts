const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat("en-IN")

export function formatINR(value: number): string {
  return inrFormatter.format(value)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

const compactInrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatINRCompact(value: number): string {
  return compactInrFormatter.format(value)
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

export function formatShortDate(isoDate: string): string {
  const date = new Date(isoDate)
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
}

export function formatDateDay(isoDate: string): string {
  return String(new Date(isoDate).getDate()).padStart(2, "0")
}

export function formatDateMonth(isoDate: string): string {
  return MONTHS_SHORT[new Date(isoDate).getMonth()]
}

export function formatFullDate(isoDate: string): string {
  const date = new Date(isoDate)
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

export function formatTime(timeLabel: string): string {
  return timeLabel
}

export function timeAgo(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  const diffSeconds = Math.round((Date.now() - then) / 1000)

  if (diffSeconds < 60) return "Just now"
  const minutes = Math.round(diffSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return formatFullDate(isoDate)
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

/* ── Amount in words ───────────────────────────────────────────────────────────
 * Pure RENDERING of an authoritative amount for a printed financial document.
 * It performs no arithmetic of its own: it does not round, does not re-derive the
 * figure, and does not touch the payment. The value passed in is the value the
 * server returned and that `formatINR` already prints; this only spells it out.
 *
 * Indian numbering (lakh/crore) because that is the target market of the school
 * fee documents these appear on.
 *
 * The currency word is the SAME hardcoded INR assumption `formatINR` above already
 * makes. It is deliberately not a second currency system: SchoolSetting.feeCurrency
 * exists but reaches no DTO, and switching the app's money formatting is a billing
 * change, not a print change. Both must be revisited together.
 */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
]

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

/** 0-99. A tens+unit compound is hyphenated: "Twenty-Five", not "Twenty Five". */
function twoDigitWords(value: number): string {
  if (value < 20) return ONES[value]
  const tens = TENS[Math.floor(value / 10)]
  const ones = ONES[value % 10]
  return ones === "" ? tens : `${tens}-${ones}`
}

/** 0-999. */
function threeDigitWords(value: number): string {
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const head = hundreds === 0 ? "" : `${ONES[hundreds]} Hundred`
  if (rest === 0) return head
  return head === "" ? twoDigitWords(rest) : `${head} ${twoDigitWords(rest)}`
}

/** "Rupees" → "Rupee" for a single unit, so a ₹1 receipt reads correctly. */
function singularCurrency(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label
}

/**
 * Spells an amount in Indian words, e.g. 125000 → "One Lakh Twenty-Five Thousand".
 * Rounds to the nearest rupee to match `formatINR`'s `maximumFractionDigits: 0`,
 * so the words and the printed figure can never disagree.
 */
export function formatAmountInWords(value: number, currencyLabel = "Rupees"): string {
  if (!Number.isFinite(value)) return `${currencyLabel} only`

  const negative = value < 0
  const rounded = Math.abs(Math.round(value))
  const label = rounded === 1 ? singularCurrency(currencyLabel) : currencyLabel

  if (rounded === 0) return `Zero ${label} only`

  const crore = Math.floor(rounded / 10_000_000)
  const remainderAfterCrore = rounded % 10_000_000
  const lakh = Math.floor(remainderAfterCrore / 100_000)
  const remainderAfterLakh = remainderAfterCrore % 100_000
  const thousand = Math.floor(remainderAfterLakh / 1000)
  const hundred = remainderAfterLakh % 1000

  const parts: string[] = []
  if (crore > 0) parts.push(`${threeDigitWords(crore)} Crore`)
  if (lakh > 0) parts.push(`${twoDigitWords(lakh)} Lakh`)
  if (thousand > 0) parts.push(`${twoDigitWords(thousand)} Thousand`)
  if (hundred > 0) parts.push(threeDigitWords(hundred))

  const words = parts.join(" ")
  return `${negative === true ? "Minus " : ""}${words} ${label} only`
}