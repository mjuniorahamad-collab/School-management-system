import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FeeSessionSelectProps {
  value: string
  onValueChange: (value: string | undefined) => void
  placeholder?: string
  includeAll?: boolean
}

// Options come from the real academic-sessions API; used across the Fees
// module for filtering and invoice generation scoping.
export function FeeSessionSelect({
  value,
  onValueChange,
  placeholder = "All sessions",
  includeAll = true,
}: FeeSessionSelectProps) {
  const { data } = useAcademicSessions({})

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className="w-full sm:w-52" aria-label="Academic session">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">{placeholder}</SelectItem>}
        {(data?.items ?? []).map((session) => (
          <SelectItem key={session.id} value={session.id}>
            {session.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}