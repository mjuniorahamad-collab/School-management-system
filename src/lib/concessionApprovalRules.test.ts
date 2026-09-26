import { describe, expect, it } from "vitest"
import {
  availableConcessionActions,
  isOwnRequest,
  isSelfApproval,
  isSelfApprovalAllowed,
  requiresApprovalReason,
  type ConcessionActionFlags,
} from "@/lib/concessionApprovalRules"
import type { AdjustmentListItem } from "@/types/concessions"
import { DEFAULT_CONCESSION_SELF_APPROVAL } from "@/types/settings"

// DOM-free mirror of the server's row-action gating. The invariant under test is
// that the UI is never LOOSER than the server: an unknown policy, a missing
// policy, or a missing requester must all resolve to the restrictive behavior.

const ALL_FLAGS: ConcessionActionFlags = {
  canApprove: true,
  canReject: true,
  canCancel: true,
  canOverride: true,
  canReverse: true,
}

function row(overrides: Partial<AdjustmentListItem> = {}): AdjustmentListItem {
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

describe("isOwnRequest (DOM-free)", () => {
  it("is true only when the acting user is the requester", () => {
    expect(isOwnRequest(row(), "user-1")).toBe(true)
    expect(isOwnRequest(row(), "user-2")).toBe(false)
  })

  it("is false without a requester or an acting user", () => {
    expect(isOwnRequest(row({ requestedBy: null }), "user-1")).toBe(false)
    expect(isOwnRequest(row(), null)).toBe(false)
  })
})

describe("isSelfApprovalAllowed (DOM-free)", () => {
  it("permits only the explicit permissive policy", () => {
    expect(isSelfApprovalAllowed("SELF_APPROVAL_ALLOWED")).toBe(true)
    expect(isSelfApprovalAllowed("INDEPENDENT_APPROVAL_REQUIRED")).toBe(false)
  })

  it("fails safe when the policy is absent or unknown", () => {
    expect(isSelfApprovalAllowed(undefined)).toBe(false)
    expect(isSelfApprovalAllowed("BOTH_ALLOWED" as never)).toBe(false)
    expect(isSelfApprovalAllowed(DEFAULT_CONCESSION_SELF_APPROVAL)).toBe(false)
  })
})

describe("availableConcessionActions — own request (DOM-free)", () => {
  it("hides approve on the actor's own row under independent approval", () => {
    const actions = availableConcessionActions(row(), ALL_FLAGS, "user-1", "INDEPENDENT_APPROVAL_REQUIRED")
    expect(actions.approve).toBe(false)
    expect(actions.cancel).toBe(true)
  })

  it("offers approve on the actor's own row when the school allows it", () => {
    const actions = availableConcessionActions(row(), ALL_FLAGS, "user-1", "SELF_APPROVAL_ALLOWED")
    expect(actions.approve).toBe(true)
    expect(actions.reject).toBe(true)
  })

  it("keeps the reason requirement tied to the permissive policy", () => {
    expect(requiresApprovalReason(row(), "user-1", "SELF_APPROVAL_ALLOWED")).toBe(true)
    expect(requiresApprovalReason(row(), "user-1", "INDEPENDENT_APPROVAL_REQUIRED")).toBe(false)
  })
})

describe("availableConcessionActions — override stays distinct (DOM-free)", () => {
  it("never offers override on the actor's own row, under either policy", () => {
    for (const policy of ["INDEPENDENT_APPROVAL_REQUIRED", "SELF_APPROVAL_ALLOWED"] as const) {
      expect(availableConcessionActions(row(), ALL_FLAGS, "user-1", policy).override).toBe(false)
    }
  })

  it("offers override on someone else's row when the permission is held", () => {
    const actions = availableConcessionActions(row(), ALL_FLAGS, "user-2", "SELF_APPROVAL_ALLOWED")
    expect(actions.override).toBe(true)
    expect(actions.approve).toBe(true)
    expect(actions.cancel).toBe(false)
  })

  it("still refuses override without the permission", () => {
    const actions = availableConcessionActions(row(), { ...ALL_FLAGS, canOverride: false }, "user-2", "SELF_APPROVAL_ALLOWED")
    expect(actions.override).toBe(false)
  })
})

describe("availableConcessionActions — status and permission gates (DOM-free)", () => {
  it("offers nothing on a terminal row", () => {
    for (const status of ["REJECTED", "CANCELLED", "REVERSED"] as const) {
      const actions = availableConcessionActions(row({ status }), ALL_FLAGS, "user-2", "SELF_APPROVAL_ALLOWED")
      expect(actions).toEqual({ approve: false, reject: false, cancel: false, override: false, reverse: false })
    }
  })

  it("offers only reverse on an approved row", () => {
    const actions = availableConcessionActions(row({ status: "APPROVED" }), ALL_FLAGS, "user-1", "SELF_APPROVAL_ALLOWED")
    expect(actions.reverse).toBe(true)
    expect(actions.approve).toBe(false)
    expect(actions.cancel).toBe(false)
  })

  it("still requires each permission regardless of policy", () => {
    const noApprove = availableConcessionActions(row(), { ...ALL_FLAGS, canApprove: false }, "user-1", "SELF_APPROVAL_ALLOWED")
    expect(noApprove.approve).toBe(false)

    const noReject = availableConcessionActions(row(), { ...ALL_FLAGS, canReject: false }, "user-2", "SELF_APPROVAL_ALLOWED")
    expect(noReject.reject).toBe(false)

    const noReverse = availableConcessionActions(row({ status: "APPROVED" }), { ...ALL_FLAGS, canReverse: false }, "user-2", "SELF_APPROVAL_ALLOWED")
    expect(noReverse.reverse).toBe(false)
  })
})

describe("availableConcessionActions — fail-safe defaults (DOM-free)", () => {
  it("hides the own-row approve when no policy is supplied", () => {
    expect(availableConcessionActions(row(), ALL_FLAGS, "user-1", undefined).approve).toBe(false)
  })

  it("treats a requester-less row as an independent approval", () => {
    const orphan = row({ requestedBy: null })
    const actions = availableConcessionActions(orphan, ALL_FLAGS, "user-1", "INDEPENDENT_APPROVAL_REQUIRED")
    expect(actions.approve).toBe(true)
    expect(actions.cancel).toBe(false)
    expect(actions.override).toBe(true)
    expect(requiresApprovalReason(orphan, "user-1", "SELF_APPROVAL_ALLOWED")).toBe(false)
    expect(isSelfApproval(orphan, "user-1", "SELF_APPROVAL_ALLOWED")).toBe(false)
  })

  it("offers nothing to an actor with no permissions", () => {
    const none: ConcessionActionFlags = {
      canApprove: false,
      canReject: false,
      canCancel: false,
      canOverride: false,
      canReverse: false,
    }
    expect(availableConcessionActions(row(), none, "user-2", "SELF_APPROVAL_ALLOWED")).toEqual({
      approve: false,
      reject: false,
      cancel: false,
      override: false,
      reverse: false,
    })
  })
})
