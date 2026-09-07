import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { CornerDownLeft, Loader2, Search } from "lucide-react"
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
import { studentsService } from "@/services/studentsService"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"

export function GlobalSearch() {
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
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

  // Debounce so the live server search does not fire on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => clearTimeout(timer)
  }, [query])

  const canViewStudents = can("students:view")
  const studentsQuery = useQuery({
    queryKey: ["students", "search", debouncedQuery],
    queryFn: () =>
      studentsService.list({ page: 1, pageSize: 5, search: debouncedQuery || undefined }),
    enabled: open && canViewStudents,
    staleTime: 30_000,
  })

  const navigationItems = useMemo(() => getAllNavItems(), [])

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
          {canViewStudents && (
            <>
              <CommandGroup heading="Students">
                {studentsQuery.isPending ? (
                  <CommandItem value="__loading-students" disabled>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span>Searching students...</span>
                  </CommandItem>
                ) : (
                  studentsQuery.data?.items.map((student) => (
                    <CommandItem
                      key={student.id}
                      value={`student-${student.name}`}
                      onSelect={() => run(`/students/${student.id}`)}
                    >
                      <Search className="size-4" aria-hidden="true" />
                      <span>{student.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {student.admissionNumber}
                        {student.class?.name ? ` · Class ${student.class.name}${student.section?.name ? `-${student.section.name}` : ""}` : ""}
                      </span>
                    </CommandItem>
                  ))
                )}
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