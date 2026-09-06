import { Router } from "express"
import { authRouter } from "./auth.route.js"
import { healthRouter } from "./health.route.js"
import { studentsRouter } from "../modules/students/student.route.js"
import { academicSessionsRouter } from "../modules/academic-sessions/academic-session.route.js"
import { classesRouter } from "../modules/classes/class.route.js"
import { sectionsRouter } from "../modules/sections/section.route.js"
import { subjectsRouter } from "../modules/subjects/subject.route.js"
import { teachersRouter } from "../modules/teachers/teacher.route.js"
import { staffRouter } from "../modules/staff/staff.route.js"
import { usersRouter } from "../modules/users/user.route.js"
import { rolesRouter } from "../modules/roles/role.route.js"
import { feeHeadsRouter } from "../modules/fee-heads/fee-head.route.js"
import { examTypesRouter } from "../modules/exam-types/exam-type.route.js"
import { gradingBandsRouter } from "../modules/grading-bands/grading-band.route.js"
import { periodSlotsRouter } from "../modules/period-slots/period-slot.route.js"
import { settingsRouter } from "../modules/settings/setting.route.js"
import { noticesRouter } from "../modules/notices/notice.route.js"
import { eventsRouter } from "../modules/events/event.route.js"
import { admissionsRouter } from "../modules/admissions/admission.route.js"
import { timetableRouter } from "../modules/timetable/timetable.route.js"
import { attendanceRouter } from "../modules/attendance/attendance.route.js"
import { homeworkRouter } from "../modules/homework/homework.route.js"
import { assignmentRouter } from "../modules/assignments/assignment.route.js"
import { examRouter } from "../modules/exams/exam.route.js"
import { resultRouter } from "../modules/results/result.route.js"
import { feeStructuresRouter } from "../modules/fee-structures/fee-structure.route.js"
import { feeInvoicesRouter } from "../modules/fee-invoices/fee-invoice.route.js"
import { paymentsRouter } from "../modules/payments/payment.route.js"
import { receiptsRouter } from "../modules/receipts/receipt.route.js"
import { dashboardRouter } from "../modules/dashboard/dashboard.route.js"
import { auditLogsRouter } from "../modules/audit-logs/audit-log.route.js"
import { messagesRouter } from "../modules/messages/message.route.js"

// Feature modules register their routers here (e.g. apiRouter.use(studentsRouter)).
export const apiRouter: Router = Router()

apiRouter.use(healthRouter)
apiRouter.use("/auth", authRouter)
apiRouter.use("/students", studentsRouter)
apiRouter.use("/academic-sessions", academicSessionsRouter)
apiRouter.use("/classes", classesRouter)
apiRouter.use("/sections", sectionsRouter)
apiRouter.use("/subjects", subjectsRouter)
apiRouter.use("/teachers", teachersRouter)
apiRouter.use("/staff", staffRouter)
apiRouter.use("/users", usersRouter)
apiRouter.use("/roles", rolesRouter)
apiRouter.use("/fee-heads", feeHeadsRouter)
apiRouter.use("/exam-types", examTypesRouter)
apiRouter.use("/grading-bands", gradingBandsRouter)
apiRouter.use("/period-slots", periodSlotsRouter)
apiRouter.use("/settings", settingsRouter)
apiRouter.use("/notices", noticesRouter)
apiRouter.use("/events", eventsRouter)
apiRouter.use("/admissions", admissionsRouter)
apiRouter.use("/timetable", timetableRouter)
apiRouter.use("/attendance", attendanceRouter)
apiRouter.use("/homework", homeworkRouter)
apiRouter.use("/assignments", assignmentRouter)
apiRouter.use("/exams", examRouter)
apiRouter.use("/results", resultRouter)
apiRouter.use("/fees/structures", feeStructuresRouter)
apiRouter.use("/fees/invoices", feeInvoicesRouter)
apiRouter.use("/payments", paymentsRouter)
apiRouter.use("/receipts", receiptsRouter)
apiRouter.use("/dashboard", dashboardRouter)
apiRouter.use("/audit-logs", auditLogsRouter)
apiRouter.use("/messages", messagesRouter)