import { Prisma, type InstallmentStatus } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { buildPaymentNumber, buildReceiptNumber } from "../../lib/id-generators.js"
import { roundMoney, toMoney } from "../../lib/money.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { buildFeePaymentNotificationTitle } from "../notifications/notification.rules.js"
import { emitNotifications, resolveGuardianUserIds } from "../notifications/notification.service.js"
import {
  deriveInstallmentStatus,
  deriveInvoiceStatus,
  parseDateISO,
  toDateISO,
  todayISODate,
} from "../fee-invoices/fee-invoice.rules.js"
import {
  FEE_PAYMENT_DETAIL_INCLUDE,
  FEE_PAYMENT_LIST_INCLUDE,
  mapPaymentDetail,
  mapPaymentListItem,
  type FeePaymentDetailRow,
  type FeePaymentListItemRow,
} from "./payment.mapper.js"
import { applyAllocation, allocatePayment, isOverpayment } from "./payment.rules.js"
import type {
  CreatePaymentInput,
  ListPaymentsQuery,
} from "./payment.schema.js"
import type { CreatePaymentResult, PaymentDetail, PaymentListResult } from "./payment.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type Tx = Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

interface AllocatableInstallmentRow {
  id: string
  installmentNo: number
  amountPaid: number
  balance: number
  dueDateISO: string
  sortOrder: number
}

