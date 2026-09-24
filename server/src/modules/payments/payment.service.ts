import { Prisma, type InstallmentStatus } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockInvoiceForUpdate } from "../../lib/db-locks.js"
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
  prisma: Tx,
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

  async function existingByKey(): Promise<{ id: string } | null> {
    return prisma.feePayment.findFirst({
      where: { schoolId, idempotencyKey: input.idempotencyKey },
      select: { id: true },
    })
  }

  // Fast path: a sequential retry of an already-recorded key replays without
  // taking a lock. Concurrent identical submissions are resolved
  // authoritatively inside the transaction below (after the invoice lock).
  const existing = await existingByKey()
  if (existing) {
    const payment = await paymentDetailById(prisma, existing.id, schoolId)
    return { replayed: true, payment, receipt: payment.receipt }
  }

  const paymentAmount = roundMoney(input.amount)
  const paymentDate = parseDateISO(input.paymentDate)
  const today = todayISODate()

  type PaymentOutcome = { createdId: string } | { replayId: string }

  async function persistPayment(): Promise<PaymentOutcome> {
    try {
      return await prisma.$transaction(
        async (tx: Tx): Promise<PaymentOutcome> => {
          // Serialize all financial mutations for THIS invoice, then read the
          // authoritative state under the lock. Validation and balance math
          // must never depend on state read outside the transaction.
          await lockInvoiceForUpdate(tx, input.invoiceId, schoolId)

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

          // Authoritative idempotency check: a concurrent identical request
          // that committed before we acquired the lock must replay, never
          // duplicate the payment/receipt/notification.
          const concurrent = await tx.feePayment.findFirst({
            where: { schoolId, idempotencyKey: input.idempotencyKey },
            select: { id: true },
          })
          if (concurrent) return { replayId: concurrent.id }

          const installments = await loadAllocatableInstallments(tx, invoice.id)
          if (isOverpayment(paymentAmount, installments)) {
            throw badRequestError("Payment exceeds the outstanding balance on this invoice")
          }

          const allocation = allocatePayment(paymentAmount, installments)
          const updatedByInstallment = applyAllocation(installments, allocation)

          const invoiceAmountPaid = roundMoney(toMoney(invoice.amountPaid) + paymentAmount)
          const invoiceBalance = roundMoney(toMoney(invoice.balance) - paymentAmount)

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

          const studentName = [
            invoice.student.firstName,
            invoice.student.middleName,
            invoice.student.lastName,
          ]
            .filter(Boolean)
            .join(" ")
          const sessionYear = invoice.session.startDate.getFullYear()

          // Counter increments happen only AFTER validation passes, so a
          // rejected overpayment never consumes a payment/receipt number.
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

          // Portal notifications fan out to the student's linked guardians,
          // written in THIS transaction (atomic with the payment) and idempotent
          // by source — an idempotency-key replay of the same payment never
          // re-notifies.
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

          return { createdId: paymentRow.id }
        },
        { timeout: 10_000, maxWait: 10_000 },
      )
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await existingByKey()
        if (concurrent) {
          return { replayId: concurrent.id }
        }
      }
      throw error
    }
  }

  const outcome = await persistPayment()
  const replayed = "replayId" in outcome
  const paymentId = replayed ? outcome.replayId : outcome.createdId
  const payment = await paymentDetailById(prisma, paymentId, schoolId)
  return { replayed, payment, receipt: payment.receipt }
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