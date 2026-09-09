import type { ModuleMeta } from "@/types"

// TEMPORARY metadata used to render polished placeholder pages for modules that
// are deliberately deferred. When a module is implemented, remove its entry here
// and mount its real page in the route tree.
export const moduleMeta: Record<string, ModuleMeta> = {
  "/payroll": {
    path: "/payroll",
    label: "Payroll",
    status: "planned",
    purpose: "Staff payroll processing, salary structure, and pay slips.",
    futureConnection: "Connects to the Payroll API and payroll table in the database.",
  },
  "/hostel": {
    path: "/hostel",
    label: "Hostel",
    status: "planned",
    purpose: "Hostel blocks, room allocation, and boarder management.",
    futureConnection: "Connects to the Hostel API and hostel tables in the database.",
  },
  "/backups": {
    path: "/backups",
    label: "Backups",
    status: "planned",
    purpose: "Automatic and on-demand database backups with restore.",
    futureConnection: "Connects to the Backup API and backup job records in the database.",
  },
}