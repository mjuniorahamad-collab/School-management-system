import type { AttendanceStatus, Prisma, PrismaClient } from "@prisma/client"
import { getPrisma } from "../../lib/database.js"
import { notFoundError, badRequestError } from "../../lib/ApiError.js"
import { roundMoney, toMoney } from "../../lib/money.js"
import { computeClassRanking } from "../dashboard/dashboard.rules.js"
import {
  deriveInvoiceStatus,
  parseDateISO,
  toDateISO,
  todayISODate,
} from "../fee-invoices/fee-invoice.rules.js"
import { ratioPercent, summarizeAttendanceCounts, monthKeyOf } from "./report.rules.js"
import {
  paymentRegisterToCsv,
  reportFileName,
  reportToCsv,
  studentRosterToCsv,
} from "./report.csv.js"
import type { ReportKey } from "./report.keys.js"
import { getReportDefinition } from "./report.catalog.js"
import type { AuthUser } from "../../types/auth.js"
import {
  recordAuditAfterCommit,
  resolveAuditActor,
} from "../audit-logs/audit-log.service.js"
import type {
  AcademicPerformanceItem,
  AcademicPerformanceReport,
  AdmissionsMonthlyBucket,
  AdmissionsSummaryReport,
  AttendanceSummaryReport,
  FeeCollectionReport,
  PaymentRegisterItem,
  PaymentRegisterReport,
  ReportData,
  ReportExamOption,
  ReportRosterItem,
  StudentRosterReport,
} from "./report.types.js"
import type {
  AcademicPerformanceQuery,
  AdmissionsSummaryQuery,
  AttendanceSummaryQuery,
  ExamOptionsQuery,
  FeeCollectionQuery,
  PaymentRegisterQuery,
  StudentRosterQuery,
} from "./report.schema.js"

// Export row cap for windowed reports (roster, payment register). The JSON view
// is paginated; a CSV export reads up to this many rows for offline analysis.
const EXPORT_LIMIT = 10_000

type Db = PrismaClient
type DbClient = Db | Prisma.TransactionClient

async function requirePrisma(): Promise<Db> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function buildFullName(firstName: string, middleName: string | null, lastName: string | null): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ")
}

async function requireSession(
  prisma: DbClient,
  schoolId: string,
  sessionId: string,
): Promise<{ id: string; name: string; startDate: Date; endDate: Date }> {
  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, schoolId },
    select: { id: true, name: true, startDate: true, endDate: true },
  })
  if (!session) throw notFoundError("Academic session not found for this school")
  return session
}

interface QueryWindow {
  skip: number
  take: number
}

interface RosterData {
  session: { id: string; name: string }
  items: ReportRosterItem[]
  total: number
  classBreakdown: { classId: string; className: string; count: number }[]
}

// ─── Student Roster ─────────────────────────────────────────────────────────

async function fetchStudentRoster(
  prisma: Db,
  schoolId: string,
  query: StudentRosterQuery,
  window: QueryWindow,
): Promise<RosterData> {
  const session = await requireSession(prisma, schoolId, query.sessionId)
  const searchFilter = query.search
    ? {
        OR: [
          { firstName: { contains: query.search, mode: "insensitive" as const } },
          { middleName: { contains: query.search, mode: "insensitive" as const } },
          { lastName: { contains: query.search, mode: "insensitive" as const } },
          { admissionNumber: { contains: query.search, mode: "insensitive" as const } },
        ],
      }
    : undefined

  const where = {
    academicSessionId: session.id,
    classId: query.classId,
    sectionId: query.sectionId,
    student: searchFilter,
  }

  const [rows, total] = await prisma.$transaction([
    prisma.studentEnrollment.findMany({
      where,
      select: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
            gender: true,
            status: true,
            email: true,
            phone: true,
            city: true,
            state: true,
            admissionDate: true,
          },
        },
        class: { select: { id: true, name: true, sortOrder: true } },
        section: { select: { id: true, name: true } },
      },
      orderBy: [
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
        { student: { admissionNumber: "asc" } },
      ],
      skip: window.skip,
      take: window.take,
    }),
    prisma.studentEnrollment.count({ where }),
  ])

  const items: ReportRosterItem[] = rows.map((row) => ({
    studentId: row.student.id,
    admissionNumber: row.student.admissionNumber,
    name: buildFullName(row.student.firstName, row.student.middleName, row.student.lastName),
    classId: row.class.id,
    className: row.class.name,
    sectionId: row.section?.id ?? null,
    sectionName: row.section?.name ?? null,
    gender: row.student.gender,
    status: row.student.status,
    email: row.student.email,
    phone: row.student.phone,
    city: row.student.city,
    state: row.student.state,
    admissionDate: toDateISO(row.student.admissionDate),
  }))

  const classCounts = await prisma.studentEnrollment.groupBy({
    by: ["classId"],
    where,
    _count: { id: true },
  })
  const classIds = [...new Set(classCounts.map((entry) => entry.classId))]
  const classes = classIds.length
    ? await prisma.class.findMany({
        where: { schoolId, id: { in: classIds } },
        select: { id: true, name: true, sortOrder: true },
      })
    : []
  const classById = new Map(classes.map((entry) => [entry.id, entry]))
  const classBreakdown = classCounts
    .map((entry) => ({
      classId: entry.classId,
      className: classById.get(entry.classId)?.name ?? entry.classId,
      count: entry._count.id,
    }))
    .sort((a, b) => {
      const order =
        (classById.get(a.classId)?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (classById.get(b.classId)?.sortOrder ?? Number.MAX_SAFE_INTEGER)
      return order || a.className.localeCompare(b.className)
    })

  return { session: { id: session.id, name: session.name }, items, total, classBreakdown }
}