async function loadAllocatableInstallments(
  prisma: PrismaClient | Tx,
  invoiceId: string,
): Promise<AllocatableInstallmentRow[]> {
  const rows = await prisma.feeInstallment.findMany({
    where: { invoiceId },
    select: {
      id: true,
      installmentNo: true,
      amountPaid: true,
      balance: true,
      dueDate: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  })
  return rows.map((row) => ({
    id: row.id,
    installmentNo: row.installmentNo,
    amountPaid: toMoney(row.amountPaid),
    balance: toMoney(row.balance),
    dueDateISO: toDateISO(row.dueDate),
    sortOrder: row.sortOrder,
  }))
}

async function paymentDetailById(
  prisma: PrismaClient,
  id: string,
  schoolId: string,
): Promise<PaymentDetail> {
  const row = await prisma.feePayment.findFirst({
    where: { id, schoolId },
    include: FEE_PAYMENT_DETAIL_INCLUDE,
  })
  if (!row) throw notFoundError("Payment not found")
  return mapPaymentDetail(row as FeePaymentDetailRow)
}

export async function createPayment(
  input: CreatePaymentInput,
  schoolId: string,
  userId: string,
  userName: string,
  actor: AuthUser,
): Promise<CreatePaymentResult> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  const paymentAmount = roundMoney(input.amount)
  const paymentDate = parseDateISO(input.paymentDate)

  async function existingByKey(db: PrismaClient | Tx): Promise<{ id: string } | null> {
    return db.feePayment.findFirst({
      where: { schoolId, idempotencyKey: input.idempotencyKey },
      select: { id: true },
    })
  }

  // Keep a lightweight early existence check for the same 404 behavior. This
  // value is never used for a financial decision; authoritative invoice state
  // is always reloaded after the row lock inside the transaction.
  const invoiceExists = await prisma.feeInvoice.findFirst({
    where: { id: input.invoiceId, schoolId },
    select: { id: true },
  })
  if (!invoiceExists) throw notFoundError("Invoice not found")

  const existing = await existingByKey(prisma)
  if (existing) {
    const payment = await paymentDetailById(prisma, existing.id, schoolId)
    return { replayed: true, payment, receipt: payment.receipt }
  }

  try {
    const result = await prisma.$transaction(
      async (tx: Tx) => {
        // Serialize all invoice financial mutations through this PostgreSQL
        // row lock. Different invoices remain independent/concurrent.
        const lockedInvoice = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id"
                     FROM "FeeInvoice"
                     WHERE "id" = ${input.invoiceId}
                       AND "schoolId" = ${schoolId}
                     FOR UPDATE`,
        )
        if (lockedInvoice.length === 0) throw notFoundError("Invoice not found")

        const invoice = await tx.feeInvoice.findFirst({
          where: { id: input.invoiceId, schoolId },
          include: {
            student: {
              select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                middleName: true,
                lastName: true,
              },
            },
            session: { select: { startDate: true } },
          },
        })
        if (!invoice) throw notFoundError("Invoice not found")

        // Re-check idempotency after locking the invoice so identical concurrent
        // submissions replay before any financial validation/allocation.
        const concurrentExisting = await existingByKey(tx)
        if (concurrentExisting) {
          return { paymentId: concurrentExisting.id, replayed: true }
        }

        // Authoritative financial state is read only after the invoice lock.
        const installments = await loadAllocatableInstallments(tx, invoice.id)
        if (isOverpayment(paymentAmount, installments)) {
          throw badRequestError("Payment exceeds the outstanding balance on this invoice")
        }

        const allocation = allocatePayment(paymentAmount, installments)
        const updatedByInstallment = applyAllocation(installments, allocation)
        const invoiceAmountPaid = roundMoney(toMoney(invoice.amountPaid) + paymentAmount)
        const invoiceBalance = roundMoney(toMoney(invoice.balance) - paymentAmount)
        const today = todayISODate()

        const nextInstallmentStates = installments.map((installment) => {
          const updated = updatedByInstallment.get(installment.id)
          return {
            amountPaid: updated ? updated.amountPaid : installment.amountPaid,
            balance: updated ? updated.balance : installment.balance,
            dueDateISO: installment.dueDateISO,
          }
        })
        const invoiceStatus = deriveInvoiceStatus(nextInstallmentStates, today)

        const installmentUpdates: {
          id: string
          amountPaid: number
          balance: number
          status: InstallmentStatus
        }[] = []
        for (const line of allocation) {
          const updated = updatedByInstallment.get(line.installmentId)
          const installment = installments.find((candidate) => candidate.id === line.installmentId)
          if (!updated || !installment) continue
          installmentUpdates.push({
            id: line.installmentId,
            amountPaid: updated.amountPaid,
            balance: updated.balance,
            status: deriveInstallmentStatus(
              { amountPaid: updated.amountPaid, balance: updated.balance, dueDateISO: installment.dueDateISO },
              today,
            ),
          })
        }

        const studentName = [invoice.student.firstName, invoice.student.middleName, invoice.student.lastName]
          .filter(Boolean)
          .join(" ")
        const sessionYear = invoice.session.startDate.getFullYear()

        const paymentCounter = await tx.school.update({
          where: { id: schoolId },
          data: { feePaymentCounter: { increment: 1 } },
          select: { feePaymentCounter: true },
        })
        const paymentRow = await tx.feePayment.create({
          data: {
            schoolId,
            invoiceId: invoice.id,
            paymentNumber: buildPaymentNumber(paymentDate.getFullYear(), paymentCounter.feePaymentCounter),
            amount: paymentAmount,
            method: input.method,
            transactionRef: input.transactionRef ?? null,
            paymentDate,
            notes: input.notes ?? null,
            status: "SUCCESS",
            idempotencyKey: input.idempotencyKey,
            recordedBy: userId,
          },
          select: { id: true, paymentNumber: true },
        })

        const receiptCounter = await tx.school.update({
          where: { id: schoolId },
          data: { feeReceiptCounter: { increment: 1 } },
          select: { feeReceiptCounter: true },
        })
        const receiptRow = await tx.feeReceipt.create({
          data: {
            schoolId,
            paymentId: paymentRow.id,
            invoiceId: invoice.id,
            receiptNumber: buildReceiptNumber(paymentDate.getFullYear(), receiptCounter.feeReceiptCounter),
            studentId: invoice.student.id,
            studentName,
            admissionNumber: invoice.student.admissionNumber,
            className: invoice.className,
            sectionName: invoice.sectionName,
            sessionName: invoice.sessionName,
            sessionYear,
            invoiceNumber: invoice.invoiceNumber,
            invoiceTotal: toMoney(invoice.totalAmount),
            amount: paymentAmount,
            balanceAfter: invoiceBalance,
            method: input.method,
            paymentDate,
            transactionRef: input.transactionRef ?? null,
            receivedBy: userId,
            receivedByName: userName,
          },
          select: { id: true, receiptNumber: true },
        })

        for (const update of installmentUpdates) {
          await tx.feeInstallment.update({
            where: { id: update.id },
            data: { amountPaid: update.amountPaid, balance: update.balance, status: update.status },
          })
        }

        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: { amountPaid: invoiceAmountPaid, balance: invoiceBalance, status: invoiceStatus },
        })

        await recordAudit(tx, {
          schoolId,
          actorId: auditActor.id,
          actorName: auditActor.name,
          actorEmail: auditActor.email,
          actorRole: auditActor.role,
          action: "RECORD_PAYMENT",
          entityType: "FEE_PAYMENT",
          entityId: paymentRow.id,
          summary: `Recorded payment of ${paymentAmount} on invoice ${invoice.invoiceNumber}`,
          metadata: {
            paymentNumber: paymentRow.paymentNumber,
            amount: paymentAmount,
            method: input.method,
            invoiceId: invoice.id,
            studentId: invoice.student.id,
            installments: installmentUpdates.map((update) => update.id),
          },
        })

        await recordAudit(tx, {
          schoolId,
          actorId: auditActor.id,
          actorName: auditActor.name,
          actorEmail: auditActor.email,
          actorRole: auditActor.role,
          action: "ISSUE_RECEIPT",
          entityType: "FEE_RECEIPT",
          entityId: receiptRow.id,
          summary: `Issued receipt to ${studentName} for payment of ${paymentAmount} on ${invoice.invoiceNumber}`,
          metadata: {
            receiptNumber: receiptRow.receiptNumber,
            paymentNumber: paymentRow.paymentNumber,
            amount: paymentAmount,
            balanceAfter: invoiceBalance,
            studentId: invoice.student.id,
            admissionNumber: invoice.student.admissionNumber,
          },
        })

        await emitNotifications(tx, {
          schoolId,
          type: "FEE_PAYMENT",
          title: buildFeePaymentNotificationTitle(),
          body: `Your payment of ${paymentAmount} on invoice ${invoice.invoiceNumber} has been received.`,
          linkPath: "/portal",
          sourceEntityType: "FEE_PAYMENT",
          sourceEntityId: paymentRow.id,
          recipientUserIds: await resolveGuardianUserIds(tx, invoice.student.id),
        })

        return { paymentId: paymentRow.id, replayed: false }
      },
      { timeout: 20_000, maxWait: 10_000 },
    )

    const payment = await paymentDetailById(prisma, result.paymentId, schoolId)
    return { replayed: result.replayed, payment, receipt: payment.receipt }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await existingByKey(prisma)
      if (concurrent) {
        const payment = await paymentDetailById(prisma, concurrent.id, schoolId)
        return { replayed: true, payment, receipt: payment.receipt }
      }
    }
    throw error
  }
}

export async function listPayments(
  query: ListPaymentsQuery,
  schoolId: string,
): Promise<PaymentListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.FeePaymentWhereInput = { schoolId }
  if (query.invoiceId) where.invoiceId = query.invoiceId
  if (query.method) where.method = query.method
  if (query.from || query.to) {
    where.paymentDate = {
      ...(query.from ? { gte: parseDateISO(query.from) } : {}),
      ...(query.to ? { lte: parseDateISO(query.to) } : {}),
    }
  }

  const search = query.search?.trim()
  if (search) {
    const nameContains = { contains: search, mode: "insensitive" as const }
    where.OR = [
      { paymentNumber: { contains: search, mode: "insensitive" } },
      { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
      {
        invoice: {
          student: {
            OR: [
              { firstName: nameContains },
              { middleName: nameContains },
              { lastName: nameContains },
              { admissionNumber: nameContains },
            ],
          },
        },
      },
    ]
  }

  const orderBy: Prisma.FeePaymentOrderByWithRelationInput[] = [{ [query.sortBy]: query.sortDir }]

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.feePayment.count({ where }),
    prisma.feePayment.findMany({
      where,
      include: FEE_PAYMENT_LIST_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows.map((row) => mapPaymentListItem(row as FeePaymentListItemRow)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getPaymentById(id: string, schoolId: string): Promise<PaymentDetail> {
  const prisma = await requirePrisma()
  return paymentDetailById(prisma, id, schoolId)
}