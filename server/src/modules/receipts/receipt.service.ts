import { Prisma } from "@prisma/client"
import { notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { parseDateISO } from "../fee-invoices/fee-invoice.rules.js"
import {
  FEE_RECEIPT_DETAIL_INCLUDE,
  FEE_RECEIPT_LIST_INCLUDE,
  mapReceiptDetail,
  mapReceiptListItem,
  type FeeReceiptDetailRow,
  type FeeReceiptListItemRow,
} from "./receipt.mapper.js"
import type { ListReceiptsQuery } from "./receipt.schema.js"
import type { ReceiptDetail, ReceiptListResult } from "./receipt.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listReceipts(
  query: ListReceiptsQuery,
  schoolId: string,
): Promise<ReceiptListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.FeeReceiptWhereInput = { schoolId }
  if (query.invoiceId) where.invoiceId = query.invoiceId
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
      { receiptNumber: { contains: search, mode: "insensitive" } },
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { studentName: nameContains },
      { admissionNumber: nameContains },
    ]
  }

  const orderByField = query.sortBy === "receiptDate" ? "paymentDate" : query.sortBy
  const orderBy: Prisma.FeeReceiptOrderByWithRelationInput[] = [{ [orderByField]: query.sortDir }]

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.feeReceipt.count({ where }),
    prisma.feeReceipt.findMany({
      where,
      include: FEE_RECEIPT_LIST_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows.map((row) => mapReceiptListItem(row as FeeReceiptListItemRow)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getReceiptById(id: string, schoolId: string): Promise<ReceiptDetail> {
  const prisma = await requirePrisma()
  const row = await prisma.feeReceipt.findFirst({
    where: { id, schoolId },
    include: FEE_RECEIPT_DETAIL_INCLUDE,
  })
  if (!row) throw notFoundError("Receipt not found")
  return mapReceiptDetail(row as FeeReceiptDetailRow)
}