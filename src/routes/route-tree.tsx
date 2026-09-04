import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { ModulePlaceholderPage } from "@/components/placeholders/ModulePlaceholderPage"
import { DashboardPage } from "@/pages/DashboardPage"
import LoginPage from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { AcademicSessionsPage } from "@/pages/academicSessions/AcademicSessionsPage"
import { ClassesPage } from "@/pages/classes/ClassesPage"
import { SectionsPage } from "@/pages/sections/SectionsPage"
import { SubjectsPage } from "@/pages/subjects/SubjectsPage"
import { StudentDetailPage } from "@/pages/students/StudentDetailPage"
import { StudentFormPage } from "@/pages/students/StudentFormPage"
import { StudentsPage } from "@/pages/students/StudentsPage"
import { TeachersPage } from "@/pages/teachers/TeachersPage"
import { TeacherDetailPage } from "@/pages/teachers/TeacherDetailPage"
import { StaffPage } from "@/pages/staff/StaffPage"
import { StaffDetailPage } from "@/pages/staff/StaffDetailPage"
import { NoticesPage } from "@/pages/notices/NoticesPage"
import { EventsPage } from "@/pages/events/EventsPage"
import { AdmissionsPage } from "@/pages/admissions/AdmissionsPage"
import { SettingsPage } from "@/pages/settings/SettingsPage"
import { TimetablePage } from "@/pages/timetable/TimetablePage"
import { AttendancePage } from "@/pages/attendance/AttendancePage"
import { ProtectedRoute } from "@/routes/ProtectedRoute"
import { getAllNavItems } from "@/routes/navigation"
import { moduleMeta } from "@/data/moduleMeta"

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
      { path: DASHBOARD_PATH, element: <DashboardPage /> },
      // Implemented modules mount their real pages here.
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
])