async function runStudentRoster(prisma: Db, schoolId: string, query: StudentRosterQuery): Promise<StudentRosterReport> {
  const pageSize = query.pageSize
  const data = await fetchStudentRoster(prisma, schoolId, query, {
    skip: (query.page - 1) * pageSize,
    take: pageSize,
  })
  return {
    session: data.session,
    summary: { total: data.total, classBreakdown: data.classBreakdown },
    items: data.items,
    pagination: {
      page: query.page,
      pageSize,
      total: data.total,
      totalPages: Math.max(1, Math.ceil(data.total / pageSize)),
    },
  }
}

// ─── Admissions Summary ─────────────────────────────────────────────────────

async function runAdmissionsSummary(
  prisma: Db,
  schoolId: string,
  query: AdmissionsSummaryQuery,
): Promise<AdmissionsSummaryReport> {
  const where = {
    schoolId,
    createdAt: {
      gte: new Date(`${query.from}T00:00:00.000Z`),
      lte: new Date(`${query.to}T23:59:59.999Z`),
    },
    status: query.status,
  }
  const rows = await prisma.admissionApplication.findMany({
    where,
    select: { createdAt: true, status: true },
    orderBy: { createdAt: "asc" },
  })

  const statusCounts: Record<string, number> = {}
  const monthMap = new Map<string, AdmissionsMonthlyBucket>()
  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
    const month = monthKeyOf(row.createdAt)
    const bucket = monthMap.get(month)
    if (bucket) {
      bucket.total += 1
      bucket.statusCounts[row.status] = (bucket.statusCounts[row.status] ?? 0) + 1
    } else {
      monthMap.set(month, { month, total: 1, statusCounts: { [row.status]: 1 } })
    }
  }

  const total = rows.length
  const converted = statusCounts.CONVERTED ?? 0
  return {
    summary: {
      from: query.from,
      to: query.to,
      total,
      converted,
      conversionRate: ratioPercent(converted, total),
      statusCounts,
    },
    items: [...monthMap.values()],
  }
}

// ─── Attendance Summary ─────────────────────────────────────────────────────

type AttendanceCountRow = { status: AttendanceStatus; _count: { id: number } }

function attendanceCountMap(rows: readonly AttendanceCountRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.status] = row._count.id
  return counts
}

