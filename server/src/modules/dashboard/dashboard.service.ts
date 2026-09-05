import { getPrisma } from "../../lib/database.js"
import { toMoney } from "../../lib/money.js"
import {
  computeClassRanking,
  selectBestExamContext,
  trendPercent,
  type ClassPerformanceInput,
  type ExamContext,
} from "./dashboard.rules.js"
import type { AttendancePeriod, FeePeriod } from "./dashboard.schema.js"
import type {
  DashboardActivityItem,
  DashboardAttendanceResult,
  DashboardBirthdayStudentItem,
  DashboardFeeAnalyticsResult,
  DashboardFeeCollectionStatusResult,
  DashboardNoticeItem,
  DashboardRecentStudentItem,
  DashboardStatsResult,
  DashboardTopClassesResult,
  DashboardUpcomingEventItem,
} from "./dashboard.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d
}

function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function periodDateRange(period: AttendancePeriod, now: Date): { from: Date; to: Date } {
  const today = startOfDay(now)
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (period === "today") return { from: today, to: endOfToday }
  if (period === "week") return { from: startOfWeek(now), to: endOfToday }
  return { from: startOfMonth(now), to: endOfToday }
}

function feePeriodDateRange(period: FeePeriod, now: Date): { from: Date; to: Date } {
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (period === "month") return { from: startOfMonth(now), to: endOfToday }
  if (period === "year") {
    const yearStart = new Date(now.getFullYear(), 0, 1)
    yearStart.setHours(0, 0, 0, 0)
    return { from: yearStart, to: endOfToday }
  }
  return { from: startOfMonth(now), to: endOfToday }
}

async function getActiveSessionId(prisma: PrismaClient, schoolId: string): Promise<string | null> {
  const session = await prisma.academicSession.findFirst({
    where: { schoolId, status: "ACTIVE" },
    select: { id: true },
  })
  return session?.id ?? null
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export async function getStats(schoolId: string): Promise<DashboardStatsResult> {
  const prisma = await requirePrisma()
  const now = new Date()
  const currentMonthStart = startOfMonth(now)
  const priorMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const sessionId = await getActiveSessionId(prisma, schoolId)

  const [
    totalStudents,
    newStudentsThisMonth,
    newStudentsLastMonth,
    totalTeachers,
    newTeachersThisMonth,
    newTeachersLastMonth,
    totalClasses,
    newClassesThisMonth,
    newClassesLastMonth,
    collectedThisMonth,
    collectedLastMonth,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.student.count({
      where: { schoolId, status: "ACTIVE", createdAt: { gte: currentMonthStart } },
    }),
    prisma.student.count({
      where: {
        schoolId,
        status: "ACTIVE",
        createdAt: { gte: priorMonthStart, lt: currentMonthStart },
      },
    }),
    prisma.teacher.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.teacher.count({
      where: { schoolId, status: "ACTIVE", createdAt: { gte: currentMonthStart } },
    }),
    prisma.teacher.count({
      where: {
        schoolId,
        status: "ACTIVE",
        createdAt: { gte: priorMonthStart, lt: currentMonthStart },
      },
    }),
    prisma.class.count({ where: { schoolId } }),
    prisma.class.count({
      where: { schoolId, createdAt: { gte: currentMonthStart } },
    }),
    prisma.class.count({
      where: { schoolId, createdAt: { gte: priorMonthStart, lt: currentMonthStart } },
    }),
    prisma.feePayment.aggregate({
      where: { schoolId, paymentDate: { gte: currentMonthStart } },
      _sum: { amount: true },
    }),
    prisma.feePayment.aggregate({
      where: {
        schoolId,
        paymentDate: { gte: priorMonthStart, lt: currentMonthStart },
      },
      _sum: { amount: true },
    }),
  ])

  let sessionCollected = 0
  if (sessionId) {
    const result = await prisma.feePayment.aggregate({
      where: {
        schoolId,
        invoice: { sessionId },
      },
      _sum: { amount: true },
    })
    sessionCollected = toMoney(result._sum.amount ?? 0)
  }

  return {
    stats: [
      {
        id: "total-students",
        label: "Total Students",
        value: totalStudents.toLocaleString(),
        trendPercent: trendPercent(newStudentsThisMonth, newStudentsLastMonth),
        comparison: "vs last month",
      },
      {
        id: "total-teachers",
        label: "Total Teachers",
        value: totalTeachers.toLocaleString(),
        trendPercent: trendPercent(newTeachersThisMonth, newTeachersLastMonth),
        comparison: "vs last month",
      },
      {
        id: "total-classes",
        label: "Total Classes",
        value: totalClasses.toLocaleString(),
        trendPercent: trendPercent(newClassesThisMonth, newClassesLastMonth),
        comparison: "vs last month",
      },
      {
        id: "fees-collection",
        label: "Fees Collection",
        value: `₹${sessionCollected.toLocaleString("en-IN")}`,
        trendPercent: trendPercent(
          toMoney(collectedThisMonth._sum.amount ?? 0),
          toMoney(collectedLastMonth._sum.amount ?? 0),
        ),
        comparison: "vs last session",
      },
    ],
  }
}

