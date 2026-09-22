import type { InstallmentStatus } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { buildInvoiceNumber } from "../../lib/id-generators.js"
import { roundMoney, toMoney } from "../../lib/money.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { buildFeeInvoiceNotificationTitle } from "../notifications/notification.rules.js"
import { emitNotifications, resolveGuardianUserIds } from "../notifications/notification.service.js"
import {
  FEE_INVOICE_DETAIL_INCLUDE,
  FEE_INVOICE_LIST_INCLUDE,
  mapFeeInvoiceDetail,
  mapFeeInvoiceListItem,
  type FeeInvoiceDetailRow,
  type FeeInvoiceListItemRow,
} from "./fee-invoice.mapper.js"
import {
  assertInstallmentsMatchTotal,
  deriveInstallmentStatus,
  deriveInvoiceStatus,
  parseDateISO,
  toDateISO,
  todayISODate,
} from "./fee-invoice.rules.js"
import type {
  GenerateInvoicesInput,
  GenerationPreviewInput,
  ListInvoicesQuery,
} from "./fee-invoice.schema.js"
import type {
  FeeInvoiceDetail,
  FeeInvoiceListResult,
  GenerateInvoicesResult,
  GenerationPreviewResult,
} from "./fee-invoice.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type Tx = Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

interface ResolvedScope {
  sessionId: string
  sessionName: string
  startYear: number
  endDate: Date
  classId: string
}

async function resolveSessionAndClass(
  prisma: PrismaClient,
  schoolId: string,
  sessionId: string,
  classId: string,
): Promise<ResolvedScope> {
  const session = await prisma.academicSession.findFirst({
    where: { id: sessionId, schoolId },
    select: { id: true, name: true, startDate: true, endDate: true },
  })
  if (!session) throw badRequestError("Academic session is not valid for this school")

  const schoolClass = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true },
  })
  if (!schoolClass) throw badRequestError("Class is not valid for this school")

  return {
    sessionId: session.id,
    sessionName: session.name,
    startYear: session.startDate.getFullYear(),
    endDate: session.endDate,
    classId: schoolClass.id,
  }
}

interface LoadedStructureItem {
  feeHeadId: string
  code: string
  name: string
  amount: number
  sortOrder: number
}

interface LoadedStructure {
  id: string
  name: string
  totalAmount: number
  items: LoadedStructureItem[]
}

async function loadActiveStructure(
  prisma: PrismaClient,
  schoolId: string,
  sessionId: string,
  classId: string,
): Promise<LoadedStructure> {
  const structure = await prisma.feeStructure.findFirst({
    where: { schoolId, sessionId, classId },
    include: {
      items: { include: { feeHead: true }, orderBy: { sortOrder: "asc" as const } },
    },
  })
  if (!structure) {
    throw badRequestError("No fee structure is configured for this academic session and class")
  }
  if (!structure.isActive) {
    throw badRequestError("The fee structure for this academic session and class is deactivated")
  }
  return {
    id: structure.id,
    name: structure.name,
    totalAmount: toMoney(structure.totalAmount),
    items: structure.items.map((item) => ({
      feeHeadId: item.feeHeadId,
      code: item.feeHead.code,
      name: item.feeHead.name,
      amount: toMoney(item.amount),
      sortOrder: item.sortOrder,
    })),
  }
}

interface PlannedInstallment {
  installmentNo: number
  label: string
  amount: number
  dueDate: Date
  sortOrder: number
  initialStatus: InstallmentStatus
}

function toInstallmentDueInfo(installment: {
  amount: number
  dueDate: Date
}): { amountPaid: number; balance: number; dueDateISO: string } {
  return { amountPaid: 0, balance: installment.amount, dueDateISO: toDateISO(installment.dueDate) }
}

function planInstallments(
  input: GenerateInvoicesInput,
  structureTotal: number,
  sessionEndDate: Date,
): PlannedInstallment[] {
  const today = todayISODate()

  if (input.installments) {
    assertInstallmentsMatchTotal(structureTotal, input.installments)
    return input.installments.map((installment, index) => {
      const planned = {
        installmentNo: index + 1,
        label: installment.label,
        amount: roundMoney(installment.amount),
        dueDate: parseDateISO(installment.dueDate),
        sortOrder: index,
      }
      return {
        ...planned,
        initialStatus: deriveInstallmentStatus(toInstallmentDueInfo(planned), today),
      }
    })
  }

  const planned = {
    installmentNo: 1,
    label: "Full fee",
    amount: structureTotal,
    dueDate: sessionEndDate,
    sortOrder: 0,
  }
  return [{ ...planned, initialStatus: deriveInstallmentStatus(toInstallmentDueInfo(planned), today) }]
}

