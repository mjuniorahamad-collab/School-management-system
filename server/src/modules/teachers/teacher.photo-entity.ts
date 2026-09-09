import { notFoundError } from "../../lib/ApiError.js"
import { auditPhotoLifecycle, type PhotoEntity } from "../photos/photo.service.js"

/**
 * Wires the shared photo service to the Teacher model with tenant isolation:
 * both read and write are scoped to `schoolId`, and a cross-tenant ID resolves
 * to a 404 (never leaking existence).
 */
export const teacherPhotoEntity: PhotoEntity = {
  keyPrefix: "teachers",
  entityType: "TEACHER",

  async getCurrent(prisma, id, schoolId) {
    const row = await prisma.teacher.findFirst({
      where: { id, schoolId },
      select: { photoUrl: true },
    })
    if (!row) throw notFoundError("Teacher not found")
    return row.photoUrl
  },

  async setCurrent(prisma, id, schoolId, key, actor, action) {
    const row = await prisma.teacher.findFirst({
      where: { id, schoolId },
      select: { id: true },
    })
    if (!row) throw notFoundError("Teacher not found")
    await prisma.teacher.update({
      where: { id },
      data: { photoUrl: key },
    })
    await auditPhotoLifecycle(prisma, {
      schoolId,
      actor,
      entityType: "TEACHER",
      entityId: id,
      action,
      summary:
        action === "PHOTO_REMOVE"
          ? `Removed photo for teacher ${row.id}`
          : `Set profile photo for teacher ${row.id} (${action === "PHOTO_REPLACE" ? "replaced" : "added"})`,
    })
  },
}
