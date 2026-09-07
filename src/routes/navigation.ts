import {
  Award,
  Banknote,
  BarChart3,
  BedDouble,
  Bell,
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
  ExternalLink,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Presentation,
  Receipt,
  GraduationCap,
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
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, requiredPermission: "dashboard:view" },
      { path: "/portal", label: "My Portal", icon: ExternalLink, requiredPermission: "portal:view" },
      { path: "/portal/links", label: "Portal Accounts", icon: UserPlus, requiredPermission: "portal:update" },
    ],
  },
  {
    id: "academics",
    label: "Academics",
    items: [
      { path: "/students", label: "Students", icon: Users, requiredPermission: "students:view" },
      { path: "/admissions", label: "Admissions", icon: UserPlus, requiredPermission: "admissions:view" },
      { path: "/teachers", label: "Teachers", icon: Presentation, requiredPermission: "teachers:view" },
      { path: "/staff", label: "Staff", icon: UsersRound, requiredPermission: "staff:view" },
      { path: "/academic-sessions", label: "Academic Sessions", icon: GraduationCap, requiredPermission: "academic-sessions:view" },
      { path: "/classes", label: "Classes", icon: School, requiredPermission: "classes:view" },
      { path: "/sections", label: "Sections", icon: Blocks, requiredPermission: "sections:view" },
      { path: "/subjects", label: "Subjects", icon: BookOpen, requiredPermission: "subjects:view" },
      { path: "/timetable", label: "Timetable", icon: CalendarClock, requiredPermission: "timetable:view" },
      { path: "/attendance", label: "Attendance", icon: CalendarCheck2, requiredPermission: "attendance:view" },
      { path: "/homework", label: "Homework", icon: NotebookPen, requiredPermission: "homework:view" },
      { path: "/assignments", label: "Assignments", icon: ClipboardList, requiredPermission: "assignments:view" },
      { path: "/examinations", label: "Examinations", icon: ClipboardCheck, requiredPermission: "exams:view" },
      { path: "/results", label: "Results", icon: Award, requiredPermission: "results:view" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { path: "/fees", label: "Fees Management", icon: Banknote, requiredPermission: "fees:view" },
      { path: "/payments", label: "Payments", icon: CreditCard, requiredPermission: "payments:view" },
      { path: "/receipts", label: "Receipts", icon: Receipt, requiredPermission: "receipts:view" },
      { path: "/payroll", label: "Payroll", icon: Wallet, requiredPermission: "payroll:view" },
    ],
  },
  {
    id: "services",
    label: "Services",
    items: [
      { path: "/library", label: "Library", icon: Library, requiredPermission: "library:view" },
      { path: "/transport", label: "Transport", icon: Bus, requiredPermission: "transport:view" },
      { path: "/hostel", label: "Hostel", icon: BedDouble, requiredPermission: "hostel:view" },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      { path: "/notices", label: "Notices", icon: Megaphone, requiredPermission: "notices:view" },
      { path: "/events", label: "Events", icon: CalendarDays, requiredPermission: "events:view" },
      { path: "/messages", label: "Messages", icon: MessageSquare, requiredPermission: "messages:view" },
      { path: "/notifications", label: "Notifications", icon: Bell, requiredPermission: "notifications:view" },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [{ path: "/reports", label: "Reports", icon: BarChart3, requiredPermission: "reports:view" }],
  },
  {
    id: "system",
    label: "System",
    items: [
      { path: "/users", label: "Users & Roles", icon: UserCog, requiredPermission: "users:view" },
      { path: "/settings", label: "Settings", icon: Settings, requiredPermission: "settings:view" },
      { path: "/backups", label: "Backups", icon: DatabaseBackup, requiredPermission: "backups:view" },
      { path: "/audit-logs", label: "Audit Logs", icon: ScrollText, requiredPermission: "audit-logs:view" },
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