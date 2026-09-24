import { useNavigate } from "react-router-dom"
import { Building2, ChevronsUpDown } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Tenant switcher for multi-school users. Rendered only when the user holds
 * ACTIVE memberships in more than one school. Switching persists the choice,
 * clears the previous school's cached data, and reloads identity in the target
 * school (role + permissions follow the membership).
 */
export function SchoolSwitcher() {
  const navigate = useNavigate()
  const { memberships, activeSchoolId, switchSchool } = useAuth()

  if (memberships.length <= 1) return null

  const activeName = memberships.find((m) => m.id === activeSchoolId)?.name

  const handleSelect = async (schoolId: string) => {
    if (schoolId === activeSchoolId) return
    await switchSchool(schoolId)
    // The current route may belong to a module the other school's role cannot
    // access; land on the dashboard where every role can arrive.
    navigate("/dashboard")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hidden h-8 max-w-44 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground duration-0 md:flex"
          aria-label="Switch school"
        >
          <Building2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{activeName}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch school
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((membership) => (
          <DropdownMenuCheckboxItem
            key={membership.id}
            checked={membership.id === activeSchoolId}
            onSelect={() => void handleSelect(membership.id)}
            className="flex items-center gap-2"
          >
            <span className="truncate">{membership.name}</span>
            <span className="ml-auto truncate text-[11px] text-muted-foreground">
              {membership.role.split("_").join(" ").toLowerCase()}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}