export async function getGenerationPreview(
  input: GenerationPreviewInput,
  schoolId: string,
): Promise<GenerationPreviewResult> {
  const prisma = await requirePrisma()
  const resolved = await resolveSessionAndClass(prisma, schoolId, input.sessionId, input.classId)

  const feeStructure = await prisma.feeStructure.findFirst({
    where: { schoolId, sessionId: resolved.sessionId, classId: resolved.classId },
    select: { id: true, name: true, totalAmount: true, isActive: true },
  })

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicSessionId: resolved.sessionId,
      classId: resolved.classId,
      student: { status: "ACTIVE" },
    },
    select: { id: true },
  })

  const withInvoice = enrollments.length
    ? await prisma.feeInvoice.count({
        where: {
          schoolId,
          sessionId: resolved.sessionId,
          enrollmentId: { in: enrollments.map((enrollment) => enrollment.id) },
        },
      })
    : 0

  return {
    feeStructure: feeStructure
      ? {
          id: feeStructure.id,
          name: feeStructure.name,
          totalAmount: toMoney(feeStructure.totalAmount),
          isActive: feeStructure.isActive,
        }
      : null,
    totalEnrolled: enrollments.length,
    withInvoice,
    withoutInvoice: enrollments.length - withInvoice,
  }
}

export async function generateInvoices(
  input: GenerateInvoicesInput,
  schoolId: string,
  userId: string,
  actor: AuthUser,
): Promise<GenerateInvoicesResult> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  const resolved = await resolveSessionAndClass(prisma, schoolId, input.sessionId, input.classId)
  const structure = await loadActiveStructure(prisma, schoolId, resolved.sessionId, resolved.classId)
  const installments = planInstallments(input, structure.totalAmount, resolved.endDate)

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicSessionId: resolved.sessionId,
      classId: resolved.classId,
      student: { status: "ACTIVE" },
    },
    select: {
      id: true,
      studentId: true,
      sectionId: true,
    },
  })
  const totalEnrolled = enrollments.length

  const existingEnrollmentIds = new Set(
    (
      await prisma.feeInvoice.findMany({
        where: { schoolId, sessionId: resolved.sessionId, enrollmentId: { in: enrollments.map((e) => e.id) } },
        select: { enrollmentId: true },
      })
    ).map((invoice) => invoice.enrollmentId),
  )

  const sectionNames = await fetchSectionNames(
    prisma,
    schoolId,
    enrollments.flatMap((enrollment) => (enrollment.sectionId ? [enrollment.sectionId] : [])),
  )
  const className = await classNameForClass(prisma, schoolId, resolved.classId)

  const itemsJson: Prisma.InputJsonValue = structure.items.map((item) => ({
    feeHeadId: item.feeHeadId,
    feeHeadCode: item.code,
    feeHeadName: item.name,
    amount: item.amount,
    sortOrder: item.sortOrder,
  }))

  const invoiceStatus = deriveInvoiceStatus(
    installments.map((installment) => toInstallmentDueInfo(installment)),
    todayISODate(),
  )

  const invoiceNumbers: string[] = []
  let generated = 0

  await prisma.$transaction(async (tx: Tx) => {
    for (const enrollment of enrollments) {
      if (existingEnrollmentIds.has(enrollment.id)) continue

      const counter = await tx.school.update({
        where: { id: schoolId },
        data: { feeInvoiceCounter: { increment: 1 } },
        select: { feeInvoiceCounter: true },
      })
      const invoiceNumber = buildInvoiceNumber(resolved.startYear, counter.feeInvoiceCounter)
      const sectionName = enrollment.sectionId ? sectionNames.get(enrollment.sectionId) ?? null : null

      const invoiceRow = await tx.feeInvoice.create({
        data: {
          schoolId,
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          sessionId: resolved.sessionId,
          feeStructureId: structure.id,
          invoiceNumber,
          className,
          sectionName,
          sessionName: resolved.sessionName,
          grossAmount: structure.totalAmount,
          totalAmount: structure.totalAmount,
          amountPaid: 0,
          balance: structure.totalAmount,
          status: invoiceStatus,
          items: itemsJson,
          createdBy: userId,
          installments: {
            create: installments.map((installment) => ({
              schoolId,
              installmentNo: installment.installmentNo,
              label: installment.label,
              amount: installment.amount,
              dueDate: installment.dueDate,
              amountPaid: 0,
              balance: installment.amount,
              status: installment.initialStatus,
              sortOrder: installment.sortOrder,
            })),
          },
        },
        select: { id: true },
      })

      // Portal notifications fan out to the student's linked guardians. The
      // notification is written in THIS transaction (atomic with the invoice)
      // and idempotent by its invoice source — retrying generation for the
      // same invoice never produces a duplicate.
      await emitNotifications(tx, {
        schoolId,
        type: "FEE_INVOICE",
        title: buildFeeInvoiceNotificationTitle(),
        body: `A fee invoice (${invoiceNumber}) has been added to your account.`,
        linkPath: "/portal",
        sourceEntityType: "FEE_INVOICE",
        sourceEntityId: invoiceRow.id,
        recipientUserIds: await resolveGuardianUserIds(tx, enrollment.studentId),
      })

      generated += 1
      invoiceNumbers.push(invoiceNumber)
    }

    if (generated > 0) {
      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorEmail: auditActor.email,
        actorRole: auditActor.role,
        action: "GENERATE",
        entityType: "FEE_INVOICE",
        summary: `Generated ${generated} fee invoices for ${resolved.sessionName} / ${className}`,
        metadata: {
          generated,
          skippedExisting: totalEnrolled - generated,
          sessionId: resolved.sessionId,
          classId: resolved.classId,
          feeStructureId: structure.id,
          totalAmount: structure.totalAmount,
          firstInvoice: invoiceNumbers[0] ?? null,
        },
      })
    }
  },
  { timeout: 20_000, maxWait: 10_000 },
)

  return {
    totalEnrolled,
    generated,
    skippedExisting: totalEnrolled - generated,
    invoiceNumbers,
  }
}

