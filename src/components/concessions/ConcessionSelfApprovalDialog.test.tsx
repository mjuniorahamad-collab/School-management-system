// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ConcessionSelfApprovalDialog } from "@/components/concessions/ConcessionSelfApprovalDialog"
import type { AdjustmentListItem } from "@/types/concessions"

// DOM test for the self-approval confirmation.
//
// The dialog's only data dependency is `useApproveConcession`, so that hook is the
// seam: mocking it keeps the test free of a QueryClientProvider, a mocked service,
// and a router, while still exercising the real dialog, the real Button, and the
// real Radix Dialog portal.
//
// The reason is MANDATORY here. It waives segregation of duties, so the dialog
// must not be able to submit blank, whitespace-only, or over-long text. The server
// independently enforces the same rule with a 400, but the UI must never offer an
// action the server would refuse.

const { mutate, mutationState } = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutationState: { isPending: false },
}))

vi.mock("@/hooks/useConcessions", () => ({
  useApproveConcession: () => ({ mutate, isPending: mutationState.isPending }),
}))

const REASON_MAX_LENGTH = 500

function item(overrides: Partial<AdjustmentListItem> = {}): AdjustmentListItem {
  return {
    id: "adj-1",
    kind: "FIXED_AMOUNT",
    value: 5000,
    computedAmount: 5000,
    status: "REQUESTED",
    reason: "Sibling discount",
    overridden: false,
    overrideReason: null,
    requestedBy: { id: "user-1", name: "Requester" },
    invoice: {
      id: "inv-1",
      invoiceNumber: "INV-1",
      student: { id: "stu-1", admissionNumber: "STU-1", fullName: "Amina Adamu" },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function renderDialog(overrides: Partial<AdjustmentListItem> = {}) {
  const onOpenChange = vi.fn()
  const view = render(
    <ConcessionSelfApprovalDialog open onOpenChange={onOpenChange} item={item(overrides)} />,
  )
  const rerender = (next: Partial<AdjustmentListItem> = {}) =>
    view.rerender(
      <ConcessionSelfApprovalDialog open onOpenChange={onOpenChange} item={item({ ...overrides, ...next })} />,
    )
  return { onOpenChange, view, rerender }
}

// The dialog's own buttons are "Cancel" and "Approve concession" ("Approving…"
// while pending). shadcn also renders a built-in close affordance, so the dialog's
// buttons are addressed by their own labels to keep these queries unambiguous.
const cancelButton = () => screen.getByRole("button", { name: /^cancel$/i }) as HTMLButtonElement
const submitButton = () => screen.getByRole("button", { name: /^approve concession$/i }) as HTMLButtonElement
const reasonField = () => screen.getByLabelText(/^reason$/i) as HTMLTextAreaElement

describe("ConcessionSelfApprovalDialog", () => {
  beforeEach(() => {
    mutate.mockReset()
    mutationState.isPending = false
  })

  afterEach(() => {
    cleanup()
  })

  it("renders the request, the student, and the mandatory-reason affordance", () => {
    renderDialog()

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText(/approve your own request/i)).toBeTruthy()
    // The copy names the student, so the approver can confirm what they are
    // signing off on before committing to a rationale.
    expect(screen.getByText(/amina adamu/i)).toBeTruthy()
    expect(screen.getByText(/required · 0\/500/i)).toBeTruthy()
  })

  it("disables the submit action while the reason is empty", () => {
    renderDialog()

    expect(submitButton().disabled).toBe(true)

    fireEvent.click(submitButton())
    expect(mutate).not.toHaveBeenCalled()
  })

  it("disables the submit action for a whitespace-only reason", () => {
    renderDialog()

    fireEvent.change(reasonField(), { target: { value: "   \n\t  " } })

    expect(submitButton().disabled).toBe(true)

    fireEvent.click(submitButton())
    expect(mutate).not.toHaveBeenCalled()
  })

  it("disables the submit action for a reason longer than the maximum", () => {
    renderDialog()

    // Set the value directly rather than typing: jsdom does not enforce the
    // textarea's maxLength, so this exercises the component's own length guard
    // rather than the attribute.
    fireEvent.change(reasonField(), { target: { value: "a".repeat(REASON_MAX_LENGTH + 1) } })

    expect(submitButton().disabled).toBe(true)

    fireEvent.click(submitButton())
    expect(mutate).not.toHaveBeenCalled()
  })

  it("enables the submit action for a valid reason, including at the maximum length", () => {
    renderDialog()

    fireEvent.change(reasonField(), { target: { value: "Sibling discount confirmed by the bursar" } })
    expect(submitButton().disabled).toBe(false)

    // Exactly at the limit is still valid: the guard is inclusive.
    fireEvent.change(reasonField(), { target: { value: "b".repeat(REASON_MAX_LENGTH) } })
    expect(submitButton().disabled).toBe(false)
    expect(screen.getByText(`Required · ${REASON_MAX_LENGTH}/${REASON_MAX_LENGTH}`)).toBeTruthy()
  })

  it("submits the trimmed reason", () => {
    renderDialog()

    fireEvent.change(reasonField(), { target: { value: "   Sibling discount confirmed by the bursar   " } })
    fireEvent.click(submitButton())

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      { id: "adj-1", payload: { reason: "Sibling discount confirmed by the bursar" } },
      expect.anything(),
    )
    // The dialog stays open because the stubbed `mutate` never invokes the
    // `onSuccess` callback that would close it.
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("disables both actions and reports progress while the approval is in flight", () => {
    const { rerender } = renderDialog()

    fireEvent.change(reasonField(), { target: { value: "Sibling discount confirmed" } })
    expect(submitButton().disabled).toBe(false)

    // `isPending` is read during render, so the pending state needs a re-render.
    mutationState.isPending = true
    rerender()

    const pendingButton = screen.getByRole("button", { name: /approving/i }) as HTMLButtonElement
    expect(pendingButton.disabled).toBe(true)
    expect(cancelButton().disabled).toBe(true)
  })

  it("closes on cancel without approving", () => {
    const { onOpenChange } = renderDialog()

    fireEvent.change(reasonField(), { target: { value: "Sibling discount confirmed" } })
    fireEvent.click(cancelButton())

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("clears the reason when the dialog is reopened", () => {
    const { onOpenChange, rerender } = renderDialog()

    fireEvent.change(reasonField(), { target: { value: "Sibling discount confirmed" } })
    fireEvent.click(cancelButton())
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // The page keeps this component mounted and closes it by clearing `item`, so
    // reopening is a re-render with the item present again. The typed reason must
    // not survive into the next approval.
    rerender({ id: "adj-2" })

    expect(reasonField().value).toBe("")
    expect(submitButton().disabled).toBe(true)
  })
})
