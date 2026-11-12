import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ROLE_PERMISSIONS } from "../src/permissions/permissions.js"

const serverSrcDir = path.resolve(import.meta.dirname, "../src")
const teacherPermissions = new Set<string>(ROLE_PERMISSIONS.TEACHER)
const sourceCache = new Map<string, string>()

function compactSource(file: string): string {
  const cached = sourceCache.get(file)
  if (cached !== undefined) {
    return cached
  }

  const source = readFileSync(path.join(serverSrcDir, file), "utf8").replace(/\s+/g, "")
  sourceCache.set(file, source)
  return source
}

interface EndpointCase {
  endpoint: string
  file: string
  permission: string
  expectedStatus: 200 | 403
  sourceNeedle: string
}

const ENDPOINT_CASES: readonly EndpointCase[] = [
  {
    endpoint: "GET /dashboard/stats",
    file: "modules/dashboard/dashboard.route.ts",
    permission: "dashboard:view",
    expectedStatus: 200,
    sourceNeedle: 'dashboardRouter.get("/stats",requirePermission("dashboard:view")',
  },
  {
    endpoint: "GET /dashboard/stats/fees",
    file: "modules/dashboard/dashboard.route.ts",
    permission: "fees:view",
    expectedStatus: 403,
    sourceNeedle: 'dashboardRouter.get("/stats/fees",requirePermission("fees:view")',
  },
  {
    endpoint: "GET /dashboard/fees",
    file: "modules/dashboard/dashboard.route.ts",
    permission: "fees:view",
    expectedStatus: 403,
    sourceNeedle: 'dashboardRouter.get("/fees",requirePermission("fees:view")',
  },
  {
    endpoint: "GET /dashboard/fee-status",
    file: "modules/dashboard/dashboard.route.ts",
    permission: "fees:view",
    expectedStatus: 403,
    sourceNeedle: 'dashboardRouter.get("/fee-status",requirePermission("fees:view")',
  },
  {
    endpoint: "GET /fees/structures",
    file: "modules/fee-structures/fee-structure.route.ts",
    permission: "fees:view",
    expectedStatus: 403,
    sourceNeedle: 'feeStructuresRouter.get("/",requirePermission("fees:view")',
  },
  {
    endpoint: "GET /fees/invoices",
    file: "modules/fee-invoices/fee-invoice.route.ts",
    permission: "fees:view",
    expectedStatus: 403,
    sourceNeedle: 'feeInvoicesRouter.get("/",requirePermission("fees:view")',
  },
  {
    endpoint: "GET /fees/adjustments",
    file: "modules/fee-adjustments/fee-adjustment.route.ts",
    permission: "concessions:view",
    expectedStatus: 403,
    sourceNeedle: 'feeAdjustmentsRouter.get("/",requirePermission("concessions:view")',
  },
  {
    endpoint: "GET /payments",
    file: "modules/payments/payment.route.ts",
    permission: "payments:view",
    expectedStatus: 403,
    sourceNeedle: 'paymentsRouter.get("/",requirePermission("payments:view")',
  },
  {
    endpoint: "GET /receipts",
    file: "modules/receipts/receipt.route.ts",
    permission: "receipts:view",
    expectedStatus: 403,
    sourceNeedle: 'receiptsRouter.get("/",requirePermission("receipts:view")',
  },
  {
    endpoint: "GET /users",
    file: "modules/users/user.route.ts",
    permission: "users:view",
    expectedStatus: 403,
    sourceNeedle: 'usersRouter.get("/",requirePermission("users:view")',
  },
  {
    endpoint: "GET /audit-logs",
    file: "modules/audit-logs/audit-log.route.ts",
    permission: "audit-logs:view",
    expectedStatus: 403,
    sourceNeedle: 'auditLogsRouter.get("/",requireAuth,requirePermission("audit-logs:view")',
  },
  {
    endpoint: "GET /audit-logs/export",
    file: "modules/audit-logs/audit-log.route.ts",
    permission: "audit-logs:export",
    expectedStatus: 403,
    sourceNeedle: 'auditLogsRouter.get("/export",requireAuth,requirePermission("audit-logs:export")',
  },
  {
    endpoint: "GET /students",
    file: "modules/students/student.route.ts",
    permission: "students:view",
    expectedStatus: 200,
    sourceNeedle: 'studentsRouter.get("/",requirePermission("students:view")',
  },
  {
    endpoint: "GET /students/meta",
    file: "modules/students/student.route.ts",
    permission: "students:view",
    expectedStatus: 200,
    sourceNeedle: 'studentsRouter.get("/meta",requirePermission("students:view")',
  },
  {
    endpoint: "GET /students/export",
    file: "modules/students/student.route.ts",
    permission: "students:export",
    expectedStatus: 403,
    sourceNeedle: 'studentsRouter.get("/export",requirePermission("students:export")',
  },
  {
    endpoint: "POST /students",
    file: "modules/students/student.route.ts",
    permission: "students:create",
    expectedStatus: 403,
    sourceNeedle: 'studentsRouter.post("/",requirePermission("students:create")',
  },
  {
    endpoint: "PATCH /students/:id",
    file: "modules/students/student.route.ts",
    permission: "students:update",
    expectedStatus: 403,
    sourceNeedle: 'studentsRouter.patch("/:id",requirePermission("students:update")',
  },
  {
    endpoint: "PUT /students/:id/photo",
    file: "modules/photos/photo.route.ts",
    permission: "students:update",
    expectedStatus: 403,
    sourceNeedle: 'router.put("/",requirePermission(options.update)',
  },
  {
    endpoint: "DELETE /students/:id/photo",
    file: "modules/photos/photo.route.ts",
    permission: "students:update",
    expectedStatus: 403,
    sourceNeedle: 'router.delete("/",requirePermission(options.update)',
  },
  {
    endpoint: "GET /memberships/:id/permissions",
    file: "modules/membership-permissions/membership-permission.route.ts",
    permission: "membership-permissions:view",
    expectedStatus: 403,
    sourceNeedle:
      'membershipPermissionsRouter.get("/:membershipId/permissions",requirePermission("membership-permissions:view")',
  },
  {
    endpoint: "POST /memberships/:id/permissions",
    file: "modules/membership-permissions/membership-permission.route.ts",
    permission: "membership-permissions:grant",
    expectedStatus: 403,
    sourceNeedle:
      'membershipPermissionsRouter.post("/:membershipId/permissions",requirePermission("membership-permissions:grant")',
  },
]