// ─── Attendance ────────────────────────────────────────────────────────────

export async function getAttendance(
  schoolId: string,
  period: AttendancePeriod,
): Promise<DashboardAttendanceResult> {
  const prisma = await requirePrisma()
  const { from, to } = periodDateRange(period, new Date())

  const grouped = await prisma.attendanceRecord.groupBy({
    by: ["status"],
    where: {
      schoolId,
      date: { gte: from, lte: to },
    },
    _count: { id: true },
  })

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count.id]))
  const present = (counts["PRESENT"] ?? 0) + (counts["LATE"] ?? 0)
  const late = counts["LATE"] ?? 0
  const absent = counts["ABSENT"] ?? 0
  const total = present + absent

  return {
    total,
    present,
    late,
    absent,
    average: total > 0 ? Math.round((present / total) * 100) : 0,
  }
}

// ─── Fee Analytics ─────────────────────────────────────────────────────────

function monthLabel(date: Date, period: FeePeriod): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  if (period === "month") {
    const weekNum = Math.ceil(date.getDate() / 7)
    return `Wk ${weekNum}`
  }
  return months[date.getMonth()]
}

export async function getFeeAnalytics(
  schoolId: string,
  period: FeePeriod,
): Promise<DashboardFeeAnalyticsResult> {
  const prisma = await requirePrisma()
  const now = new Date()
  const { from, to } = feePeriodDateRange(period, now)

  const payments = await prisma.feePayment.findMany({
    where: {
      schoolId,
      paymentDate: { gte: from, lte: to },
    },
    select: { amount: true, paymentDate: true },
    orderBy: { paymentDate: "asc" },
  })

  const bucketMap = new Map<string, number>()
  for (const p of payments) {
    const key = monthLabel(p.paymentDate, period)
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + toMoney(p.amount))
  }

  let monthCount: number
  if (period === "month") {
    monthCount = 6
  } else if (period === "year") {
    monthCount = 12
  } else {
    monthCount = 6
  }

  const months: DashboardFeeAnalyticsResult["months"] = []
  for (let i = 0; i < monthCount; i++) {
    let label: string
    if (period === "month") {
      label = `Wk ${i + 1}`
    } else if (period === "year") {
      const m = new Date(now.getFullYear(), now.getMonth() - monthCount + 1 + i, 1)
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ]
      label = monthNames[m.getMonth()]
    } else {
      const m = new Date(now.getFullYear(), now.getMonth() - monthCount + 1 + i, 1)
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ]
      label = monthNames[m.getMonth()]
    }
    months.push({ label, collected: bucketMap.get(label) ?? 0 })
  }

  const totalCollected = months.reduce((sum, m) => sum + m.collected, 0)

  let trendPercentValue = 0
  let comparison = "vs prior period"

  if (period === "month") {
    const priorMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const priorPayments = await prisma.feePayment.aggregate({
      where: { schoolId, paymentDate: { gte: priorMonthStart, lt: from } },
      _sum: { amount: true },
    })
    const priorTotal = toMoney(priorPayments._sum.amount ?? 0)
    trendPercentValue = trendPercent(totalCollected, priorTotal)
    comparison = "vs last month"
  } else if (period === "session") {
    const sessionId = await getActiveSessionId(prisma, schoolId)
    if (sessionId) {
      const session = await prisma.academicSession.findUnique({
        where: { id: sessionId },
        select: { id: true },
      })
      if (session) {
        const sessions = await prisma.academicSession.findMany({
          where: { schoolId },
          orderBy: { startDate: "asc" },
          select: { id: true },
        })
        const idx = sessions.findIndex((s) => s.id === sessionId)
        if (idx > 0) {
          const priorSessionId = sessions[idx - 1].id
          const priorPayments = await prisma.feePayment.aggregate({
            where: { schoolId, invoice: { sessionId: priorSessionId } },
            _sum: { amount: true },
          })
          const priorTotal = toMoney(priorPayments._sum.amount ?? 0)
          trendPercentValue = trendPercent(totalCollected, priorTotal)
          comparison = "vs last session"
        }
      }
    }
  } else {
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1)
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
    const priorPayments = await prisma.feePayment.aggregate({
      where: { schoolId, paymentDate: { gte: lastYearStart, lte: lastYearEnd } },
      _sum: { amount: true },
    })
    const priorTotal = toMoney(priorPayments._sum.amount ?? 0)
    trendPercentValue = trendPercent(totalCollected, priorTotal)
    comparison = "vs last year"
  }

  return { totalCollected, trendPercent: trendPercentValue, comparison, months }
}

