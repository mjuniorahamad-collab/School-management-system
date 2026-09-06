import { Prisma, type NoticeAudience } from "@prisma/client"
import {
  ApiError,
  badRequestError,
  notFoundError,
} from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { toMoney } from "../../lib/money.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type {
  PortalAttendanceRecord,
  PortalAttendanceResult,
  PortalAttendanceSummary,
  PortalChild,
  PortalChildDetail,
  PortalExamResult,
  PortalFeesResult,
  PortalInvoiceView,
  PortalLibraryResult,
  PortalLibraryLoanView,
  PortalLink,
  PortalLinksResult,
  PortalNoticeView,
  PortalNoticesResult,
  PortalOverview,
  PortalResultsResult,
  PortalSession,
  PortalTaskView,
  PortalTasksResult,
  PortalTransportAssignmentView,
  PortalTransportResult,
  PortalLinkCandidatesResult,
} from "./portal.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const client = await getPrisma()
  if (!client) throw new Error("Database is not configured")
  return client
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function studentName(student: { firstName: string; lastName: string | null }): string {
  return [student.firstName, student.lastName].filter(Boolean).join(" ")
}

function notOwnedError(): ApiError {
  return notFoundError("Student not found in your portal")
}

/**
 * Resolves the set of student ids an actor may access through the portal,
 * strictly within their resolved tenant school.
 *
 *   - A STUDENT account linked via `Student.userId` owns only their own row.
 *   - A PARENT account linked via `Guardian.userId` owns every student related
 *     to that guardian through `StudentGuardian`.
 *   - The union is applied when both links exist.
 *
 * Candidate ids are filtered back to the authenticated school so a
 * cross-school relationship row can never widen the actor's view.
 */
export async function resolveOwnedStudentIds(
  prisma: DbClient,
  userId: string,
  schoolId: string,
): Promise<string[]> {
  const owned = new Set<string>()

  const directStudent = await prisma.student.findFirst({
    where: { userId, schoolId },
    select: { id: true },
  })
  if (directStudent) owned.add(directStudent.id)

  const guardians = await prisma.guardian.findMany({
    where: { userId, schoolId },
    select: { id: true },
  })
  if (guardians.length > 0) {
    const links = await prisma.studentGuardian.findMany({
      where: { guardianId: { in: guardians.map((guardian) => guardian.id) } },
      select: { studentId: true },
    })
    const studentIds = links.map((link) => link.studentId)
    if (studentIds.length > 0) {
      const students = await prisma.student.findMany({
        where: { id: { in: studentIds }, schoolId },
        select: { id: true },
      })
      for (const student of students) owned.add(student.id)
    }
  }

  return [...owned]
}

/**
 * Loads a student and verifies the actor owns them. 404 on any failure
 * (unknown id, cross-tenant id, or unowned id) so id tampering never leaks
 * whether a student exists.
 */
async function requireOwnedStudent(
  prisma: DbClient,
  schoolId: string,
  ownedStudentIds: string[],
  studentId: string,
) {
  if (!ownedStudentIds.includes(studentId)) throw notOwnedError()
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      photoUrl: true,
      status: true,
    },
  })
  if (!student) throw notOwnedError()
  return student
}

/**
 * Resolves the session a child-specific read defaults to when none is given:
 * the child's most recent enrollment, then the school's ACTIVE session, then
 * the school's most recent session.
 */
