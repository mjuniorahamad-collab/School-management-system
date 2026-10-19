import { Badge } from "@/components/ui/badge"
import {
  reportCardAnnualResultLabel,
  reportCardStatusLabel,
  reportCardSubjectOutcomeLabel,
} from "@/lib/reportCardStatus"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"

interface BadgeStyle {
  variant: BadgeVariant
  className?: string
}

const EMERALD =
  "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
const AMBER =
  "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
const RED =
  "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"

const STATUS_STYLES: Record<string, BadgeStyle> = {
  DRAFT: { variant: "secondary" },
  PENDING_ARCHIVE: { variant: "outline", className: AMBER },
  ISSUED: { variant: "outline", className: EMERALD },
  SUPERSEDED: { variant: "outline" },
  VOID: { variant: "destructive" },
}

const RESULT_STYLES: Record<string, BadgeStyle> = {
  PASS: { variant: "outline", className: EMERALD },
  FAIL: { variant: "outline", className: RED },
  UNRESOLVED: { variant: "outline", className: AMBER },
  REQUIRES_REVIEW: { variant: "outline", className: AMBER },
}

const OUTCOME_STYLES: Record<string, BadgeStyle> = {
  PASS: { variant: "outline", className: EMERALD },
  FAIL: { variant: "outline", className: RED },
  NOT_APPLICABLE: { variant: "secondary" },
  REQUIRES_REVIEW: { variant: "outline", className: AMBER },
}

function styled(styles: Record<string, BadgeStyle>, value: string | null | undefined): BadgeStyle {
  if (value && styles[value]) return styles[value]
  return { variant: "outline" }
}

export function ReportCardStatusBadge({ status }: { status: string | null | undefined }) {
  const style = styled(STATUS_STYLES, status)
  return (
    <Badge variant={style.variant} className={style.className}>
      {reportCardStatusLabel(status)}
    </Badge>
  )
}

export function ReportCardResultBadge({ result }: { result: string | null | undefined }) {
  const style = styled(RESULT_STYLES, result)
  return (
    <Badge variant={style.variant} className={style.className}>
      {reportCardAnnualResultLabel(result)}
    </Badge>
  )
}

export function ReportCardSubjectOutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
  const style = styled(OUTCOME_STYLES, outcome)
  return (
    <Badge variant={style.variant} className={style.className}>
      {reportCardSubjectOutcomeLabel(outcome)}
    </Badge>
  )
}
