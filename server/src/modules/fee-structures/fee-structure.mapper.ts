import { Prisma } from "@prisma/client"
import { toMoney } from "../../lib/money.js"
import type {
  FeeStructureDetail,
  FeeStructureItemDetail,
  FeeStructureListItem,
} from "./fee-structure.types.js"

export const FEE_STRUCTURE_DETAIL_INCLUDE = {
  session: true,
  class: true,
  items: {
    include: { feeHead: true },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.FeeStructureInclude

export const FEE_STRUCTURE_LIST_INCLUDE = {
  session: { select: { id: true, name: true } },
  class: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.FeeStructureInclude

export type FeeStructureDetailRow = Prisma.FeeStructureGetPayload<{
  include: typeof FEE_STRUCTURE_DETAIL_INCLUDE
}>
export type FeeStructureListItemRow = Prisma.FeeStructureGetPayload<{
  include: typeof FEE_STRUCTURE_LIST_INCLUDE
}>

function toItemDetail(item: FeeStructureDetailRow["items"][number]): FeeStructureItemDetail {
  return {
    id: item.id,
    feeHead: {
      id: item.feeHead.id,
      code: item.feeHead.code,
      name: item.feeHead.name,
      isRecurring: item.feeHead.isRecurring,
    },
    amount: toMoney(item.amount),
    sortOrder: item.sortOrder,
  }
}

export function mapFeeStructureDetail(row: FeeStructureDetailRow): FeeStructureDetail {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    totalAmount: toMoney(row.totalAmount),
    session: {
      id: row.session.id,
      name: row.session.name,
      code: row.session.code,
      status: row.session.status,
    },
    class: { id: row.class.id, name: row.class.name },
    items: row.items.map(toItemDetail),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function mapFeeStructureListItem(row: FeeStructureListItemRow): FeeStructureListItem {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    totalAmount: toMoney(row.totalAmount),
    session: { id: row.session.id, name: row.session.name },
    class: { id: row.class.id, name: row.class.name },
    itemCount: row._count.items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}