async function runAttendanceSummary(
  prisma: Db,
  schoolId: string,
  query: AttendanceSummaryQuery,
): Promise<AttendanceSummaryReport> {
  const session = await requireSession(prisma, schoolId, query.sessionId)
  const from = query.from ? parseDateISO(query.from) : session.startDate
  const to = query.to ? parseDateISO(query.to) : session.endDate
  const where = {
    schoolId,
    academicSessionId: session.id,
    date: { gte: from, lte: to },
    classId: query.classId,
    sectionId: query.sectionId,
  }

  const overall = await prisma.attendanceRecord.groupBy({
    by: ["status"],
    where,
    _count: { id: true },
  })
  const classGroups = await prisma.attendanceRecord.groupBy({
    by: ["classId", "sectionId", "status"],
    where,
    _count: { id: true },
  })
  const dailyGroups = await prisma.attendanceRecord.groupBy({
    by: ["date", "status"],
    where,
    _count: { id: true },
  })

  const classIds = [...new Set(classGroups.map((entry) => entry.classId))]
  const sectionIds = [
    ...new Set(classGroups.map((entry) => entry.sectionId).filter((id): id is string => Boolean(id))),
  ]
  const classes = classIds.length
    ? await prisma.class.findMany({ where: { schoolId, id: { in: classIds } }, select: { id: true, name: true, sortOrder: true } })
    : []
  const sections = sectionIds.length
    ? await prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } })
    : []
  const classById = new Map(classes.map((entry) => [entry.id, entry]))
  const sectionById = new Map(sections.map((entry) => [entry.id, entry]))

  const classTotals = new Map<string, Record<string, number>>()
  for (const group of classGroups) {
    const key = `${group.classId}|${group.sectionId ?? ""}`
    const counts = classTotals.get(key) ?? {}
    counts[group.status] = group._count.id
    classTotals.set(key, counts)
  }
  const classRows = [...classTotals.entries()]
    .map(([key, counts]) => {
      const [classId, sectionId] = key.split("|")
      return {
        classId,
        className: classById.get(classId)?.name ?? classId,
        sectionId: sectionId || null,
        sectionName: sectionId ? sectionById.get(sectionId)?.name ?? null : null,
        ...summarizeAttendanceCounts(counts),
      }
    })
    .sort((a, b) => {
      const order =
        (classById.get(a.classId)?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (classById.get(b.classId)?.sortOrder ?? Number.MAX_SAFE_INTEGER)
      return (
        order ||
        a.className.localeCompare(b.className) ||
        (a.sectionName ?? "").localeCompare(b.sectionName ?? "")
      )
    })

  const dailyMap = new Map<string, Record<string, number>>()
  for (const group of dailyGroups) {
    const dateISO = toDateISO(group.date)
    const counts = dailyMap.get(dateISO) ?? {}
    counts[group.status] = group._count.id
    dailyMap.set(dateISO, counts)
  }
  const daily = [...dailyMap.entries()]
    .map(([date, counts]) => ({ date, ...summarizeAttendanceCounts(counts) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    session: { id: session.id, name: session.name },
    from: toDateISO(from),
    to: toDateISO(to),
    summary: summarizeAttendanceCounts(attendanceCountMap(overall)),
    classes: classRows,
    daily,
  }
}

// ─── Academic Performance ───────────────────────────────────────────────────

async function runAcademicPerformance(
  prisma: Db,
  schoolId: string,
  query: AcademicPerformanceQuery,
): Promise<AcademicPerformanceReport> {
  const session = await requireSession(prisma, schoolId, query.sessionId)
  const exam = await prisma.exam.findFirst({
    where: { id: query.examId, schoolId },
    select: {
      id: true,
      academicSessionId: true,
      name: true,
      status: true,
      publishedAt: true,
      finalizedAt: true,
      examType: { select: { name: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  })
  if (!exam) throw notFoundError("Exam not found for this school")
  if (exam.academicSessionId !== session.id) {
    throw badRequestError("Exam does not belong to the selected session")
  }
  if (exam.status !== "PUBLISHED" && exam.status !== "FINAL") {
    throw badRequestError("This exam has not been published yet")
  }

  const results = await prisma.examResult.findMany({
    where: {
      schoolId,
      examId: exam.id,
      ...(query.classId ? { enrollment: { classId: query.classId } } : {}),
    },
    select: {
      totalObtained: true,
      totalMaxMarks: true,
      totalPercentage: true,
      grade: true,
      isPass: true,
      rank: true,
      isComplete: true,
      student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } },
      enrollment: { select: { class: { select: { name: true } }, section: { select: { name: true } } } },
    },
    orderBy: [
      { rank: "asc" },
      { student: { lastName: "asc" } },
      { student: { firstName: "asc" } },
      { student: { admissionNumber: "asc" } },
    ],
  })

  const items: AcademicPerformanceItem[] = results.map((row) => ({
    studentId: row.student.id,
    admissionNumber: row.student.admissionNumber,
    studentName: buildFullName(row.student.firstName, row.student.middleName, row.student.lastName),
    className: row.enrollment.class.name,
    sectionName: row.enrollment.section?.name ?? null,
    rank: row.rank,
    totalObtained: row.totalObtained === null ? null : toMoney(row.totalObtained),
    totalMaxMarks: row.totalMaxMarks === null ? null : toMoney(row.totalMaxMarks),
    totalPercentage: row.totalPercentage === null ? null : toMoney(row.totalPercentage),
    grade: row.grade,
    isPass: row.isPass,
  }))

  const withPercentage = results.filter((row) => row.totalPercentage !== null)
  const percentageValues = withPercentage.map((row) => toMoney(row.totalPercentage))
  const averagePercentage =
    percentageValues.length === 0
      ? null
      : Math.round((percentageValues.reduce((sum, value) => sum + value, 0) / percentageValues.length) * 100) / 100

  const examined = results.filter((row) => row.isPass !== null)
  const passCount = results.filter((row) => row.isPass === true).length

  const subjects = await prisma.examSubject.findMany({
    where: { examId: exam.id },
    select: {
      id: true,
      maxMarks: true,
      passMarks: true,
      sortOrder: true,
      subject: { select: { name: true, code: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { subject: { name: "asc" } }],
  })
  const markInfo = new Map<string, { attempted: number; percentageTotal: number; percentageCount: number }>()
  for (const subject of subjects) markInfo.set(subject.id, { attempted: 0, percentageTotal: 0, percentageCount: 0 })

  const markGroups = await prisma.examMark.groupBy({
    by: ["examSubjectId"],
    where: { schoolId, examResult: { examId: exam.id } },
    _count: { id: true },
    _avg: { percentage: true },
  })
  for (const group of markGroups) {
    const info = markInfo.get(group.examSubjectId)
    if (!info) continue
    info.attempted = group._count.id
    if (group._avg.percentage !== null) {
      info.percentageTotal += toMoney(group._avg.percentage)
      info.percentageCount += 1
    }
  }
  const subjectSummaries = subjects.map((subject) => {
    const info = markInfo.get(subject.id)
    return {
      examSubjectId: subject.id,
      subjectName: subject.subject.name,
      subjectCode: subject.subject.code,
      maxMarks: toMoney(subject.maxMarks),
      passMarks: toMoney(subject.passMarks),
      attemptedMarks: info?.attempted ?? 0,
      averagePercentage:
        info && info.percentageCount > 0
          ? Math.round((info.percentageTotal / info.percentageCount) * 100) / 100
          : null,
    }
  })

  const classRanking = computeClassRanking(
    withPercentage.map((row) => ({
      className: row.enrollment.class.name,
      percentage: toMoney(row.totalPercentage),
    })),
  )

  return {
    exam: {
      id: exam.id,
      name: exam.name,
      status: exam.status,
      examTypeName: exam.examType.name,
      className: exam.class.name,
      sectionName: exam.section?.name ?? null,
      publishedAt: exam.publishedAt ? toDateISO(exam.publishedAt) : null,
      finalizedAt: exam.finalizedAt ? toDateISO(exam.finalizedAt) : null,
    },
    summary: {
      students: results.length,
      completeStudents: results.filter((row) => row.isComplete).length,
      averagePercentage,
      passCount,
      passRate: examined.length === 0 ? null : ratioPercent(passCount, examined.length),
      subjects: subjectSummaries,
    },
    classes: classRanking.map((entry) => ({
      rank: entry.rank,
      className: entry.name,
      performance: entry.performance,
      students: entry.students,
    })),
    items,
  }
}

// ─── Fee Collection & Outstanding ───────────────────────────────────────────

async function runFeeCollection(prisma: Db, schoolId: string, query: FeeCollectionQuery): Promise<FeeCollectionReport> {
  const session = await requireSession(prisma, schoolId, query.sessionId)
  const invoices = await prisma.feeInvoice.findMany({
    where: { schoolId, sessionId: session.id, enrollment: query.classId ? { classId: query.classId } : undefined },
    select: {
      id: true,
      invoiceNumber: true,
      sessionName: true,
      totalAmount: true,
      amountPaid: true,
      balance: true,
      student: { select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true } },
      enrollment: {
        select: {
          class: { select: { id: true, name: true, sortOrder: true } },
          section: { select: { name: true } },
        },
      },
      installments: { select: { amountPaid: true, balance: true, dueDate: true } },
    },
  })

  const todayISO = todayISODate()
  const rows = invoices
    .map((invoice) => {
      const installments = invoice.installments.map((installment) => ({
        amountPaid: toMoney(installment.amountPaid),
        balance: toMoney(installment.balance),
        dueDateISO: toDateISO(installment.dueDate),
      }))
      const nextDueDate =
        installments
          .filter((installment) => installment.balance > 0)
          .sort((a, b) => a.dueDateISO.localeCompare(b.dueDateISO))[0]?.dueDateISO ?? null
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        studentId: invoice.student.id,
        studentName: buildFullName(invoice.student.firstName, invoice.student.middleName, invoice.student.lastName),
        admissionNumber: invoice.student.admissionNumber,
        className: invoice.enrollment.class.name,
        sectionName: invoice.enrollment.section?.name ?? null,
        sessionName: invoice.sessionName,
        totalAmount: toMoney(invoice.totalAmount),
        amountPaid: toMoney(invoice.amountPaid),
        balance: toMoney(invoice.balance),
        classSortOrder: invoice.enrollment.class.sortOrder,
        status: deriveInvoiceStatus(installments, todayISO),
        nextDueDate,
      }
    })
    .filter((row) => (query.status ? row.status === query.status : true))
    .sort((a, b) => {
      const order = a.classSortOrder - b.classSortOrder
      return (
        order ||
        a.className.localeCompare(b.className) ||
        a.studentName.localeCompare(b.studentName) ||
        a.admissionNumber.localeCompare(b.admissionNumber)
      )
    })

  const items: FeeCollectionReport["items"] = rows.map((row) => ({
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    studentId: row.studentId,
    studentName: row.studentName,
    admissionNumber: row.admissionNumber,
    className: row.className,
    sectionName: row.sectionName,
    sessionName: row.sessionName,
    totalAmount: row.totalAmount,
    amountPaid: row.amountPaid,
    balance: row.balance,
    status: row.status,
    nextDueDate: row.nextDueDate,
  }))

  return {
    session: { id: session.id, name: session.name },
    summary: {
      invoiceCount: rows.length,
      invoiced: roundMoney(rows.reduce((sum, row) => sum + row.totalAmount, 0)),
      collected: roundMoney(rows.reduce((sum, row) => sum + row.amountPaid, 0)),
      outstanding: roundMoney(rows.reduce((sum, row) => sum + row.balance, 0)),
      collectionRate: ratioPercent(
        roundMoney(rows.reduce((sum, row) => sum + row.amountPaid, 0)),
        roundMoney(rows.reduce((sum, row) => sum + row.totalAmount, 0)),
      ),
    },
    items,
  }
}

// ─── Payment & Receipt Register ─────────────────────────────────────────────

interface RegisterData {
  items: PaymentRegisterItem[]
  total: number
  summary: { from: string; to: string; count: number; totalAmount: number; methodCounts: Record<string, number> }
}

async function fetchPaymentRegister(
  prisma: Db,
  schoolId: string,
  query: PaymentRegisterQuery,
  window: QueryWindow,
): Promise<RegisterData> {
  const where = {
    schoolId,
    paymentDate: { gte: parseDateISO(query.from), lte: parseDateISO(query.to) },
    method: query.method,
  }
  const [rows, count] = await prisma.$transaction([
    prisma.feeReceipt.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { receiptNumber: "asc" }],
      skip: window.skip,
      take: window.take,
    }),
    prisma.feeReceipt.count({ where }),
  ])
  const methodCountsRows = await prisma.feeReceipt.groupBy({ by: ["method"], where, _count: { id: true } })
  const sums = await prisma.feeReceipt.aggregate({ where, _sum: { amount: true } })

  const methodCounts: Record<string, number> = {}
  for (const entry of methodCountsRows) methodCounts[entry.method] = entry._count.id

  return {
    summary: {
      from: query.from,
      to: query.to,
      count,
      totalAmount: roundMoney(toMoney(sums._sum.amount ?? 0)),
      methodCounts,
    },
    total: count,
    items: rows.map((row) => ({
      receiptId: row.id,
      receiptNumber: row.receiptNumber,
      paymentDate: toDateISO(row.paymentDate),
      studentName: row.studentName,
      admissionNumber: row.admissionNumber,
      invoiceNumber: row.invoiceNumber,
      className: row.className,
      sectionName: row.sectionName,
      sessionName: row.sessionName,
      method: row.method,
      amount: toMoney(row.amount),
      balanceAfter: toMoney(row.balanceAfter),
      transactionRef: row.transactionRef,
    })),
  }
}

