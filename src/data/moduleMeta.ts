import type { ModuleMeta } from "@/types"

// TEMPORARY metadata used to render polished placeholder pages for modules that
// are not part of the current dashboard milestone. When a module is implemented,
// remove its entry here and mount its real page in the route tree.
export const moduleMeta: Record<string, ModuleMeta> = {
  "/payroll": {
    path: "/payroll",
    label: "Payroll",
    status: "planned",
    purpose: "Staff payroll processing, salary structure, and pay slips.",
    futureConnection: "Connects to the Payroll API and payroll table in the database.",
  },
  "/library": {
    path: "/library",
    label: "Library",
    status: "planned",
    purpose: "Catalogue, book issue/return, and borrower management.",
    futureConnection: "Connects to the Library API and books table in the database.",
  },
  "/transport": {
    path: "/transport",
    label: "Transport",
    status: "planned",
    purpose: "Bus routes, stops, and student–route assignments.",
    futureConnection: "Connects to the Transport API and routes table in the database.",
  },
  "/hostel": {
    path: "/hostel",
    label: "Hostel",
    status: "planned",
    purpose: "Hostel blocks, room allocation, and boarder management.",
    futureConnection: "Connects to the Hostel API and hostel tables in the database.",
  },
  "/reports": {
    path: "/reports",
    label: "Reports",
    status: "planned",
    purpose: "Predefined and custom reports across academic and financial data.",
    futureConnection: "Connects to the Reports API and report definitions in the database.",
  },
  "/backups": {
    path: "/backups",
    label: "Backups",
    status: "planned",
    purpose: "Automatic and on-demand database backups with restore.",
    futureConnection: "Connects to the Backup API and backup job records in the database.",
  },
}