const ROUTE_MOUNTS: readonly { mountPath: string; routerName: string }[] = [
  { mountPath: "/dashboard", routerName: "dashboardRouter" },
  { mountPath: "/students", routerName: "studentsRouter" },
  { mountPath: "/fees/structures", routerName: "feeStructuresRouter" },
  { mountPath: "/fees/invoices", routerName: "feeInvoicesRouter" },
  { mountPath: "/fees/adjustments", routerName: "feeAdjustmentsRouter" },
  { mountPath: "/payments", routerName: "paymentsRouter" },
  { mountPath: "/receipts", routerName: "receiptsRouter" },
  { mountPath: "/users", routerName: "usersRouter" },
  { mountPath: "/audit-logs", routerName: "auditLogsRouter" },
  { mountPath: "/memberships", routerName: "membershipPermissionsRouter" },
]

describe("TEACHER RBAC matrix (database-free)", () => {
  it("maps every audited endpoint to the TEACHER permission expectation", () => {
    for (const testCase of ENDPOINT_CASES) {
      const teacherHoldsPermission = teacherPermissions.has(testCase.permission)

      expect(
        teacherHoldsPermission,
        `${testCase.endpoint} requires ${testCase.permission}; expected ${testCase.expectedStatus}`,
      ).toBe(testCase.expectedStatus === 200)
    }
  })

  it("declares the expected permission middleware in each route source", () => {
    for (const testCase of ENDPOINT_CASES) {
      expect(
        compactSource(testCase.file),
        `${testCase.endpoint} should be guarded by ${testCase.permission} in ${testCase.file}`,
      ).toContain(testCase.sourceNeedle)
    }
  })

  it("wires the student photo sub-router to the student permissions", () => {
    const studentRoutes = compactSource("modules/students/student.route.ts")

    expect(studentRoutes).toContain(
      'studentsRouter.use("/:id/photo",photoRoutes(studentPhotoEntity,{view:"students:view",update:"students:update"',
    )
  })

  it("mounts each router under the expected API path", () => {
    const routeIndex = compactSource("routes/index.ts")

    for (const routeMount of ROUTE_MOUNTS) {
      expect(routeIndex).toContain(
        `apiRouter.use("${routeMount.mountPath}",${routeMount.routerName})`,
      )
    }
  })
})