async function fetchSectionNames(
  prisma: PrismaClient,
  schoolId: string,
  sectionIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(sectionIds)]
  if (uniqueIds.length === 0) return new Map()
  const sections = await prisma.section.findMany({
    where: { id: { in: uniqueIds }, class: { schoolId } },
    select: { id: true, name: true },
  })
  return new Map(sections.map((section) => [section.id, section.name]))
}

async function classNameForClass(prisma: PrismaClient, schoolId: string, classId: string): Promise<string> {
  const schoolClass = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { name: true },
  })
  if (!schoolClass) throw badRequestError("Class is not valid for this school")
  return schoolClass.name
}

export async function listInvoices(
  query: ListInvoicesQuery,
  schoolId: string,
): Promise<FeeInvoiceListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.FeeInvoiceWhereInput = { schoolId }
  if (query.sessionId) where.sessionId = query.sessionId
  if (query.classId) where.enrollment = { classId: query.classId }
  if (query.status) where.status = query.status

  const search = query.search?.trim()
  if (search) {
    const nameContains = { contains: search, mode: "insensitive" as const }
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { student: { admissionNumber: { contains: search, mode: "insensitive" } } },
      {
        student: {
          OR: [
            { firstName: nameContains },
            { middleName: nameContains },
            { lastName: nameContains },
          ],
        },
      },
    ]
  }

  const orderBy: Prisma.FeeInvoiceOrderByWithRelationInput[] =
    query.sortBy === "studentName"
      ? [{ student: { firstName: query.sortDir } }]
      : [{ [query.sortBy]: query.sortDir }]

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.feeInvoice.count({ where }),
    prisma.feeInvoice.findMany({
      where,
      include: FEE_INVOICE_LIST_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows.map((row) => mapFeeInvoiceListItem(row as FeeInvoiceListItemRow)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getInvoiceById(id: string, schoolId: string): Promise<FeeInvoiceDetail> {
  const prisma = await requirePrisma()
  const invoice = await prisma.feeInvoice.findFirst({
    where: { id, schoolId },
    include: FEE_INVOICE_DETAIL_INCLUDE,
  })
  if (!invoice) throw notFoundError("Invoice not found")
  return mapFeeInvoiceDetail(invoice as FeeInvoiceDetailRow)
}