async function resolveSessionForStudent(
  prisma: DbClient,
  schoolId: string,
  studentId: string,
  explicitSessionId?: string,
): Promise<PortalSession> {
  if (explicitSessionId) {
    const session = await prisma.academicSession.findFirst({
      where: { id: explicitSessionId, schoolId },
      select: { id: true, name: true, code: true, status: true },
    })
    if (!session) throw notFoundError("Academic session not found")
    return toSession(session)
  }

  const enrollmentSession = await prisma.studentEnrollment.findFirst({
    where: { studentId, academicSession: { schoolId } },
    orderBy: { createdAt: "desc" },
    select: { academicSession: { select: { id: true, name: true, code: true, status: true } } },
  })
  if (enrollmentSession) return toSession(enrollmentSession.academicSession)

  const active = await prisma.academicSession.findFirst({
    where: { schoolId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, code: true, status: true },
  })
  if (active) return toSession(active)

  const latest = await prisma.academicSession.findFirst({
    where: { schoolId },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, code: true, status: true },
  })
  if (latest) return toSession(latest)

  throw notFoundError("No academic session is available")
}

function toSession(
  session: { id: string; name: string; code: string; status: string },
): PortalSession {
  return {
    id: session.id,
    name: session.name,
    code: session.code,
    status: session.status as PortalSession["status"],
  }
}

async function toChild(
  prisma: DbClient,
  schoolId: string,
  studentId: string,
): Promise<PortalChild> {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, academicSession: { schoolId } },
    orderBy: { createdAt: "desc" },
    select: {
      academicSessionId: true,
      academicSession: { select: { name: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  })
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      gender: true,
      status: true,
      photoUrl: true,
      dateOfBirth: true,
    },
  })
  if (!student) throw notOwnedError()

  return {
    id: student.id,
    admissionNumber: student.admissionNumber,
    name: studentName(student),
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    gender: student.gender,
    status: student.status,
    photoUrl: student.photoUrl,
    dateOfBirth: dateOnly(student.dateOfBirth),
    enrollment: enrollment
      ? {
          academicSessionId: enrollment.academicSessionId,
          academicSessionName: enrollment.academicSession.name,
          className: enrollment.class.name,
          sectionName: enrollment.section?.name ?? null,
        }
      : null,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Self-service reads
// ────────────────────────────────────────────────────────────────────────────

export async function getOverview(auth: AuthUser): Promise<PortalOverview> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const children = await Promise.all(owned.map((id) => toChild(prisma, auth.school.id, id)))
  return {
    id: auth.id,
    name: auth.name,
    school: { id: auth.school.id, name: auth.school.name },
    actorKind: auth.roles.includes("STUDENT") ? "STUDENT" : "GUARDIAN",
    children: children.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function getChildren(auth: AuthUser): Promise<PortalChild[]> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const children = await Promise.all(owned.map((id) => toChild(prisma, auth.school.id, id)))
  return children.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getChild(auth: AuthUser, studentId: string): Promise<PortalChildDetail> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  await requireOwnedStudent(prisma, auth.school.id, owned, studentId)

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: auth.school.id },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
      gender: true,
      status: true,
      photoUrl: true,
      dateOfBirth: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      admissionDate: true,
      studentGuardians: {
        select: {
          relationshipType: true,
          isPrimary: true,
          guardian: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!student) throw notOwnedError()

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, academicSession: { schoolId: auth.school.id } },
    orderBy: { createdAt: "desc" },
    select: {
      academicSessionId: true,
      academicSession: { select: { name: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  })

  return {
    id: student.id,
    admissionNumber: student.admissionNumber,
    name: studentName(student),
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    gender: student.gender,
    status: student.status,
    photoUrl: student.photoUrl,
    dateOfBirth: dateOnly(student.dateOfBirth),
    email: student.email,
    phone: student.phone,
    city: student.city,
    state: student.state,
    admissionDate: dateOnly(student.admissionDate),
    enrollment: enrollment
      ? {
          academicSessionId: enrollment.academicSessionId,
          academicSessionName: enrollment.academicSession.name,
          className: enrollment.class.name,
          sectionName: enrollment.section?.name ?? null,
        }
      : null,
    guardians: student.studentGuardians.map((link) => ({
      id: link.guardian.id,
      name: link.guardian.name,
      relationshipType: link.relationshipType,
      isPrimary: link.isPrimary,
    })),
  }
}

export async function getAttendance(
  auth: AuthUser,
  studentId: string,
  sessionId?: string,
): Promise<PortalAttendanceResult> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const student = await requireOwnedStudent(prisma, auth.school.id, owned, studentId)
  const session = await resolveSessionForStudent(prisma, auth.school.id, studentId, sessionId)

  const records = await prisma.attendanceRecord.findMany({
    where: { schoolId: auth.school.id, studentId, academicSessionId: session.id },
    orderBy: { date: "desc" },
    select: { id: true, date: true, status: true, note: true },
  })

  const summary: PortalAttendanceSummary = {
    present: records.filter((r) => r.status === "PRESENT").length,
    absent: records.filter((r) => r.status === "ABSENT").length,
    late: records.filter((r) => r.status === "LATE").length,
    total: records.length,
    presentRate: null,
  }
  const marked = summary.present + summary.late
  if (summary.present + summary.absent + summary.late > 0) {
    summary.presentRate = summary.total > 0 ? Math.round((marked / summary.total) * 1000) / 10 : 0
  }

  const items: PortalAttendanceRecord[] = records.map((record) => ({
    id: record.id,
    date: dateOnly(record.date),
    status: record.status,
    note: record.note,
  }))

  return {
    session,
    student: { id: student.id, name: studentName(student), admissionNumber: student.admissionNumber },
    summary,
    records: items,
  }
}

