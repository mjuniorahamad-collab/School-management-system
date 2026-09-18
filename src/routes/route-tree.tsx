import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { RouteFallback } from "@/components/shared/RouteFallback"
import LoginPage from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { useAuth } from "@/auth/useAuth"
import { defaultLandingPath } from "@/auth/routing"
import { ProtectedRoute } from "@/routes/ProtectedRoute"

/** Redirects the app root to the role-appropriate landing page. */
function LandingRedirect() {
  const { user } = useAuth()
  return <Navigate to={defaultLandingPath(user)} replace />
}

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
const LibraryPage = lazy(() =>
  import("@/pages/library/LibraryPage").then((m) => ({ default: m.LibraryPage })),
)
const FeesPage = lazy(() => import("@/pages/fees").then((m) => ({ default: m.FeesPage })))
const PaymentsPage = lazy(() => import("@/pages/payments").then((m) => ({ default: m.PaymentsPage })))
const ReceiptsPage = lazy(() => import("@/pages/receipts").then((m) => ({ default: m.ReceiptsPage })))
const UsersPage = lazy(() => import("@/pages/users").then((m) => ({ default: m.UsersPage })))
const AuditLogsPage = lazy(() =>
  import("@/pages/auditLogs").then((m) => ({ default: m.AuditLogsPage })),
)
const MessagesPage = lazy(() =>
  import("@/pages/messages").then((m) => ({ default: m.MessagesPage })),
)
const NotificationsPage = lazy(() =>
  import("@/pages/notifications").then((m) => ({ default: m.NotificationsPage })),
)
const TransportPage = lazy(() =>
  import("@/pages/transport/TransportPage").then((m) => ({ default: m.TransportPage })),
)
const ReportsPage = lazy(() =>
  import("@/pages/reports/ReportsPage").then((m) => ({ default: m.ReportsPage })),
)
const PortalHomePage = lazy(() =>
  import("@/pages/portal/PortalHomePage").then((m) => ({ default: m.PortalHomePage })),
)
const PortalNoticesPage = lazy(() =>
  import("@/pages/portal/PortalNoticesPage").then((m) => ({ default: m.PortalNoticesPage })),
)
const PortalChildPage = lazy(() =>
  import("@/pages/portal/PortalChildPage").then((m) => ({ default: m.PortalChildPage })),
)
const PortalLinksPage = lazy(() =>
  import("@/pages/portal/PortalLinksPage").then((m) => ({ default: m.PortalLinksPage })),
)
const ActivatePortalPage = lazy(() =>
  import("@/pages/portal/ActivatePortalPage").then((m) => ({ default: m.ActivatePortalPage })),
)

const DASHBOARD_PATH = "/dashboard"

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/activate",
    element: (
      <Suspense fallback={<RouteFallback />}>
        <ActivatePortalPage />
      </Suspense>
    ),
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <LandingRedirect /> },
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
          { path: "/library", element: <LibraryPage /> },
          { path: "/fees", element: <FeesPage /> },
          { path: "/payments", element: <PaymentsPage /> },
          { path: "/receipts", element: <ReceiptsPage /> },
          { path: "/users", element: <UsersPage /> },
          { path: "/audit-logs", element: <AuditLogsPage /> },
          { path: "/messages", element: <MessagesPage /> },
          { path: "/notifications", element: <NotificationsPage /> },
          { path: "/transport", element: <TransportPage /> },
          { path: "/reports", element: <ReportsPage /> },
          { path: "/portal", element: <PortalHomePage /> },
          { path: "/portal/notices", element: <PortalNoticesPage /> },
          { path: "/portal/links", element: <PortalLinksPage /> },
          { path: "/portal/:studentId", element: <PortalChildPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
