import { notFoundError } from "../../lib/ApiError.js"
import { auditPhotoLifecycle, type PhotoEntity } from "../photos/photo.service.js"

/**
 * Wires the shared photo service to the Student model with tenant isolation:
 * both read and write are scoped to `schoolId`, and a cross-tenant ID resolves
 * to a 404 (never leaking existence).
 */
export const studentPhotoEntity: PhotoEntity = {
  keyPrefix: "students",
  entityType: "STUDENT",

  async getCurrent(prisma, id, schoolId) {
    const row = await prisma.student.findFirst({
      where: { id, schoolId },
      select: { photoUrl: true },
    })
    if (!row) throw notFoundError("Student not found")
    return row.photoUrl
  },

  async setCurrent(prisma, id, schoolId, key, actor, action) {
    const row = await prisma.student.findFirst({
      where: { id, schoolId },
      select: { id: true },
    })
    if (!row) throw notFoundError("Student not found")
    await prisma.student.update({
      where: { id },
      data: { photoUrl: key, updatedBy: actor.id },
    })
    await auditPhotoLifecycle(prisma, {
      schoolId,
      actor,
      entityType: "STUDENT",
      entityId: id,
      action,
      summary:
        action === "PHOTO_REMOVE"
          ? `Removed photo for student ${row.id}`
          : `Set profile photo for student ${row.id} (${action === "PHOTO_REPLACE" ? "replaced" : "added"})`,
    })
  },
}