export async function getFees(
  auth: AuthUser,
  studentId: string,
  sessionId?: string,
): Promise<PortalFeesResult> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const student = await requireOwnedStudent(prisma, auth.school.id, owned, studentId)
  const session = await resolveSessionForStudent(prisma, auth.school.id, studentId, sessionId)

  const invoices = await prisma.feeInvoice.findMany({
    where: { schoolId: auth.school.id, studentId, sessionId: session.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      amountPaid: true,
      balance: true,
      status: true,
      className: true,
      sectionName: true,
      installments: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true,
          dueDate: true,
          amount: true,
          amountPaid: true,
          balance: true,
          status: true,
        },
      },
    },
  })

  const views: PortalInvoiceView[] = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: toMoney(invoice.totalAmount),
    amountPaid: toMoney(invoice.amountPaid),
    balance: toMoney(invoice.balance),
    status: invoice.status,
    className: invoice.className,
    sectionName: invoice.sectionName,
    installments: invoice.installments.map((installment) => ({
      id: installment.id,
      label: installment.label,
      dueDate: dateOnly(installment.dueDate),
      amount: toMoney(installment.amount),
      amountPaid: toMoney(installment.amountPaid),
      balance: toMoney(installment.balance),
      status: installment.status,
    })),
  }))

  const totalAmount = views.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
  const totalPaid = views.reduce((sum, invoice) => sum + invoice.amountPaid, 0)

  return {
    session,
    student: { id: student.id, name: studentName(student), admissionNumber: student.admissionNumber },
    totalAmount,
    totalPaid,
    totalBalance: Math.max(0, totalAmount - totalPaid),
    invoices: views,
  }
}

