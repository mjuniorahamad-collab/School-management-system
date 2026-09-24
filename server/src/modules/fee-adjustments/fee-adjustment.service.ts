import { Prisma } from "@prisma/client"
import { badRequestError, forbiddenError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { roundMoney, toMoney } from "../../lib/money.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { deriveInstallmentStatus, deriveInvoiceStatus, toDateISO, todayISODate } from "../fee-invoices/fee-invoice.rules.js"
import { SUPER_ADMIN_ROLE } from "../../permissions/permissions.js"
import {
  assertFinancialReconciliation,
  assertNotSelfApproval,
  assertValidAdjustmentTransition,
  computeComputedAmount,
  computeNetObligation,
  reduceInstallments,
  reverseApplication,
  sumAdjustmentAmounts,
  type InstallmentApplicationLine,
} from "./fee-adjustment.rules.js"
import {
  FEE_ADJUSTMENT_DETAIL_INCLUDE,
  FEE_ADJUSTMENT_LIST_INCLUDE,
  mapAdjustmentDetail,
  mapAdjustmentListItem,
  parseApplication,
  type FeeAdjustmentDetailRow,
  type FeeAdjustmentListItemRow,
} from "./fee-adjustment.mapper.js"
import type { ListAdjustmentsQuery, RequestAdjustmentInput } from "./fee-adjustment.schema.js"
import type { AdjustmentDetail, AdjustmentListResult } from "./fee-adjustment.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type Tx = Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

async function lockInvoiceForUpdate(tx: Tx, invoiceId: string, schoolId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id"
                FROM "FeeInvoice"
                WHERE "id" = ${invoiceId}
                  AND "schoolId" = ${schoolId}
                FOR UPDATE`,
  )
  if (rows.length === 0) throw notFoundError("Invoice not found")
}

/** Runs a pure rule and turns any domain violation into a 400 BAD_REQUEST. */
function ruleValue<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    throw badRequestError(error instanceof Error ? error.message : "Invalid fee adjustment operation")
  }
}

function assertNotSelfApprovalOrForbid(requestedById: string | null, approverId: string): void {
  try {
    assertNotSelfApproval(requestedById, approverId)
  } catch {
    throw forbiddenError("An adjustment requester cannot approve their own concession")
  }
}

const APPROVE_INCLUDE = {
  invoice: {
    include: {
      installments: { orderBy: { sortOrder: "asc" as const } },
    },
  },
} satisfies Prisma.FeeAdjustmentInclude

interface InstallmentLedger {
  id: string
  amount: number
  amountPaid: number
  balance: number
  dueDateISO: string
  sortOrder: number
}

function toInstallmentLedger(row: {
  id: string
  amount: unknown
  amountPaid: unknown
  balance: unknown
  dueDate: Date
  sortOrder: number
}): InstallmentLedger {
  return {
    id: row.id,
    amount: toMoney(row.amount),
    amountPaid: toMoney(row.amountPaid),
    balance: toMoney(row.balance),
    dueDateISO: toDateISO(row.dueDate),
    sortOrder: row.sortOrder,
  }
}

function parseItemAmounts(value: Prisma.JsonValue | null): { amount: number }[] {
  if (!Array.isArray(value)) return []
  const items: { amount: number }[] = []
  for (const entry of value) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { amount?: unknown }).amount === "number"
    ) {
      items.push({ amount: (entry as { amount: number }).amount })
    }
  }
  return items
}

async function adjustmentDetailById(prisma: PrismaClient, id: string, schoolId: string): Promise<AdjustmentDetail> {
  const row = await prisma.feeAdjustment.findFirst({
    where: { id, schoolId },
    include: FEE_ADJUSTMENT_DETAIL_INCLUDE,
  })
  if (!row) throw notFoundError("Fee adjustment not found")
  return mapAdjustmentDetail(row as FeeAdjustmentDetailRow)
}

// ────────────────────────────────────────────────────────────────────────────
// Request
// ────────────────────────────────────────────────────────────────────────────

export async function requestAdjustment(
  input: RequestAdjustmentInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AdjustmentDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  // Resolve the invoice and the school's ACTIVE academic session in a single
  // snapshot so validation always runs against fresh, consistent database state.
  const [invoice, activeSession] = await prisma.$transaction([
    prisma.feeInvoice.findFirst({
      where: { id: input.invoiceId, schoolId },
      select: { id: true, invoiceNumber: true, grossAmount: true, studentId: true, sessionId: true },
    }),
    prisma.academicSession.findFirst({
      where: { schoolId, status: "ACTIVE" },
      orderBy: { startDate: "asc" },
      select: { id: true },
    }),
  ])
  if (!invoice) throw notFoundError("Invoice not found")
  if (!activeSession) {
    throw badRequestError("No active academic session is configured for this school")
  }
  if (invoice.sessionId !== activeSession.id) {
    throw badRequestError("Concessions can only be requested against an invoice of the active academic session")
  }

  // The computed snapshot is finalized at request from the FROZEN gross so the
  // record is complete immediately; since gross is immutable the approval
  // recomputation always yields the identical number.
  const computedAmount = ruleValue(() =>
    computeComputedAmount(input.kind, input.value, toMoney(invoice.grossAmount)),
  )

  const created = await prisma.$transaction(async (tx: Tx) => {
    const row = await tx.feeAdjustment.create({
      data: {
        schoolId,
        studentId: invoice.studentId,
        sessionId: invoice.sessionId,
        invoiceId: invoice.id,
        kind: input.kind,
        value: input.value,
        computedAmount,
        status: "REQUESTED",
        reason: input.reason ?? null,
        requestedById: actor.id,
      },
      select: { id: true },
    })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action: "CONCESSION_REQUESTED",
      entityType: "FEE_ADJUSTMENT",
      entityId: row.id,
      summary: `Requested a ${input.kind} concession of ${input.value} on invoice ${invoice.invoiceNumber}`,
      metadata: {
        kind: input.kind,
        value: input.value,
        computedAmount,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        sessionId: invoice.sessionId,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    })
    return row
  })

  return adjustmentDetailById(prisma, created.id, schoolId)
}

// ────────────────────────────────────────────────────────────────────────────
// Approve / override
// ────────────────────────────────────────────────────────────────────────────

interface ApprovalOptions {
  overrideReason?: string
  approveReason?: string
}

async function applyApproval(
  prisma: PrismaClient,
  id: string,
  schoolId: string,
  actor: AuthUser,
  auditActor: { id: string; name: string; email: string | null; role: string },
  options: ApprovalOptions,
): Promise<void> {
  const override = Boolean(options.overrideReason)
  if (override && !actor.roles.includes(SUPER_ADMIN_ROLE)) {
    throw forbiddenError("Only a SUPER_ADMIN can override an approval")
  }

  const pending = await prisma.feeAdjustment.findFirst({ where: { id, schoolId } })
  if (!pending) throw notFoundError("Fee adjustment not found")
  assertNotSelfApprovalOrForbid(pending.requestedById, actor.id)

  await prisma.$transaction(async (tx: Tx) => {
    if (pending.invoiceId) {
      await lockInvoiceForUpdate(tx, pending.invoiceId, schoolId)
    }

    const current = await tx.feeAdjustment.findFirst({
      where: { id, schoolId },
      include: APPROVE_INCLUDE,
    })
    if (!current) throw notFoundError("Fee adjustment not found")
    assertNotSelfApprovalOrForbid(current.requestedById, actor.id)
    ruleValue(() => assertValidAdjustmentTransition(current.status, "APPROVED"))

    const invoice = current.invoice
    if (!invoice) throw badRequestError("This adjustment has no invoice to apply")

    const gross = toMoney(invoice.grossAmount)
    const paid = toMoney(invoice.amountPaid)
    const computedAmount = ruleValue(() =>
      computeComputedAmount(current.kind, toMoney(current.value), gross),
    )

    const active = await tx.feeAdjustment.findMany({
      where: { invoiceId: invoice.id, schoolId, status: "APPROVED" },
      select: { computedAmount: true },
    })
    const net = ruleValue(() =>
      computeNetObligation({
        grossAmount: gross,
        amountPaid: paid,
        activeAdjustmentAmounts: [...active.map((row) => toMoney(row.computedAmount)), computedAmount],
      }),
    )

    const reduction = ruleValue(() => reduceInstallments(computedAmount, invoice.installments.map(toInstallmentLedger)))

    const nextStates = invoice.installments.map((installmentRow) => {
      const updated = reduction.updated.get(installmentRow.id)
      return {
        amount: updated ? updated.amount : toMoney(installmentRow.amount),
        amountPaid: updated ? updated.amountPaid : toMoney(installmentRow.amountPaid),
        balance: updated ? updated.balance : toMoney(installmentRow.balance),
      }
    })
    const today = todayISODate()
    const invoiceStatus = ruleValue(() =>
      deriveInvoiceStatus(
        invoice.installments.map((installmentRow, index) => ({
          amountPaid: nextStates[index].amountPaid,
          balance: nextStates[index].balance,
          dueDateISO: toDateISO(installmentRow.dueDate),
        })),
        today,
      ),
    )

    ruleValue(() =>
      assertFinancialReconciliation({
        grossAmount: gross,
        totalAmount: net.totalAmount,
        amountPaid: paid,
        balance: net.balance,
        items: parseItemAmounts(invoice.items as Prisma.JsonValue),
        installments: nextStates,
      }),
    )

    // Conditional transition also serves as the row lock: a concurrent approval
    // blocks here and then sees a non-REQUESTED status (count 0).
    const applied = await tx.feeAdjustment.updateMany({
      where: { id: current.id, schoolId, status: "REQUESTED" },
      data: {
        status: "APPROVED",
        approvedById: actor.id,
        computedAmount,
        installmentApplication: reduction.lines as unknown as Prisma.InputJsonValue,
        ...(override
          ? { overridden: true, overriddenById: actor.id, overrideReason: options.overrideReason }
          : {}),
      },
    })
    if (applied.count !== 1) throw badRequestError("Fee adjustment is not awaiting approval")

    for (const installmentRow of invoice.installments) {
      const updated = reduction.updated.get(installmentRow.id)
      if (!updated) continue
      await tx.feeInstallment.update({
        where: { id: installmentRow.id },
        data: {
          amount: updated.amount,
          balance: updated.balance,
          status: deriveInstallmentStatus(
            { amountPaid: updated.amountPaid, balance: updated.balance, dueDateISO: toDateISO(installmentRow.dueDate) },
            today,
          ),
        },
      })
    }

    await tx.feeInvoice.update({
      where: { id: invoice.id },
      data: { totalAmount: net.totalAmount, balance: net.balance, status: invoiceStatus },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action: override ? "CONCESSION_OVERRIDE" : "CONCESSION_APPROVED",
      entityType: "FEE_ADJUSTMENT",
      entityId: current.id,
      summary: `${override ? "Overrode" : "Approved"} a ${current.kind} concession of ${computedAmount} on invoice ${invoice.invoiceNumber}`,
      metadata: {
        kind: current.kind,
        value: toMoney(current.value),
        computedAmount,
        reduction: reduction.lines,
        totalAmountAfter: net.totalAmount,
        balanceAfter: net.balance,
        ...(options.approveReason ? { approveReason: options.approveReason } : {}),
        ...(override ? { overrideReason: options.overrideReason } : {}),
      },
    })
  })
}

export async function approveAdjustment(
  id: string,
  schoolId: string,
  actor: AuthUser,
  reason?: string,
): Promise<AdjustmentDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  await applyApproval(prisma, id, schoolId, actor, auditActor, { approveReason: reason })
  return adjustmentDetailById(prisma, id, schoolId)
}

export async function overrideAdjustment(
  id: string,
  schoolId: string,
  actor: AuthUser,
  overrideReason: string,
): Promise<AdjustmentDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  await applyApproval(prisma, id, schoolId, actor, auditActor, { overrideReason })
  return adjustmentDetailById(prisma, id, schoolId)
}

// ────────────────────────────────────────────────────────────────────────────
// Reject / cancel
// ────────────────────────────────────────────────────────────────────────────

export async function rejectAdjustment(
  id: string,
  schoolId: string,
  actor: AuthUser,
  reason?: string,
): Promise<AdjustmentDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  await prisma.$transaction(async (tx: Tx) => {
    const current = await tx.feeAdjustment.findFirst({
      where: { id, schoolId },
      select: { id: true, status: true, kind: true, value: true, invoiceId: true },
    })
    if (!current) throw notFoundError("Fee adjustment not found")
    ruleValue(() => assertValidAdjustmentTransition(current.status, "REJECTED"))

    const updated = await tx.feeAdjustment.updateMany({
      where: { id: current.id, schoolId, status: "REQUESTED" },
      data: { status: "REJECTED" },
    })
    if (updated.count !== 1) throw badRequestError("Fee adjustment is not awaiting approval")

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action: "CONCESSION_REJECTED",
      entityType: "FEE_ADJUSTMENT",
      entityId: current.id,
      summary: `Rejected a ${current.kind} concession of ${toMoney(current.value)}`,
      metadata: {
        invoiceId: current.invoiceId,
        ...(reason ? { reason } : {}),
      },
    })
  })

  return adjustmentDetailById(prisma, id, schoolId)
}

export async function cancelAdjustment(
  id: string,
  schoolId: string,
  actor: AuthUser,
  reason?: string,
): Promise<AdjustmentDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  await prisma.$transaction(async (tx: Tx) => {
    const current = await tx.feeAdjustment.findFirst({
      where: { id, schoolId },
      select: { id: true, status: true, kind: true, value: true, invoiceId: true, requestedById: true },
    })
    if (!current) throw notFoundError("Fee adjustment not found")
    if (current.requestedById !== actor.id) {
      throw forbiddenError("Only the requester can cancel their own concession request")
    }
    ruleValue(() => assertValidAdjustmentTransition(current.status, "CANCELLED"))

    const updated = await tx.feeAdjustment.updateMany({
      where: { id: current.id, schoolId, status: "REQUESTED" },
      data: { status: "CANCELLED" },
    })
    if (updated.count !== 1) throw badRequestError("Fee adjustment is not awaiting approval")

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action: "CONCESSION_CANCELLED",
      entityType: "FEE_ADJUSTMENT",
      entityId: current.id,
      summary: `Cancelled a ${current.kind} concession request of ${toMoney(current.value)}`,
      metadata: {
        invoiceId: current.invoiceId,
        ...(reason ? { reason } : {}),
      },
    })
  })

  return adjustmentDetailById(prisma, id, schoolId)
}

// ────────────────────────────────────────────────────────────────────────────
// Reverse (compensating record)
// ────────────────────────────────────────────────────────────────────────────

export async function reverseAdjustment(
  id: string,
  schoolId: string,
  actor: AuthUser,
  reason?: string,
): Promise<AdjustmentDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const pending = await prisma.feeAdjustment.findFirst({ where: { id, schoolId } })
  if (!pending) throw notFoundError("Fee adjustment not found")
  ruleValue(() => assertValidAdjustmentTransition(pending.status, "REVERSED"))

  await prisma.$transaction(async (tx: Tx) => {
    if (pending.invoiceId) {
      await lockInvoiceForUpdate(tx, pending.invoiceId, schoolId)
    }

    const current = await tx.feeAdjustment.findFirst({
      where: { id, schoolId },
      include: APPROVE_INCLUDE,
    })
    if (!current) throw notFoundError("Fee adjustment not found")
    ruleValue(() => assertValidAdjustmentTransition(current.status, "REVERSED"))

    const invoice = current.invoice
    if (!invoice) throw badRequestError("This adjustment has no invoice to reverse")

    const application = parseApplication(current.installmentApplication as Prisma.JsonValue)
    if (application.length === 0) throw badRequestError("This adjustment has no applied concession to reverse")

    const reversal = reverseApplication(invoice.installments.map(toInstallmentLedger), application)

    const today = todayISODate()
    const postStates = invoice.installments.map((installmentRow) => {
      const updated = reversal.updated.get(installmentRow.id)
      return {
        amount: updated ? updated.amount : toMoney(installmentRow.amount),
        amountPaid: updated ? updated.amountPaid : toMoney(installmentRow.amountPaid),
        balance: updated ? updated.balance : toMoney(installmentRow.balance),
        dueDateISO: toDateISO(installmentRow.dueDate),
      }
    })

    const active = await tx.feeAdjustment.findMany({
      where: { invoiceId: invoice.id, schoolId, status: "APPROVED", id: { not: current.id } },
      select: { computedAmount: true },
    })
    const gross = toMoney(invoice.grossAmount)
    const paid = toMoney(invoice.amountPaid)
    const totalAfter = roundMoney(gross - sumAdjustmentAmounts(active.map((row) => toMoney(row.computedAmount))))
    const balanceAfter = roundMoney(totalAfter - paid)
    const statusAfter = deriveInvoiceStatus(postStates, today)

    ruleValue(() =>
      assertFinancialReconciliation({
        grossAmount: gross,
        totalAmount: totalAfter,
        amountPaid: paid,
        balance: balanceAfter,
        items: parseItemAmounts(invoice.items as Prisma.JsonValue),
        installments: postStates,
      }),
    )

    // Lock the original: APPROVED → REVERSED (count 0 if already reversed).
    const updated = await tx.feeAdjustment.updateMany({
      where: { id: current.id, schoolId, status: "APPROVED" },
      data: { status: "REVERSED", reversedById: actor.id },
    })
    if (updated.count !== 1) throw badRequestError("Fee adjustment is not approved and reversible")

    // Compensating reversal record. `installmentApplication` is persisted under
    // the same InstallmentApplicationLine shape (amountReduced = restored) so
    // reversal records serialize identically to originals in the API.
    const restoredLines: InstallmentApplicationLine[] = reversal.lines.map((line) => ({
      installmentId: line.installmentId,
      amountReduced: line.amountRestored,
      amountBefore: line.amountBefore,
      amountAfter: line.amountAfter,
      balanceBefore: line.balanceBefore,
      balanceAfter: line.balanceAfter,
    }))
    const reversalRow = await tx.feeAdjustment.create({
      data: {
        schoolId,
        studentId: current.studentId,
        sessionId: current.sessionId,
        invoiceId: current.invoiceId,
        kind: current.kind,
        value: current.value,
        computedAmount: current.computedAmount,
        status: "REVERSED",
        reason: current.reason,
        installmentApplication: restoredLines as unknown as Prisma.InputJsonValue,
        overridden: current.overridden,
        overriddenById: current.overriddenById,
        overrideReason: current.overrideReason,
        requestedById: current.requestedById,
        reversedById: actor.id,
        reversalOfId: current.id,
      },
      select: { id: true },
    })

    for (const installmentRow of invoice.installments) {
      const updatedState = reversal.updated.get(installmentRow.id)
      if (!updatedState) continue
      await tx.feeInstallment.update({
        where: { id: installmentRow.id },
        data: {
          amount: updatedState.amount,
          balance: updatedState.balance,
          status: deriveInstallmentStatus(
            { amountPaid: updatedState.amountPaid, balance: updatedState.balance, dueDateISO: toDateISO(installmentRow.dueDate) },
            today,
          ),
        },
      })
    }

    await tx.feeInvoice.update({
      where: { id: invoice.id },
      data: { totalAmount: totalAfter, balance: balanceAfter, status: statusAfter },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action: "CONCESSION_REVERSED",
      entityType: "FEE_ADJUSTMENT",
      entityId: current.id,
      summary: `Reversed a ${current.kind} concession of ${toMoney(current.computedAmount)} on invoice ${invoice.invoiceNumber}`,
      metadata: {
        originalId: current.id,
        reversalRecordId: reversalRow.id,
        restoration: reversal.lines,
        totalAmountAfter: totalAfter,
        balanceAfter: balanceAfter,
        ...(reason ? { reason } : {}),
      },
    })
  })

  return adjustmentDetailById(prisma, id, schoolId)
}

// ────────────────────────────────────────────────────────────────────────────
// Query
// ────────────────────────────────────────────────────────────────────────────

export async function listAdjustments(
  query: ListAdjustmentsQuery,
  schoolId: string,
): Promise<AdjustmentListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.FeeAdjustmentWhereInput = { schoolId }
  if (query.studentId) where.studentId = query.studentId
  if (query.sessionId) where.sessionId = query.sessionId
  if (query.invoiceId) where.invoiceId = query.invoiceId
  if (query.status) where.status = query.status
  if (query.kind) where.kind = query.kind

  const search = query.search?.trim()
  if (search) {
    const nameContains = { contains: search, mode: "insensitive" as const }
    where.OR = [
      { reason: { contains: search, mode: "insensitive" } },
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

  const orderBy: Prisma.FeeAdjustmentOrderByWithRelationInput[] = [{ [query.sortBy]: query.sortDir }]

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.feeAdjustment.count({ where }),
    prisma.feeAdjustment.findMany({
      where,
      include: FEE_ADJUSTMENT_LIST_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows.map((row) => mapAdjustmentListItem(row as FeeAdjustmentListItemRow)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getAdjustmentById(id: string, schoolId: string): Promise<AdjustmentDetail> {
  const prisma = await requirePrisma()
  return adjustmentDetailById(prisma, id, schoolId)
}