async function runPaymentRegister(
  prisma: Db,
  schoolId: string,
  query: PaymentRegisterQuery,
): Promise<PaymentRegisterReport> {
  const pageSize = query.pageSize
  const data = await fetchPaymentRegister(prisma, schoolId, query, {
    skip: (query.page - 1) * pageSize,
    take: pageSize,
  })
  return {
    summary: data.summary,
    items: data.items,
    pagination: {
      page: query.page,
      pageSize,
      total: data.total,
      totalPages: Math.max(1, Math.ceil(data.total / pageSize)),
    },
  }
}

// ─── Exam options ───────────────────────────────────────────────────────────

async function listReportExamOptionsCore(
  prisma: Db,
  schoolId: string,
  query: ExamOptionsQuery,
): Promise<ReportExamOption[]> {
  const session = await requireSession(prisma, schoolId, query.sessionId)
  const exams = await prisma.exam.findMany({
    where: { schoolId, academicSessionId: session.id, status: { in: ["PUBLISHED", "FINAL"] } },
    select: {
      id: true,
      name: true,
      status: true,
      publishedAt: true,
      finalizedAt: true,
      examType: { select: { name: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
      _count: { select: { subjects: true } },
    },
    orderBy: [{ finalizedAt: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }, { name: "asc" }],
  })
  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    status: exam.status,
    examTypeName: exam.examType.name,
    className: exam.class.name,
    sectionName: exam.section?.name ?? null,
    subjectCount: exam._count.subjects,
    publishedAt: exam.publishedAt ? toDateISO(exam.publishedAt) : null,
    finalizedAt: exam.finalizedAt ? toDateISO(exam.finalizedAt) : null,
  }))
}

