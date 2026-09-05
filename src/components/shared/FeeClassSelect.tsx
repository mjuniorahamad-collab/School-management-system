import { useClasses } from "@/hooks/useClasses"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FeeClassSelectProps {
  value: string
  onValueChange: (value: string | undefined) => void
  placeholder?: string
  includeAll?: boolean
}

// Options come from the real classes API; used across the Fees module for
// filtering and invoice generation scoping.
export function FeeClassSelect({
  value,
  onValueChange,
  placeholder = "All classes",
  includeAll = true,
}: FeeClassSelectProps) {
  const { data } = useClasses({})

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className="w-full sm:w-48" aria-label="Class">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">{placeholder}</SelectItem>}
        {(data?.items ?? []).map((schoolClass) => (
          <SelectItem key={schoolClass.id} value={schoolClass.id}>
            {schoolClass.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}