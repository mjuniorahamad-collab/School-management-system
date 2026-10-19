import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { SubjectListItem } from "@/types/subjects"

interface CoreSubjectsPickerProps {
  subjects: SubjectListItem[]
  selected: string[]
  onToggle: (subjectId: string, selected: boolean) => void
}

/**
 * A compact, searchable, scrollable multi-select for the core subjects a
 * CORE_SUBJECTS_AND_PERCENT scheme passes on. Native checkboxes keep keyboard
 * and screen-reader behaviour free; the caller owns the selected set.
 */
export function CoreSubjectsPicker({ subjects, selected, onToggle }: CoreSubjectsPickerProps) {
  const [search, setSearch] = useState("")
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return subjects
    return subjects.filter(
      (subject) =>
        subject.name.toLowerCase().includes(query) || subject.code.toLowerCase().includes(query),
    )
  }, [subjects, search])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search subjects…"
          aria-label="Search core subjects"
          className="pl-9"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No subjects found.</p>
        ) : (
          filtered.map((subject) => {
            const checked = selectedSet.has(subject.id)
            return (
              <label
                key={subject.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={checked}
                  onChange={(event) => onToggle(subject.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{subject.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{subject.code}</span>
              </label>
            )
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.length === 0
          ? "Select at least one core subject."
          : `${selected.length} core subject${selected.length === 1 ? "" : "s"} selected.`}
      </p>
    </div>
  )
}