export async function getResults(
  auth: AuthUser,
  studentId: string,
  sessionId?: string,
): Promise<PortalResultsResult> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const student = await requireOwnedStudent(prisma, auth.school.id, owned, studentId)
  const session = await resolveSessionForStudent(prisma, auth.school.id, studentId, sessionId)

  const results = await prisma.examResult.findMany({
    where: {
      schoolId: auth.school.id,
      studentId,
      exam: { academicSessionId: session.id },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      totalObtained: true,
      totalMaxMarks: true,
      totalPercentage: true,
      grade: true,
      isPass: true,
      rank: true,
      isComplete: true,
      exam: {
        select: {
          id: true,
          name: true,
          examType: { select: { name: true } },
        },
      },
      marks: {
        select: {
          obtainedMarks: true,
          isAbsent: true,
          percentage: true,
          grade: true,
          isPass: true,
          remarks: true,
          examSubject: {
            select: {
              maxMarks: true,
              subject: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  const flat: PortalExamResult[] = results.map((result) => ({
    id: result.id,
    examId: result.exam.id,
    examName: result.exam.name,
    examTypeName: result.exam.examType.name,
    isComplete: result.isComplete,
    totalObtained: result.totalObtained === null ? null : toMoney(result.totalObtained),
    totalMaxMarks: result.totalMaxMarks === null ? null : toMoney(result.totalMaxMarks),
    totalPercentage: result.totalPercentage === null ? null : toMoney(result.totalPercentage),
    grade: result.grade,
    isPass: result.isPass,
    rank: result.rank,
    marks: result.marks.map((mark) => ({
      subjectName: mark.examSubject.subject.name,
      maxMarks: toMoney(mark.examSubject.maxMarks),
      obtainedMarks: mark.obtainedMarks === null ? null : toMoney(mark.obtainedMarks),
      percentage: mark.percentage === null ? null : toMoney(mark.percentage),
      grade: mark.grade,
      isPass: mark.isPass,
      isAbsent: mark.isAbsent,
      remarks: mark.remarks,
    })),
  }))

  return {
    session,
    student: { id: student.id, name: studentName(student), admissionNumber: student.admissionNumber },
    results: flat,
  }
}

export async function getTasks(
  auth: AuthUser,
  studentId: string,
  sessionId?: string,
): Promise<PortalTasksResult> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const student = await requireOwnedStudent(prisma, auth.school.id, owned, studentId)
  const session = await resolveSessionForStudent(prisma, auth.school.id, studentId, sessionId)

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, academicSessionId: session.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, classId: true, sectionId: true },
  })
  if (!enrollment) {
    return {
      session,
      student: { id: student.id, name: studentName(student), admissionNumber: student.admissionNumber },
      items: [],
    }
  }

  const [homeworks, assignments] = await Promise.all([
    prisma.homework.findMany({
      where: {
        schoolId: auth.school.id,
        academicSessionId: session.id,
        classId: enrollment.classId,
        sectionId: enrollment.sectionId,
        status: "PUBLISHED",
      },
      orderBy: { dueDate: "desc" },
      select: {
        id: true,
        title: true,
        instructions: true,
        dueDate: true,
        status: true,
        publishedAt: true,
        subject: { select: { name: true } },
        submissions: {
          where: { studentId },
          select: {
            status: true,
            submittedAt: true,
            marks: true,
            feedback: true,
            content: true,
            attachmentUrl: true,
          },
        },
      },
    }),
    prisma.assignment.findMany({
      where: {
        schoolId: auth.school.id,
        academicSessionId: session.id,
        classId: enrollment.classId,
        sectionId: enrollment.sectionId,
        status: "PUBLISHED",
      },
      orderBy: { dueDate: "desc" },
      select: {
        id: true,
        title: true,
        instructions: true,
        dueDate: true,
        status: true,
        publishedAt: true,
        subject: { select: { name: true } },
        submissions: {
          where: { studentId },
          select: {
            status: true,
            submittedAt: true,
            marks: true,
            feedback: true,
            content: true,
            attachmentUrl: true,
          },
        },
      },
    }),
  ])

  const items: PortalTaskView[] = [
    ...homeworks.map((task) => ({
      id: task.id,
      kind: "HOMEWORK" as const,
      title: task.title,
      instructions: task.instructions,
      subjectName: task.subject.name,
      dueDate: dateOnly(task.dueDate),
      status: task.status,
      publishedAt: task.publishedAt ? task.publishedAt.toISOString() : null,
      submission:
        task.submissions[0] === undefined
          ? null
          : {
              status: task.submissions[0].status,
              submittedAt: task.submissions[0].submittedAt.toISOString(),
              marks: task.submissions[0].marks === null ? null : toMoney(task.submissions[0].marks),
              feedback: task.submissions[0].feedback,
              content: task.submissions[0].content,
              attachmentUrl: task.submissions[0].attachmentUrl,
            },
    })),
    ...assignments.map((task) => ({
      id: task.id,
      kind: "ASSIGNMENT" as const,
      title: task.title,
      instructions: task.instructions,
      subjectName: task.subject.name,
      dueDate: dateOnly(task.dueDate),
      status: task.status,
      publishedAt: task.publishedAt ? task.publishedAt.toISOString() : null,
      submission:
        task.submissions[0] === undefined
          ? null
          : {
              status: task.submissions[0].status,
              submittedAt: task.submissions[0].submittedAt.toISOString(),
              marks: task.submissions[0].marks === null ? null : toMoney(task.submissions[0].marks),
              feedback: task.submissions[0].feedback,
              content: task.submissions[0].content,
              attachmentUrl: task.submissions[0].attachmentUrl,
            },
    })),
  ].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))

  return {
    session,
    student: { id: student.id, name: studentName(student), admissionNumber: student.admissionNumber },
    items,
  }
}

