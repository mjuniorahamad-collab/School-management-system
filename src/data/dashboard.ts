import { Banknote, Presentation, School, Users } from "lucide-react"
import type {
  BirthdayStudent,
  DashboardStat,
  FeeCollectionStatus,
} from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// These figures are illustrative and will be replaced by the dashboard API
// (services/dashboardService) backed by the database. Do NOT treat them as
// real school records.

export const dashboardStats: DashboardStat[] = [
  {
    id: "total-students",
    label: "Total Students",
    value: "1,248",
    trendPercent: 12.5,
    comparison: "vs last month",
    icon: Users,
    tone: "primary",
  },
  {
    id: "total-teachers",
    label: "Total Teachers",
    value: "78",
    trendPercent: 8.3,
    comparison: "vs last month",
    icon: Presentation,
    tone: "emerald",
  },
  {
    id: "total-classes",
    label: "Total Classes",
    value: "42",
    trendPercent: 5.2,
    comparison: "vs last month",
    icon: School,
    tone: "sky",
  },
  {
    id: "fees-collection",
    label: "Fees Collection",
    value: "₹12,45,000",
    trendPercent: 18.7,
    comparison: "vs last session",
    icon: Banknote,
    tone: "amber",
  },
]

export const feeCollectionStatus: FeeCollectionStatus = {
  collected: 1245000,
  pending: 480000,
  total: 1725000,
}

export const birthdayStudents: BirthdayStudent[] = [
  { id: "b1", name: "Ananya Sharma", studentClass: "8 · A", age: 13 },
  { id: "b2", name: "Rohan Verma", studentClass: "6 · B", age: 11 },
  { id: "b3", name: "Ishaan Gupta", studentClass: "9 · A", age: 14 },
]