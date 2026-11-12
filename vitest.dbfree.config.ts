import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  envDir: false,
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".d.ts"],
    },
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/tests/production-target-guard.unit.test.ts",
      "server/tests/permission-reconcile.unit.test.ts",
      "server/tests/permission-reconcile-staging.contract.test.ts",
      "server/tests/roles-staging.contract.test.ts",
      "server/tests/staging-fixture.contract.test.ts",
      "server/tests/staging-server.contract.test.ts",
      "server/tests/staging-target.unit.test.ts",
      "server/tests/staging-migrate.contract.test.ts",
      "server/tests/test-database-guard.contract.test.ts",
      "server/tests/teacher-rbac-matrix.unit.test.ts",
      "server/tests/dashboard-stats-split.unit.test.ts",
      "server/tests/dashboard-activity-fees.unit.test.ts",
      "src/auth/routing-permissions.test.ts",
      "src/auth/routing.test.ts",
      "src/routes/RouteAccessGuard.test.tsx",
      "src/components/layout/SidebarNav.test.tsx",
      "src/components/layout/GlobalSearch.test.tsx",
      "src/hooks/useDashboardData.permissions.test.tsx",
      "src/components/dashboard/DashboardPage.permissions.test.tsx",
      "src/components/dashboard/QuickActions.test.tsx",
      "src/components/dashboard/FeesCollectionCard.test.tsx",
      "src/components/dashboard/RecentActivity.permissions.test.tsx",
      "src/components/teachers/TeacherPermissionsCard.test.tsx",
      "src/components/students/StudentsToolbar.permissions.test.tsx",
    ],
    exclude: [],
    env: {},
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
