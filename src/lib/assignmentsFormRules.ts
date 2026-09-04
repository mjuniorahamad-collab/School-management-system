import { CREATABLE_TASK_STATUSES, TASK_STATUS_OPTIONS } from "@/types/homework"
import type { AssignmentFormPayload, AssignmentStatus } from "@/types/assignments"

export interface AssignmentFormValue {
  academicSessionId: string
  classId: string
  sectionId: string
  subjectId: string
  teacherId: string
  title: string
  instructions: string
  dueDate: string
  status: AssignmentStatus
}

export interface AssignmentFormError {
  field: keyof AssignmentFormValue
  message: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function defaultAssignmentForm(): AssignmentFormValue {
  return {
    academicSessionId: "",
    classId: "",
    sectionId: "",
    subjectId: "",
    teacherId: "",
    title: "",
    instructions: "",
    dueDate: new Date().toISOString().slice(0, 10),
    status: "DRAFT",
  }
}

export function validateAssignmentForm(value: AssignmentFormValue): AssignmentFormError[] {
  const errors: AssignmentFormError[] = []
  if (!value.academicSessionId) errors.push({ field: "academicSessionId", message: "Academic session is required" })
  if (!value.classId) errors.push({ field: "classId", message: "Class is required" })
  if (!value.subjectId) errors.push({ field: "subjectId", message: "Subject is required" })
  if (!value.teacherId) errors.push({ field: "teacherId", message: "Teacher is required" })
  if (!value.title.trim()) errors.push({ field: "title", message: "Title is required" })
  else if (value.title.trim().length > 200) errors.push({ field: "title", message: "Title must be 200 characters or fewer" })
  if (value.instructions.trim().length > 5000) {
    errors.push({ field: "instructions", message: "Instructions must be 5000 characters or fewer" })
  }
  if (!value.dueDate.trim()) errors.push({ field: "dueDate", message: "Due date is required" })
  else if (!DATE_RE.test(value.dueDate.trim())) errors.push({ field: "dueDate", message: "Use YYYY-MM-DD format" })
  if (!TASK_STATUS_OPTIONS.includes(value.status)) errors.push({ field: "status", message: "Choose a valid status" })
  return errors
}

export function assignmentFormToPayload(value: AssignmentFormValue): AssignmentFormPayload {
  const payload: AssignmentFormPayload = {
    academicSessionId: value.academicSessionId,
    classId: value.classId,
    sectionId: value.sectionId || null,
    subjectId: value.subjectId,
    teacherId: value.teacherId,
    title: value.title.trim(),
    dueDate: value.dueDate.trim(),
    status: value.status,
  }
  if (value.instructions.trim()) payload.instructions = value.instructions.trim()
  return payload
}

/** Statuses offered on the create form (ARCHIVED is terminal and server-rejected). */
export function assignmentCreatableStatuses(): AssignmentStatus[] {
  return [...CREATABLE_TASK_STATUSES]
}