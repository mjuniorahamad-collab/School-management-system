import { useEffect, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useRecipients } from "@/hooks/useMessages"
import type { RecipientOption } from "@/types/messages"

interface RecipientPickerProps {
  selected: RecipientOption[]
  onChange: (next: RecipientOption[]) => void
  single?: boolean
}

const SEARCH_DEBOUNCE_MS = 300

export function RecipientPicker({ selected, onChange, single }: RecipientPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const { data = [], isPending } = useRecipients({ search: query || undefined, limit: 25 })
  const selectedIds = new Set(selected.map((item) => item.userId))
  const options = data.filter((item) => !selectedIds.has(item.userId))

  const toggle = (item: RecipientOption) => {
    if (single) {
      onChange(selected.some((entry) => entry.userId === item.userId) ? [] : [item])
      return
    }
    onChange(
      selected.some((entry) => entry.userId === item.userId)
        ? selected.filter((entry) => entry.userId !== item.userId)
        : [...selected, item],
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span
              key={item.userId}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
            >
              {item.name}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => toggle(item)}
                aria-label={`Remove ${item.name}`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between" disabled={isPending && options.length === 0}>
            <span className="truncate text-sm font-normal text-muted-foreground">
              {options.length > 0 ? "Choose a recipient…" : isPending ? "Loading people…" : "No matching people"}
            </span>
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <div className="p-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              aria-label="Search recipients"
              className="h-8"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {options.map((item) => (
              <button
                type="button"
                key={item.userId}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  toggle(item)
                  if (single) setOpen(false)
                  setSearch("")
                  setQuery("")
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.email}</span>
                </span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {item.role.replace(/_/g, " ")}
                </span>
              </button>
            ))}
            {!isPending && options.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                No other staff or parents can be messaged yet.
              </p>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {single && selected.length > 0 && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3 text-emerald-500" aria-hidden="true" />
          {selected[0].name} · {selected[0].email}
        </p>
      )}
    </div>
  )
}