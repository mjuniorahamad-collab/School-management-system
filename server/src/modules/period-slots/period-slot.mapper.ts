import type { PeriodSlot } from "@prisma/client"
import type { PeriodSlotDetail, PeriodSlotListItem } from "./period-slot.types.js"

export function toPeriodSlotListItem(periodSlot: PeriodSlot): PeriodSlotListItem {
  return {
    id: periodSlot.id,
    name: periodSlot.name,
    startTime: periodSlot.startTime,
    endTime: periodSlot.endTime,
    sortOrder: periodSlot.sortOrder,
    createdAt: periodSlot.createdAt.toISOString(),
    updatedAt: periodSlot.updatedAt.toISOString(),
  }
}

export function toPeriodSlotDetail(periodSlot: PeriodSlot): PeriodSlotDetail {
  return toPeriodSlotListItem(periodSlot)
}