export async function getTransport(
  auth: AuthUser,
  studentId: string,
  sessionId?: string,
): Promise<PortalTransportResult> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const student = await requireOwnedStudent(prisma, auth.school.id, owned, studentId)
  const session = await resolveSessionForStudent(prisma, auth.school.id, studentId, sessionId)

  const assignments = await prisma.transportAssignment.findMany({
    where: { schoolId: auth.school.id, studentId, academicSessionId: session.id, status: "ACTIVE" },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      direction: true,
      assignedAt: true,
      notes: true,
      route: { select: { name: true } },
      stop: { select: { name: true } },
    },
  })

  const views: PortalTransportAssignmentView[] = assignments.map((assignment) => ({
    id: assignment.id,
    direction: assignment.direction,
    routeName: assignment.route.name,
    stopName: assignment.stop.name,
    assignedAt: assignment.assignedAt.toISOString(),
    notes: assignment.notes,
  }))

  return {
    session,
    student: { id: student.id, name: studentName(student), admissionNumber: student.admissionNumber },
    assignments: views,
  }
}

export async function getLibraryLoans(auth: AuthUser, studentId: string): Promise<PortalLibraryResult> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const student = await requireOwnedStudent(prisma, auth.school.id, owned, studentId)

  const loans = await prisma.libraryLoan.findMany({
    where: { schoolId: auth.school.id, borrowerType: "STUDENT", borrowerId: studentId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      issuedAt: true,
      dueAt: true,
      returnedAt: true,
      copy: {
        select: {
          copyCode: true,
          book: { select: { title: true } },
        },
      },
    },
  })

  const today = new Date()
  const views: PortalLibraryLoanView[] = loans.map((loan) => ({
    id: loan.id,
    bookTitle: loan.copy.book.title,
    copyCode: loan.copy.copyCode,
    issuedAt: dateOnly(loan.issuedAt),
    dueAt: dateOnly(loan.dueAt),
    returnedAt: loan.returnedAt ? dateOnly(loan.returnedAt) : null,
    isOverdue: loan.returnedAt === null && loan.dueAt < today,
  }))

  return {
    student: { id: student.id, name: studentName(student), admissionNumber: student.admissionNumber },
    loans: views,
  }
}

