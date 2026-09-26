import type { AdjustmentListItem } from "@/types/concessions"
import { DEFAULT_CONCESSION_SELF_APPROVAL, type ConcessionSelfApprovalPolicy } from "@/types/settings"

// Which row actions to surface, and whether this particular approval needs a
// reason. Extracted from ConcessionsPage so the policy logic is pure and
// unit-testable (the page was already over the file-size signal), and so the
// desktop table and the mobile list cannot drift apart — they both call the same
// function with the same inputs.
//
// NONE of this is a security boundary. `can()` is a UI hint and the policy here
// is only a mirror; the server re-derives both on every request. The one thing
// this module must never do is be LOOSER than the server, so every unknown or
// missing input resolves to the restrictive branch.

export interface ConcessionActionFlags {
  canApprove: boolean
  canReject: boolean
  canCancel: boolean
  canOverride: boolean
  canReverse: boolean
}

export interface ConcessionActions {
  approve: boolean
  reject: boolean
  cancel: boolean
  override: boolean
  reverse: boolean
}

/** Whether the acting user is the requester of this row. */
export function isOwnRequest(
  item: Pick<AdjustmentListItem, "requestedBy">,
  currentUserId: string | null,
): boolean {
  return Boolean(item.requestedBy && currentUserId && item.requestedBy.id === currentUserId)
}

/** Whether the school permits a requester to approve their own request. */
export function isSelfApprovalAllowed(policy: ConcessionSelfApprovalPolicy | undefined): boolean {
  return policy === "SELF_APPROVAL_ALLOWED"
}

/** Whether this approval is a self-approval the school permits. */
export function isSelfApproval(
  item: Pick<AdjustmentListItem, "requestedBy">,
  currentUserId: string | null,
  policy: ConcessionSelfApprovalPolicy | undefined,
): boolean {
  return isOwnRequest(item, currentUserId) && isSelfApprovalAllowed(policy)
}

/**
 * A self-approval waives segregation of duties, so the server requires a
 * decision rationale of its own. Independent approvals keep the reason optional,
 * exactly as before.
 */
export function requiresApprovalReason(
  item: Pick<AdjustmentListItem, "requestedBy">,
  currentUserId: string | null,
  policy: ConcessionSelfApprovalPolicy | undefined,
): boolean {
  return isSelfApproval(item, currentUserId, policy)
}

/**
 * Resolves the row's available actions.
 *
 * `policy` is optional so a missing/older payload fails safe: the caller should
 * pass `undefined` rather than guess, and the approve action then stays hidden on
 * the actor's own row — identical to the pre-policy behavior.
 */
export function availableConcessionActions(
  item: Pick<AdjustmentListItem, "status" | "requestedBy">,
  flags: ConcessionActionFlags,
  currentUserId: string | null,
  policy: ConcessionSelfApprovalPolicy | undefined = DEFAULT_CONCESSION_SELF_APPROVAL,
): ConcessionActions {
  const isOwn = isOwnRequest(item, currentUserId)
  const isPending = item.status === "REQUESTED"
  return {
    // The ONLY difference from the pre-policy rule: an own-row approve is
    // offered when the school allows self-approval. Override is deliberately
    // NOT relaxed — it stays SUPER_ADMIN-only and never self.
    approve: isPending && flags.canApprove && (!isOwn || isSelfApprovalAllowed(policy)),
    reject: isPending && flags.canReject,
    cancel: isPending && flags.canCancel && isOwn,
    override: isPending && flags.canOverride && !isOwn,
    reverse: item.status === "APPROVED" && flags.canReverse,
  }
}
