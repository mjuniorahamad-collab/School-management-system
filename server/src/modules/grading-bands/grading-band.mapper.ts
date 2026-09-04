import type { GradingBand } from "@prisma/client"
import type { GradingBandDetail, GradingBandListItem } from "./grading-band.types.js"

export function toGradingBandListItem(band: GradingBand): GradingBandListItem {
  return {
    id: band.id,
    minPercent: band.minPercent,
    maxPercent: band.maxPercent,
    grade: band.grade,
    description: band.description ?? undefined,
    sortOrder: band.sortOrder,
    createdAt: band.createdAt.toISOString(),
    updatedAt: band.updatedAt.toISOString(),
  }
}

export function toGradingBandDetail(band: GradingBand): GradingBandDetail {
  return toGradingBandListItem(band)
}
