// API response shapes for the Student/Parent Portal module (self-service).
// Mirrors the backend contracts under server/src/modules/portal/ — keep both
// sides in sync when the API changes (AGENTS.md §6). Every portal read is
// ownership-scoped server-side; the API surface has no admin "list everyone"
// semantics.

export type PortalActorKind = "GUARDIAN" | "STUDENT"
export type PortalLinkProfileType = "STUDENT" | "GUARDIAN"

export interface PortalSession {
  id: string
  name: string
  code: string
  status: "UPCOMING" | "ACTIVE" | "CLOSED"
}

export interface PortalChildEnrollment {
  academicSessionId: string
  academicSessionName: string
  className: string
  sectionName: string | null
}

export interface PortalChild {
  id: string
  admissionNumber: string
  name: string
  firstName: string
  middleName: string | null
  lastName: string | null
  gender: string
  status: string
  photoUrl: string | null
  dateOfBirth: string
  enrollment: PortalChildEnrollment | null
}

export interface PortalChildGuardian {
  id: string
  name: string
  relationshipType: string
  isPrimary: boolean
}

export interface PortalChildDetail extends PortalChild {
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  admissionDate: string
  guardians: PortalChildGuardian[]
}

export interface PortalOverview {
  id: string
  name: string
  school: { id: string; name: string }
  actorKind: PortalActorKind
  children: PortalChild[]
}

export interface PortalAttendanceSummary {
  present: number
  absent: number
  late: number
  total: number
  presentRate: number | null
}

export interface PortalAttendanceRecord {
  id: string
  date: string
  status: "PRESENT" | "ABSENT" | "LATE" | "HOLIDAY"
  note: string | null
}

export interface PortalAttendanceResult {
  session: PortalSession
  student: { id: string; name: string; admissionNumber: string }
  summary: PortalAttendanceSummary
  records: PortalAttendanceRecord[]
}

export interface PortalInstallmentView {
  id: string
  label: string
  dueDate: string
  amount: number
  amountPaid: number
  balance: number
  status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE"
}

export interface PortalInvoiceView {
  id: string
  invoiceNumber: string
  totalAmount: number
  amountPaid: number
  balance: number
  status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE"
  className: string
  sectionName: string | null
  installments: PortalInstallmentView[]
}

export interface PortalFeesResult {
  session: PortalSession
  student: { id: string; name: string; admissionNumber: string }
  totalAmount: number
  totalPaid: number
  totalBalance: number
  invoices: PortalInvoiceView[]
}

export interface PortalSubjectMark {
  subjectName: string
  maxMarks: number
  obtainedMarks: number | null
  percentage: number | null
  grade: string | null
  isPass: boolean | null
  isAbsent: boolean
  remarks: string | null
}

export interface PortalExamResult {
  id: string
  examId: string
  examName: string
  examTypeName: string | null
  isComplete: boolean
  totalObtained: number | null
  totalMaxMarks: number | null
  totalPercentage: number | null
  grade: string | null
  isPass: boolean | null
  rank: number | null
  marks: PortalSubjectMark[]
}

export interface PortalResultsResult {
  session: PortalSession
  student: { id: string; name: string; admissionNumber: string }
  results: PortalExamResult[]
}

export interface PortalTaskView {
  id: string
  kind: "HOMEWORK" | "ASSIGNMENT"
  title: string
  instructions: string | null
  subjectName: string
  dueDate: string
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  publishedAt: string | null
  submission: {
    status: "SUBMITTED" | "LATE" | "GRADED"
    submittedAt: string
    marks: number | null
    feedback: string | null
    content: string | null
    attachmentUrl: string | null
  } | null
}

export interface PortalTasksResult {
  session: PortalSession
  student: { id: string; name: string; admissionNumber: string }
  items: PortalTaskView[]
}

export interface PortalTransportAssignmentView {
  id: string
  direction: "TO_SCHOOL" | "FROM_SCHOOL" | "BOTH"
  routeName: string
  stopName: string
  assignedAt: string
  notes: string | null
}

export interface PortalTransportResult {
  session: PortalSession
  student: { id: string; name: string; admissionNumber: string }
  assignments: PortalTransportAssignmentView[]
}

export interface PortalLibraryLoanView {
  id: string
  bookTitle: string
  copyCode: string
  issuedAt: string
  dueAt: string
  returnedAt: string | null
  isOverdue: boolean
}

export interface PortalLibraryResult {
  student: { id: string; name: string; admissionNumber: string }
  loans: PortalLibraryLoanView[]
}

export interface PortalNoticeView {
  id: string
  title: string
  body: string
  priority: "HIGH" | "MEDIUM" | "LOW"
  publishedAt: string | null
  createdAt: string
}

export interface PortalNoticesResult {
  notices: PortalNoticeView[]
}

// Admin-side profile link management.

export type PortalActivationStatus = "NONE" | "PENDING" | "ACTIVATED"

export interface PortalActivationView {
  status: PortalActivationStatus
  expiresAt: string | null
}

export interface PortalLink {
  id: string
  profileType: PortalLinkProfileType
  profileId: string
  profileName: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  activation: PortalActivationView
}

export interface PortalLinksResult {
  studentLinks: PortalLink[]
  guardianLinks: PortalLink[]
}

export interface PortalLinkCandidate {
  id: string
  name: string
  email: string | null
  code: string | null
}

export interface PortalLinkCandidatesResult {
  students: PortalLinkCandidate[]
  guardians: PortalLinkCandidate[]
  users: PortalLinkCandidate[]
}

export interface CreateProfileLinkPayload {
  profileType: PortalLinkProfileType
  profileId: string
  userId: string
}

export interface DeleteProfileLinkPayload {
  profileType: PortalLinkProfileType
  profileId: string
  userId: string
}

export interface PortalLinksQuery {
  sessionId?: string
}

// Portal account provisioning (create parent accounts + activation links).

export interface ProvisionPortalAccountPayload {
  profileType: PortalLinkProfileType
  profileId: string
  parentName: string
  email: string
}

export interface ProvisionPortalAccountResult {
  provisioned: boolean
  linkedToExisting: boolean
  token: string | null
  expiresAt: string | null
  userId: string
  profileType: PortalLinkProfileType
  profileId: string
  profileName: string
  userName: string
  userEmail: string
}

export interface RegenerateActivationPayload {
  userId: string
}

export interface RegenerateActivationResult {
  token: string
  expiresAt: string
  userId: string
}

export interface ActivatePortalAccountPayload {
  token: string
  newPassword: string
}

export interface ActivatePortalAccountResult {
  activated: boolean
  autoSignedIn: boolean
  user: { id: string; name: string; email: string }
}