// ─── Fee Collection Status ─────────────────────────────────────────────────

export async function getFeeCollectionStatus(
  schoolId: string,
): Promise<DashboardFeeCollectionStatusResult> {
  const prisma = await requirePrisma()
  const sessionId = await getActiveSessionId(prisma, schoolId)

  if (!sessionId) return { collected: 0, pending: 0, total: 0 }

  const [invoiceAgg, paymentAgg] = await Promise.all([
    prisma.feeInvoice.aggregate({
      where: { schoolId, sessionId },
      _sum: { totalAmount: true },
    }),
    prisma.feePayment.aggregate({
      where: { schoolId, invoice: { sessionId } },
      _sum: { amount: true },
    }),
  ])

  const total = toMoney(invoiceAgg._sum.totalAmount ?? 0)
  const collected = toMoney(paymentAgg._sum.amount ?? 0)

  return {
    collected,
    pending: Math.max(0, total - collected),
    total,
  }
}

// ─── Top Performing Classes ────────────────────────────────────────────────

export async function getTopClasses(
  schoolId: string,
): Promise<DashboardTopClassesResult> {
  const prisma = await requirePrisma()

  const finalExams = await prisma.exam.findMany({
    where: { schoolId, status: "FINAL" },
    select: {
      id: true,
      name: true,
      examTypeId: true,
      academicSessionId: true,
      startDate: true,
      endDate: true,
      academicSession: { select: { name: true, startDate: true } },
    },
  })

  const context = selectBestExamContext(
    finalExams.map((e) => ({
      examTypeId: e.examTypeId,
      academicSessionId: e.academicSessionId,
      sessionStart: e.academicSession.startDate,
      sessionName: e.academicSession.name,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
  )

  if (!context) return { context: null, classes: [] }

  const contextExams = finalExams.filter(
    (e) => e.examTypeId === context.examTypeId && e.academicSessionId === context.academicSessionId,
  )
  const examIds = contextExams.map((e) => e.id)

  const results = await prisma.examResult.groupBy({
    by: ["enrollmentId"],
    where: {
      schoolId,
      examId: { in: examIds },
      totalPercentage: { not: null },
    },
    _avg: { totalPercentage: true },
    _count: { id: true },
  })

  const enrollmentIds = results.map((r) => r.enrollmentId)
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { id: { in: enrollmentIds } },
    select: { id: true, class: { select: { name: true } } },
  })
  const enrollmentToClass = new Map(enrollments.map((e) => [e.id, e.class.name]))

  const rankingRows: ClassPerformanceInput[] = []
  for (const r of results) {
    const className = enrollmentToClass.get(r.enrollmentId)
    const average = r._avg.totalPercentage
    if (className && average !== null) rankingRows.push({ className, percentage: Number(average) })
  }

  const ranked = computeClassRanking(rankingRows)
  if (ranked.length < 2) {
    return { context: mapExamContext(context, contextExams[0]?.name ?? null), classes: [] }
  }

  return {
    context: mapExamContext(context, contextExams[0]?.name ?? null),
    classes: ranked,
  }
}

function mapExamContext(context: ExamContext, examName: string | null): DashboardTopClassesResult["context"] {
  return {
    examName,
    academicSessionName: context.sessionName,
    from: context.from.toISOString(),
    to: context.to.toISOString(),
  }
}

// ─── Recent Students ───────────────────────────────────────────────────────

export async function getRecentStudents(
  schoolId: string,
): Promise<DashboardRecentStudentItem[]> {
  const prisma = await requirePrisma()
  const students = await prisma.student.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      status: true,
      enrollments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  })

  return students.map((s) => ({
    id: s.id,
    name: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "),
    studentClass: s.enrollments[0]?.class?.name ?? "—",
    section: s.enrollments[0]?.section?.name ?? "—",
    status: s.status,
  }))
}

// ─── Upcoming Events ───────────────────────────────────────────────────────

