import type { FeeHead } from "@prisma/client"
import type { FeeHeadDetail, FeeHeadListItem } from "./fee-head.types.js"

export function toFeeHeadListItem(feeHead: FeeHead): FeeHeadListItem {
  return {
    id: feeHead.id,
    code: feeHead.code,
    name: feeHead.name,
    isRecurring: feeHead.isRecurring,
    createdAt: feeHead.createdAt.toISOString(),
    updatedAt: feeHead.updatedAt.toISOString(),
  }
}

export function toFeeHeadDetail(feeHead: FeeHead): FeeHeadDetail {
  return toFeeHeadListItem(feeHead)
}
