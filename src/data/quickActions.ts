import {
  Banknote,
  BarChart3,
  CalendarCheck2,
  GraduationCap,
  Megaphone,
  Presentation,
} from "lucide-react"
import type { QuickAction } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Quick action catalogue. The dialog each action opens lives in
// components/dialogs and is wired in the QuickActions widget.

export const quickActions: QuickAction[] = [
  {
    id: "add-student",
    label: "Add Student",
    description: "Enrol a new student",
    icon: GraduationCap,
  },
  {
    id: "add-teacher",
    label: "Add Teacher",
    description: "Create a teacher profile",
    icon: Presentation,
  },
  {
    id: "mark-attendance",
    label: "Mark Attendance",
    description: "Record today's attendance",
    icon: CalendarCheck2,
  },
  {
    id: "collect-fees",
    label: "Collect Fees",
    description: "Record a fee payment",
    icon: Banknote,
  },
  {
    id: "create-notice",
    label: "Create Notice",
    description: "Publish a school notice",
    icon: Megaphone,
  },
  {
    id: "generate-report",
    label: "Generate Report",
    description: "Build a custom report",
    icon: BarChart3,
  },
]