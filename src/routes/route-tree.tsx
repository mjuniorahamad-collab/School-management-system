import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { ModulePlaceholderPage } from "@/components/placeholders/ModulePlaceholderPage"
import { DashboardPage } from "@/pages/DashboardPage"
import LoginPage from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { getAllNavItems } from "@/routes/navigation"
import { moduleMeta } from "@/data/moduleMeta"

const DASHBOARD_PATH = "/dashboard"

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to={DASHBOARD_PATH} replace /> },
      { path: DASHBOARD_PATH, element: <DashboardPage /> },
      // Modules from the navigation registry. Every entry is routed — no dead
      // navigation items. Unimplemented modules render the placeholder page.
      ...getAllNavItems()
        .filter((item) => item.path !== DASHBOARD_PATH)
        .map((item) => ({
          path: item.path,
          element: <ModulePlaceholderPage module={moduleMeta[item.path]} />,
        })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
])