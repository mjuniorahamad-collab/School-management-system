import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CornerDownLeft, Search } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { getAllNavItems } from "@/routes/navigation"
import { searchableStudents } from "@/data/students"
import { Button } from "@/components/ui/button"

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const navigationItems = useMemo(() => getAllNavItems(), [])

  const students = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return searchableStudents.slice(0, 5)
    return searchableStudents
      .filter((student) => student.name.toLowerCase().includes(term))
      .slice(0, 5)
  }, [query])

  const run = (path: string) => {
    setOpen(false)
    setQuery("")
    navigate(path)
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="group w-9 justify-center gap-2 rounded-lg border-muted-foreground/20 bg-background text-muted-foreground shadow-card hover:bg-muted/50 hover:text-muted-foreground sm:w-64 xl:w-80"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden truncate text-sm sm:inline">Search students, teachers, fees...</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground lg:inline-flex">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search modules, students, teachers..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {students.length > 0 && (
            <>
              <CommandGroup heading="Students">
                {students.map((student) => (
                  <CommandItem
                    key={student.id}
                    value={`student-${student.name}`}
                    onSelect={() => run("/students")}
                  >
                    <Search className="size-4" aria-hidden="true" />
                    <span>{student.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Class {student.studentClass}-{student.section}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}
          <CommandGroup heading="Modules">
            {navigationItems.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.path}
                  value={`module-${item.label}`}
                  onSelect={() => run(item.path)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{item.label}</span>
                  <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" />
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}