export async function getUpcomingEvents(
  schoolId: string,
): Promise<DashboardUpcomingEventItem[]> {
  const prisma = await requirePrisma()
  const now = new Date()

  const categoryMap: Record<string, string> = {
    SPORTS: "sports",
    ACADEMIC: "academic",
    COMMUNITY: "community",
    CULTURAL: "academic",
    GENERAL: "community",
  }

  const events = await prisma.event.findMany({
    where: {
      schoolId,
      status: "SCHEDULED",
      startAt: { gte: now },
    },
    orderBy: { startAt: "asc" },
    take: 5,
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      category: true,
    },
  })

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    date: e.startAt.toISOString().split("T")[0],
    time: formatEventTime(e.startAt, e.endAt),
    category: categoryMap[e.category] ?? "community",
  }))
}

function formatEventTime(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  return `${fmt(start)} – ${fmt(end)}`
}

// ─── Important Notices ─────────────────────────────────────────────────────

export async function getImportantNotices(
  schoolId: string,
): Promise<DashboardNoticeItem[]> {
  const prisma = await requirePrisma()
  const priorityMap: Record<string, string> = {
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
  }

  const notices = await prisma.notice.findMany({
    where: { schoolId, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      priority: true,
      createdAt: true,
    },
  })

  return notices.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.body.length > 150 ? n.body.slice(0, 147) + "…" : n.body,
    publishedAt: n.publishedAt?.toISOString() ?? n.createdAt.toISOString(),
    priority: priorityMap[n.priority] ?? "medium",
  }))
}

// ─── Recent Activity ───────────────────────────────────────────────────────

export async function getRecentActivity(
  schoolId: string,
): Promise<DashboardActivityItem[]> {
  const prisma = await requirePrisma()
  const items: DashboardActivityItem[] = []

  const recentStudents = await prisma.student.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      createdAt: true,
    },
  })

  for (const s of recentStudents) {
    const name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")
    items.push({
      id: `student-${s.id}`,
      action: "New student admission",
      entity: name,
      timestamp: s.createdAt.toISOString(),
      tone: "success",
    })
  }

  const recentPayments = await prisma.feePayment.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: {
      id: true,
      amount: true,
      invoice: {
        select: {
          student: {
            select: { firstName: true, middleName: true, lastName: true },
          },
        },
      },
      createdAt: true,
    },
  })

  for (const p of recentPayments) {
    const studentName = p.invoice.student
      ? [p.invoice.student.firstName, p.invoice.student.middleName, p.invoice.student.lastName]
          .filter(Boolean)
          .join(" ")
      : "Unknown"
    items.push({
      id: `payment-${p.id}`,
      action: "Fee payment received",
      entity: studentName,
      timestamp: p.createdAt.toISOString(),
      tone: "success",
    })
  }

  const recentNotices = await prisma.notice.findMany({
    where: { schoolId, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 1,
    select: { id: true, title: true, publishedAt: true, createdAt: true },
  })

  for (const n of recentNotices) {
    items.push({
      id: `notice-${n.id}`,
      action: "Notice published",
      entity: n.title,
      timestamp: (n.publishedAt ?? n.createdAt).toISOString(),
      tone: "warning",
    })
  }

  const recentFinalizedExams = await prisma.exam.findMany({
    where: { schoolId, status: "FINAL" },
    orderBy: { finalizedAt: "desc" },
    take: 1,
    select: {
      id: true,
      name: true,
      class: { select: { name: true } },
      finalizedAt: true,
      createdAt: true,
    },
  })

  for (const e of recentFinalizedExams) {
    items.push({
      id: `exam-${e.id}`,
      action: "Exam result published",
      entity: `${e.class.name} · ${e.name}`,
      timestamp: (e.finalizedAt ?? e.createdAt).toISOString(),
      tone: "info",
    })
  }

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return items.slice(0, 5)
}

// ─── Birthday Students ─────────────────────────────────────────────────────

export async function getBirthdayStudents(
  schoolId: string,
): Promise<DashboardBirthdayStudentItem[]> {
  const prisma = await requirePrisma()
  const now = new Date()
  const todayMonth = now.getMonth()
  const todayDate = now.getDate()

  const students = await prisma.student.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      dateOfBirth: true,
      enrollments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  })

  const birthdayItems: DashboardBirthdayStudentItem[] = []
  for (const s of students) {
    if (!s.dateOfBirth) continue
    const dob = s.dateOfBirth
    const isToday = dob.getMonth() === todayMonth && dob.getDate() === todayDate
    if (!isToday) continue

    const age = now.getFullYear() - dob.getFullYear()
    const name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")
    const className = s.enrollments[0]?.class?.name ?? "—"
    const section = s.enrollments[0]?.section?.name
    birthdayItems.push({
      id: s.id,
      name,
      studentClass: section ? `${className} · ${section}` : className,
      age,
    })
  }

  return birthdayItems
}
