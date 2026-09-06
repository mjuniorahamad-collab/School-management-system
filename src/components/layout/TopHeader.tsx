import { useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Bell,
  CalendarDays,
  CheckCheck,
  LogOut,
  Menu,
  Settings,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { branding } from "@/config/branding"
import { findNavItem, getAllNavItems } from "@/routes/navigation"
import { notifications } from "@/data/notifications"
import { cn } from "@/lib/utils"
import { getInitials, timeAgo } from "@/lib/format"
import { useSidebar } from "@/hooks/useSidebar"
import { useAuth } from "@/auth/useAuth"
import { ThemeToggle } from "@/theme/ThemeToggle"
import { GlobalSearch } from "@/components/layout/GlobalSearch"
import { MessagesMenu } from "@/components/layout/MessagesMenu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function formatRole(role: string): string {
  return role
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ")
}

function getHeaderMeta(pathname: string, displayName: string): { title: string; subtitle: string } {
  const navItem = findNavItem(pathname) ?? findByPathPrefix(pathname)

  if (pathname === "/dashboard") {
    const firstName = displayName.split(" ")[0]
    return { title: "Dashboard", subtitle: `Welcome back, ${firstName}` }
  }
  return {
    title: navItem?.label ?? "Page not found",
    subtitle: "School administration console",
  }
}

function findByPathPrefix(pathname: string) {
  return getAllNavItems()
    .filter((item) => pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

const notificationToneDot: Record<string, string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
}

export function TopHeader() {
  const { setMobileOpen } = useSidebar()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const displayName = user?.name ?? branding.schoolName
  const roleLabel = user?.roles[0] ? formatRole(user.roles[0]) : "User"

  const { title, subtitle } = useMemo(
    () => getHeaderMeta(location.pathname, displayName),
    [location.pathname, displayName],
  )

  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const unreadCount = notifications.filter((item) => !readIds.has(item.id)).length

  const markAllRead = () => {
    setReadIds(new Set(notifications.map((item) => item.id)))
    toast.success("All notifications marked as read")
  }

  const handleSignOut = async () => {
    await signOut()
    navigate("/login", { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
      </div>

      <div className="flex flex-1 justify-center px-2">
        <GlobalSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="size-5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex size-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-80 sm:min-w-96">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="pt-0">Notifications</DropdownMenuLabel>
              <Button variant="ghost" size="xs" onClick={markAllRead} className="gap-1.5">
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Mark all as read
              </Button>
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((item) => {
                const read = readIds.has(item.id)
                return (
                  <DropdownMenuItem
                    key={item.id}
                    className="flex items-start gap-3 py-2.5 align-top"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <span
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", notificationToneDot[item.tone])}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                        {timeAgo(item.timestamp)}
                      </span>
                    </span>
                    {!read && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </DropdownMenuItem>
                )
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <MessagesMenu />

        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="School calendar"
          className="hidden sm:inline-flex"
        >
          <Link to="/events">
            <CalendarDays className="size-5" aria-hidden="true" />
          </Link>
        </Button>

        <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 rounded-full px-1.5 py-1 sm:pr-2" aria-label="Profile menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left sm:block">
                <span className="block max-w-28 truncate text-sm font-medium leading-tight">
                  {displayName}
                </span>
                <span className="block text-[11px] text-muted-foreground leading-tight">
                  {roleLabel}
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">{user?.email ?? roleLabel}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <UserRound className="size-4" aria-hidden="true" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <Settings className="size-4" aria-hidden="true" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}