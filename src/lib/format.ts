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