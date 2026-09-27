// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { StudentDetailPage } from "@/pages/students/StudentDetailPage"
import type { StudentDetail } from "@/types/students"

// Authorization test for the Student Fees card.
//
// The `fees:view` check lives inline in the page, not inside StudentFeesCard:
// the card itself never asks whether it may exist, so nothing inside the card
// can be asserted to prove the boundary. These tests therefore render the real
// page and observe whether the real component is mounted.
//
// Only the edges are substituted - the route params, the signed-in actor, the
// student query and the card's own body. The condition under test,
// `place && can("fees:view")`, is the page's real code and is never stubbed, so
// a passing test cannot be produced by weakening the check.

const { useAuthMock, useStudent, feesCardSpy, canCalls } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useStudent: vi.fn(),
  feesCardSpy: vi.fn(),
  canCalls: [] as string[],
}))

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "stu-1" }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/auth/useAuth", () => ({ useAuth: useAuthMock }))

vi.mock("@/hooks/useStudents", () => ({
  useStudent,
  useStudentPhoto: () => ({
    uploadPhoto: vi.fn(),
    removePhoto: vi.fn(),
    isUploading: false,
    isRemoving: false,
  }),
}))

// A marker stand-in for the card. The page only decides whether to mount it, so
// the stub records its props and renders something assertable.
vi.mock("@/components/students/StudentFeesCard", () => ({
  StudentFeesCard: (props: Record<string, unknown>) => {
    feesCardSpy(props)
    return <div data-testid="student-fees-card" />
  },
}))

function student(overrides: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: "stu-1",
    admissionNumber: "STU-2026-0001",
    firstName: "Amina",
    middleName: null,
    lastName: "Adamu",
    name: "Amina Adamu",
    dateOfBirth: "2014-05-02T00:00:00.000Z",
    gender: "FEMALE",
    photoUrl: null,
    status: "ACTIVE",
    email: null,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    admissionDate: "2026-04-01T00:00:00.000Z",
    emergencyContactName: null,
    emergencyContactPhone: null,
    enrollment: {
      academicSession: { id: "sess-1", name: "Fees Year", code: "2026", status: "ACTIVE" },
      class: { id: "cls-1", name: "Six" },
      section: { id: "sec-1", name: "A" },
    },
    guardians: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  }
}

function renderPage({
  permissions = {},
  detail = student(),
}: {
  permissions?: Record<string, boolean>
  detail?: StudentDetail
} = {}) {
  canCalls.length = 0
  useAuthMock.mockReturnValue({
    can: (permission: string) => {
      canCalls.push(permission)
      return permissions[permission] ?? true
    },
  })
  useStudent.mockReturnValue({
    data: detail,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  return render(<StudentDetailPage />)
}

describe("StudentDetailPage fees card authorization", () => {
  beforeEach(() => {
    useAuthMock.mockReset()
    useStudent.mockReset()
    feesCardSpy.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders the Fees card when the actor holds fees:view", () => {
    renderPage({ permissions: { "fees:view": true } })
    expect(screen.getByTestId("student-fees-card")).toBeDefined()
    expect(canCalls).toContain("fees:view")
  })

  it("does not render the Fees card without fees:view", () => {
    renderPage({ permissions: { "fees:view": false } })
    // The check is genuinely consulted...
    expect(canCalls).toContain("fees:view")
    // ...and the card is genuinely absent, not merely hidden.
    expect(screen.queryByTestId("student-fees-card")).toBeNull()
    expect(feesCardSpy).not.toHaveBeenCalled()
  })

  it("passes the student's own ACTIVE session to the card", () => {
    renderPage()
    expect(feesCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: "stu-1",
        sessionId: "sess-1",
        sessionName: "Fees Year",
        sessionStatus: "ACTIVE",
      }),
    )
  })

  // The card is scoped to the ACTIVE session on purpose, so a student with no
  // enrollment has nothing to show. This keeps the permission test honest: the
  // card is withheld for the session reason too, never for a missing permission.
  it("renders no card when the student has no session enrollment", () => {
    renderPage({ permissions: { "fees:view": true }, detail: student({ enrollment: null }) })
    expect(screen.queryByTestId("student-fees-card")).toBeNull()
  })

  // A non-ACTIVE enrollment is still passed through, and the card owns the
  // decision to explain itself rather than show an older session's figures.
  it("passes a non-ACTIVE session through instead of hiding the card", () => {
    renderPage({
      detail: student({
        enrollment: {
          academicSession: { id: "sess-0", name: "Old Year", code: "2025", status: "ARCHIVED" },
          class: { id: "cls-1", name: "Six" },
          section: null,
        },
      }),
    })
    expect(feesCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-0", sessionStatus: "ARCHIVED" }),
    )
  })
})