export async function getNotices(auth: AuthUser, limit: number): Promise<PortalNoticesResult> {
  const prisma = await requirePrisma()
  const owned = await resolveOwnedStudentIds(prisma, auth.id, auth.school.id)
  const actorKind = owned.length > 0 && auth.roles.includes("STUDENT") ? "STUDENT" : "PARENT"
  const audiences: NoticeAudience[] =
    actorKind === "STUDENT" ? ["EVERYONE", "STUDENTS"] : ["EVERYONE", "PARENTS"]

  const notices = await prisma.notice.findMany({
    where: {
      schoolId: auth.school.id,
      status: "PUBLISHED",
      audience: { in: audiences },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      priority: true,
      publishedAt: true,
      createdAt: true,
    },
  })

  const views: PortalNoticeView[] = notices.map((notice) => ({
    id: notice.id,
    title: notice.title,
    body: notice.body,
    priority: notice.priority,
    publishedAt: notice.publishedAt ? notice.publishedAt.toISOString() : null,
    createdAt: notice.createdAt.toISOString(),
  }))

  return { notices: views }
}

// ────────────────────────────────────────────────────────────────────────────
// Admin-side profile link management (portal account provisioning).
// ────────────────────────────────────────────────────────────────────────────

function isAdminPortalOperator(auth: AuthUser): boolean {
  // Mirrors the route guard `requirePermission("portal:update")`: parents and
  // students (who hold only `portal:view`) can never reach link management even
  // if this service is invoked directly.
  return auth.permissions.includes("portal:update")
}

async function profileExists(
  prisma: DbClient,
  schoolId: string,
  profileType: "STUDENT" | "GUARDIAN",
  profileId: string,
): Promise<{ exists: boolean; name: string; userId: string | null; entityType: "STUDENT" | "GUARDIAN" }> {
  if (profileType === "STUDENT") {
    const student = await prisma.student.findFirst({
      where: { id: profileId, schoolId },
      select: { id: true, firstName: true, lastName: true, userId: true },
    })
    if (!student)
      return { exists: false, name: "", userId: null, entityType: "STUDENT" }
    return {
      exists: true,
      name: studentName(student),
      userId: student.userId,
      entityType: "STUDENT",
    }
  }
  const guardian = await prisma.guardian.findFirst({
    where: { id: profileId, schoolId },
    select: { id: true, name: true, userId: true },
  })
  if (!guardian) return { exists: false, name: "", userId: null, entityType: "GUARDIAN" }
  return { exists: true, name: guardian.name, userId: guardian.userId, entityType: "GUARDIAN" }
}

/** Verifies a user belongs to the school (ACTIVE membership or legacy link). */
async function userBelongsToSchool(
  prisma: DbClient,
  schoolId: string,
  userId: string,
): Promise<boolean> {
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, schoolId, status: "ACTIVE" },
    select: { id: true },
  })
  if (membership) return true
  const user = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    select: { id: true, status: true },
  })
  if (user && (user.status === "ACTIVE" || user.status === "INACTIVE")) return true
  return false
}

export interface CreateLinkInput {
  userId: string
  profileType: "STUDENT" | "GUARDIAN"
  profileId: string
}

export async function linkProfile(auth: AuthUser, input: CreateLinkInput) {
  if (!isAdminPortalOperator(auth)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to provision portal accounts")
  }
  const prisma = await requirePrisma()
  const profile = await profileExists(prisma, auth.school.id, input.profileType, input.profileId)
  if (!profile.exists) throw notFoundError("Profile not found")

  if (profile.userId) {
    if (profile.userId === input.userId) {
      throw badRequestError("This profile is already linked to that user")
    }
    throw badRequestError("This profile is already linked to another account")
  }

  if (!(await userBelongsToSchool(prisma, auth.school.id, input.userId))) {
    throw badRequestError("The user must belong to this school to be linked")
  }

  await prisma.$transaction(async (tx) => {
    if (input.profileType === "STUDENT") {
      await tx.student.update({
        where: { id: input.profileId },
        data: { userId: input.userId },
      })
    } else {
      await tx.guardian.update({
        where: { id: input.profileId },
        data: { userId: input.userId },
      })
    }

    const actor = await resolveAuditActor(tx, auth.school.id, auth)
    await recordAudit(tx, {
      schoolId: auth.school.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: "UPDATE",
      entityType: profile.entityType,
      entityId: input.profileId,
      summary: `Linked ${input.profileType.toLowerCase()} profile "${profile.name}" to a portal account`,
      metadata: { profileId: input.profileId, profileType: input.profileType, userId: input.userId },
      diff: { fields: [{ field: "userId", before: null, after: input.userId }] },
    })
  })

  return { linked: true, profileType: input.profileType, profileId: input.profileId, userId: input.userId }
}

