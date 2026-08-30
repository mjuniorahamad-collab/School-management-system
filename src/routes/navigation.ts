import {
  Award,
  Banknote,
  BarChart3,
  BedDouble,
  Blocks,
  BookOpen,
  Bus,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DatabaseBackup,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Presentation,
  Receipt,
  School,
  ScrollText,
  Settings,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react"

import type { NavItem, NavSection } from "@/types"

export const navigationSections: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ path: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    id: "academics",
    label: "Academics",
    items: [
      { path: "/students", label: "Students", icon: Users },
      { path: "/admissions", label: "Admissions", icon: UserPlus },
      { path: "/teachers", label: "Teachers", icon: Presentation },
      { path: "/staff", label: "Staff", icon: UsersRound },
      { path: "/classes", label: "Classes", icon: School },
      { path: "/sections", label: "Sections", icon: Blocks },
      { path: "/subjects", label: "Subjects", icon: BookOpen },
      { path: "/timetable", label: "Timetable", icon: CalendarClock },
      { path: "/attendance", label: "Attendance", icon: CalendarCheck2 },
      { path: "/homework", label: "Homework", icon: NotebookPen },
      { path: "/assignments", label: "Assignments", icon: ClipboardList },
      { path: "/examinations", label: "Examinations", icon: ClipboardCheck },
      { path: "/results", label: "Results", icon: Award },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { path: "/fees", label: "Fees Management", icon: Banknote },
      { path: "/payments", label: "Payments", icon: CreditCard },
      { path: "/receipts", label: "Receipts", icon: Receipt },
      { path: "/payroll", label: "Payroll", icon: Wallet },
    ],
  },
  {
    id: "services",
    label: "Services",
    items: [
      { path: "/library", label: "Library", icon: Library },
      { path: "/transport", label: "Transport", icon: Bus },
      { path: "/hostel", label: "Hostel", icon: BedDouble },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      { path: "/notices", label: "Notices", icon: Megaphone },
      { path: "/events", label: "Events", icon: CalendarDays },
      { path: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [{ path: "/reports", label: "Reports", icon: BarChart3 }],
  },
  {
    id: "system",
    label: "System",
    items: [
      { path: "/users", label: "Users & Roles", icon: UserCog },
      { path: "/settings", label: "Settings", icon: Settings },
      { path: "/backups", label: "Backups", icon: DatabaseBackup },
      { path: "/audit-logs", label: "Audit Logs", icon: ScrollText },
    ],
  },
]

export function getAllNavItems(): NavItem[] {
  return navigationSections.flatMap((section) => section.items)
}

export function findNavItem(path: string): NavItem | undefined {
  return getAllNavItems().find((item) => item.path === path)
}

export const getDefaultNavItem = () => getAllNavItems()[0]