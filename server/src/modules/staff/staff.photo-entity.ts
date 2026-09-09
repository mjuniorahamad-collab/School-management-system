import { notFoundError } from "../../lib/ApiError.js"
import { auditPhotoLifecycle, type PhotoEntity } from "../photos/photo.service.js"

/**
 * Wires the shared photo service to the Staff model with tenant isolation:
 * both read and write are scoped to `schoolId`, and a cross-tenant ID resolves
 * to a 404 (never leaking existence).
 */
export const staffPhotoEntity: PhotoEntity = {
  keyPrefix: "staff",
  entityType: "STAFF",

  async getCurrent(prisma, id, schoolId) {
    const row = await prisma.staff.findFirst({
      where: { id, schoolId },
      select: { photoUrl: true },
    })
    if (!row) throw notFoundError("Staff member not found")
    return row.photoUrl
  },

  async setCurrent(prisma, id, schoolId, key, actor, action) {
    const row = await prisma.staff.findFirst({
      where: { id, schoolId },
      select: { id: true },
    })
    if (!row) throw notFoundError("Staff member not found")
    await prisma.staff.update({
      where: { id },
      data: { photoUrl: key },
    })
    await auditPhotoLifecycle(prisma, {
      schoolId,
      actor,
      entityType: "STAFF",
      entityId: id,
      action,
      summary:
        action === "PHOTO_REMOVE"
          ? `Removed photo for staff member ${row.id}`
          : `Set profile photo for staff member ${row.id} (${action === "PHOTO_REPLACE" ? "replaced" : "added"})`,
    })
  },
}