export interface DeleteLinkInput {
  userId: string
  profileType: "STUDENT" | "GUARDIAN"
  profileId: string
}

export async function unlinkProfile(auth: AuthUser, input: DeleteLinkInput) {
  if (!isAdminPortalOperator(auth)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to provision portal accounts")
  }
  const prisma = await requirePrisma()
  const profile = await profileExists(prisma, auth.school.id, input.profileType, input.profileId)
  if (!profile.exists) throw notFoundError("Profile not found")
  if (profile.userId !== input.userId) {
    throw badRequestError("That profile is not linked to the given user")
  }

  await prisma.$transaction(async (tx) => {
    if (input.profileType === "STUDENT") {
      await tx.student.update({ where: { id: input.profileId }, data: { userId: null } })
    } else {
      await tx.guardian.update({ where: { id: input.profileId }, data: { userId: null } })
    }

    const actor = await resolveAuditActor(tx, auth.school.id, auth)
    await recordAudit(tx, {
      schoolId: auth.school.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: "UPDATE",
      entityType: profile.entityType,
      entityId: input.profileId,
      summary: `Unlinked portal account from ${input.profileType.toLowerCase()} profile "${profile.name}"`,
      metadata: { profileId: input.profileId, profileType: input.profileType, userId: input.userId },
      diff: { fields: [{ field: "userId", before: input.userId, after: null }] },
    })
  })

  return { linked: false, profileType: input.profileType, profileId: input.profileId, userId: input.userId }
}

export async function listLinks(auth: AuthUser): Promise<PortalLinksResult> {
  const prisma = await requirePrisma()
  const [studentLinks, guardianLinks] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId: auth.school.id, userId: { not: null } },
      orderBy: { firstName: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.guardian.findMany({
      where: { schoolId: auth.school.id, userId: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, userId: true, user: { select: { name: true, email: true } } },
    }),
  ])

  const toLink = (
    row: { id: string; userId: string | null; user: { name: string; email: string } | null },
    profileType: "STUDENT" | "GUARDIAN",
    profileName: string,
  ): PortalLink => ({
    id: row.id,
    profileType,
    profileId: row.id,
    profileName,
    userId: row.userId,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
  })

  return {
    studentLinks: studentLinks.map((row) =>
      toLink(row, "STUDENT", studentName(row)),
    ),
    guardianLinks: guardianLinks.map((row) =>
      toLink(row, "GUARDIAN", row.name),
    ),
  }
}

export async function getLinkCandidates(auth: AuthUser): Promise<PortalLinkCandidatesResult> {
  const prisma = await requirePrisma()
  const [students, guardians, users] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId: auth.school.id, userId: null },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true },
    }),
    prisma.guardian.findMany({
      where: { schoolId: auth.school.id, userId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Users not already bound to a student/guardian profile. Any user (admin,
    // teacher, parent portal account) can be granted portal access via a link.
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        studentProfile: { is: null },
        guardianProfile: { is: null },
        OR: [{ schoolId: auth.school.id }, { memberships: { some: { schoolId: auth.school.id } } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ])

  return {
    students: students.map((student) => ({
      id: student.id,
      name: studentName(student),
      email: null,
      code: student.admissionNumber,
    })),
    guardians: guardians.map((guardian) => ({
      id: guardian.id,
      name: guardian.name,
      email: null,
      code: null,
    })),
    users: users.map((user) => ({ id: user.id, name: user.name, email: user.email, code: null })),
  }
}