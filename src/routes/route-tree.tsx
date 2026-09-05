import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { ModulePlaceholderPage } from "@/components/placeholders/ModulePlaceholderPage"
import { RouteFallback } from "@/components/shared/RouteFallback"
import LoginPage from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { getAllNavItems } from "@/routes/navigation"
import { moduleMeta } from "@/data/moduleMeta"

// Feature pages are lazy-loaded so the initial login shell does not pull in
// chart/reporting (recharts/d3), command-palette (cmdk) or other heavy modules
// before the login page is needed. Each page becomes its own on-demand chunk.
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })))
const AcademicSessionsPage = lazy(() =>
  import("@/pages/academicSessions/AcademicSessionsPage").then((m) => ({ default: m.AcademicSessionsPage })),
)
const ClassesPage = lazy(() => import("@/pages/classes/ClassesPage").then((m) => ({ default: m.ClassesPage })))
const SectionsPage = lazy(() => import("@/pages/sections/SectionsPage").then((m) => ({ default: m.SectionsPage })))
const SubjectsPage = lazy(() => import("@/pages/subjects/SubjectsPage").then((m) => ({ default: m.SubjectsPage })))
const StudentDetailPage = lazy(() =>
  import("@/pages/students/StudentDetailPage").then((m) => ({ default: m.StudentDetailPage })),
)
const StudentFormPage = lazy(() =>
  import("@/pages/students/StudentFormPage").then((m) => ({ default: m.StudentFormPage })),
)
const StudentsPage = lazy(() => import("@/pages/students/StudentsPage").then((m) => ({ default: m.StudentsPage })))
const TeachersPage = lazy(() => import("@/pages/teachers/TeachersPage").then((m) => ({ default: m.TeachersPage })))
const TeacherDetailPage = lazy(() =>
  import("@/pages/teachers/TeacherDetailPage").then((m) => ({ default: m.TeacherDetailPage })),
)
const StaffPage = lazy(() => import("@/pages/staff/StaffPage").then((m) => ({ default: m.StaffPage })))
const StaffDetailPage = lazy(() =>
  import("@/pages/staff/StaffDetailPage").then((m) => ({ default: m.StaffDetailPage })),
)
const NoticesPage = lazy(() => import("@/pages/notices/NoticesPage").then((m) => ({ default: m.NoticesPage })))
const EventsPage = lazy(() => import("@/pages/events/EventsPage").then((m) => ({ default: m.EventsPage })))
const AdmissionsPage = lazy(() =>
  import("@/pages/admissions/AdmissionsPage").then((m) => ({ default: m.AdmissionsPage })),
)
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })))
const TimetablePage = lazy(() =>
  import("@/pages/timetable/TimetablePage").then((m) => ({ default: m.TimetablePage })),
)
const AttendancePage = lazy(() =>
  import("@/pages/attendance/AttendancePage").then((m) => ({ default: m.AttendancePage })),
)
const HomeworkPage = lazy(() => import("@/pages/homework").then((m) => ({ default: m.HomeworkPage })))
const AssignmentsPage = lazy(() =>
  import("@/pages/assignments").then((m) => ({ default: m.AssignmentsPage })),
)
const ExaminationsPage = lazy(() =>
  import("@/pages/examinations").then((m) => ({ default: m.ExaminationsPage })),
)
const ResultsPage = lazy(() => import("@/pages/results").then((m) => ({ default: m.ResultsPage })))
const FeesPage = lazy(() => import("@/pages/fees").then((m) => ({ default: m.FeesPage })))
const PaymentsPage = lazy(() => import("@/pages/payments").then((m) => ({ default: m.PaymentsPage })))
const ReceiptsPage = lazy(() => import("@/pages/receipts").then((m) => ({ default: m.ReceiptsPage })))
const UsersPage = lazy(() => import("@/pages/users").then((m) => ({ default: m.UsersPage })))
const AuditLogsPage = lazy(() =>
  import("@/pages/auditLogs").then((m) => ({ default: m.AuditLogsPage })),
)

const DASHBOARD_PATH = "/dashboard"
const IMPLEMENTED_PATHS = new Set([
  DASHBOARD_PATH,
  "/students",
  "/academic-sessions",
  "/classes",
  "/sections",
  "/subjects",
  "/teachers",
  "/staff",
  "/notices",
  "/events",
  "/admissions",
  "/settings",
  "/timetable",
  "/attendance",
  "/homework",
  "/assignments",
  "/examinations",
  "/results",
  "/fees",
  "/payments",
  "/receipts",
  "/users",
  "/audit-logs",
])

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
      // Implemented modules use lazy-loaded pages inside a shared Suspense so
      // each chunk loads on demand with a lightweight, non-blocking fallback.
      {
        element: (
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        ),
        children: [
          { path: DASHBOARD_PATH, element: <DashboardPage /> },
          { path: "/students", element: <StudentsPage /> },
          { path: "/students/new", element: <StudentFormPage /> },
          { path: "/students/:id", element: <StudentDetailPage /> },
          { path: "/students/:id/edit", element: <StudentFormPage /> },
          { path: "/academic-sessions", element: <AcademicSessionsPage /> },
          { path: "/classes", element: <ClassesPage /> },
          { path: "/sections", element: <SectionsPage /> },
          { path: "/subjects", element: <SubjectsPage /> },
          { path: "/teachers", element: <TeachersPage /> },
          { path: "/teachers/:id", element: <TeacherDetailPage /> },
          { path: "/staff", element: <StaffPage /> },
          { path: "/staff/:id", element: <StaffDetailPage /> },
          { path: "/notices", element: <NoticesPage /> },
          { path: "/events", element: <EventsPage /> },
          { path: "/admissions", element: <AdmissionsPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/timetable", element: <TimetablePage /> },
          { path: "/attendance", element: <AttendancePage /> },
          { path: "/homework", element: <HomeworkPage /> },
          { path: "/assignments", element: <AssignmentsPage /> },
          { path: "/examinations", element: <ExaminationsPage /> },
          { path: "/results", element: <ResultsPage /> },
          { path: "/fees", element: <FeesPage /> },
          { path: "/payments", element: <PaymentsPage /> },
          { path: "/receipts", element: <ReceiptsPage /> },
          { path: "/users", element: <UsersPage /> },
          { path: "/audit-logs", element: <AuditLogsPage /> },
          // Remaining unimplemented modules from the navigation registry.
          ...getAllNavItems()
            .filter((item) => !IMPLEMENTED_PATHS.has(item.path) && !item.path.startsWith("/students"))
            .map((item) => ({
              path: item.path,
              element: <ModulePlaceholderPage module={moduleMeta[item.path]} />,
            })),
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