export async function listReportExamOptions(query: ExamOptionsQuery, schoolId: string): Promise<ReportExamOption[]> {
  const prisma = await requirePrisma()
  return listReportExamOptionsCore(prisma, schoolId, query)
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function runReport(key: ReportKey, query: unknown, schoolId: string): Promise<ReportData> {
  const prisma = await requirePrisma()
  switch (key) {
    case "student-roster":
      return runStudentRoster(prisma, schoolId, query as StudentRosterQuery)
    case "admissions-summary":
      return runAdmissionsSummary(prisma, schoolId, query as AdmissionsSummaryQuery)
    case "attendance-summary":
      return runAttendanceSummary(prisma, schoolId, query as AttendanceSummaryQuery)
    case "academic-performance":
      return runAcademicPerformance(prisma, schoolId, query as AcademicPerformanceQuery)
    case "fee-collection":
      return runFeeCollection(prisma, schoolId, query as FeeCollectionQuery)
    case "payment-register":
      return runPaymentRegister(prisma, schoolId, query as PaymentRegisterQuery)
  }
}

// ─── Export ─────────────────────────────────────────────────────────────────

export interface ReportExportResult {
  fileName: string
  csv: string
  rowCount: number
}

export async function exportReport(
  key: ReportKey,
  query: unknown,
  schoolId: string,
  actor: AuthUser,
): Promise<ReportExportResult> {
  const prisma = await requirePrisma()
  let csv: string
  let rowCount = 0

  switch (key) {
    case "student-roster": {
      const data = await fetchStudentRoster(prisma, schoolId, query as StudentRosterQuery, {
        skip: 0,
        take: EXPORT_LIMIT,
      })
      csv = studentRosterToCsv(data.items)
      rowCount = data.total
      break
    }
    case "payment-register": {
      const data = await fetchPaymentRegister(prisma, schoolId, query as PaymentRegisterQuery, {
        skip: 0,
        take: EXPORT_LIMIT,
      })
      csv = paymentRegisterToCsv(data.items)
      rowCount = data.total
      break
    }
    default: {
      const data = await runReport(key, query, schoolId)
      csv = reportToCsv(key, data)
      if (key === "admissions-summary") {
        rowCount = (data as AdmissionsSummaryReport).summary.total
      } else if (key === "attendance-summary") {
        rowCount = (data as AttendanceSummaryReport).summary.total
      } else {
        rowCount = (data as AcademicPerformanceReport | FeeCollectionReport).items.length
      }
      break
    }
  }

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  await recordAuditAfterCommit({
    schoolId,
    actorId: auditActor.id,
    actorName: auditActor.name,
    actorRole: auditActor.role,
    actorEmail: auditActor.email,
    action: "EXPORT",
    entityType: "REPORT",
    entityId: null,
    summary: `Exported the "${getReportDefinition(key)?.title ?? key}" report`,
    metadata: { reportKey: key, rowCount, query },
  })

  return { fileName: reportFileName(key, todayISODate()), csv, rowCount }
}