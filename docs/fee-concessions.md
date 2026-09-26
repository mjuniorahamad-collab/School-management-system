# Fee concessions — concession self-approval policy

Status: **implemented**. Extends the existing Fee Concessions (invoice
adjustments) module with one tenant-scoped, school-configurable setting. No new
permission, no schema migration, and no change to the money math.

## 1. Purpose

A concession reduces an invoice balance, so approving one is a financial act.
The default rule is segregation of duties: the person who requested a
concession may not be the person who approves it. Some small schools operate
with one or two office staff, where that rule makes the workflow impossible to
complete.

Rather than weakening the rule globally, each school chooses its own policy in
**Settings → Fees**:

| Value | Meaning |
| --- | --- |
| `INDEPENDENT_APPROVAL_REQUIRED` | **Default.** The requester cannot approve their own request. |
| `SELF_APPROVAL_ALLOWED` | A requester who also holds `concessions:approve` may approve their own request. |

`SELF_APPROVAL_ALLOWED` is not a third mode: independent approval by a
different user remains possible either way, so "allowed" means "both".

## 2. Storage and defaults

- Stored as a `SchoolSetting` row, key `feeConcessionSelfApproval`, scoped to
  the school. The canonical constants live in
  `server/src/lib/school-settings.ts` and are mirrored in `src/types/settings.ts`.
- **No migration and no backfill.** A school that has never saved the setting
  reads through to `INDEPENDENT_APPROVAL_REQUIRED`, so existing schools keep the
  stricter behavior for free.
- Reads are defensive in both directions:
  - a missing row → the safe default;
  - a row whose value is not in the contract (hand-edited, or written by an
    older/newer build) → the safe default, never an exception. A corrupt
    setting must not be able to loosen a financial control.
- Writes are validated against the two-value contract, so an out-of-contract
  value is rejected with `400` and `details`.
- Changing the setting requires `settings:update` and writes a `SETTING_CHANGE`
  audit row whose metadata carries the `policyChange` with the previous and new
  value.

## 3. Enforcement

Server-side is the only authority. `concessions:override` is unaffected and
stays stricter: SUPER_ADMIN-only, and never available on the requester's own
request under either policy. Override remains a distinct audit action
(`CONCESSION_OVERRIDDEN`) from a plain approval.

- **Guard.** `assertCanApproveAdjustment` allows a self-approval only when the
  policy is `SELF_APPROVAL_ALLOWED`. `INDEPENDENT_APPROVAL_REQUIRED` returns
  `403 FORBIDDEN` — it is a segregation-of-duties control, not a missing
  permission, so `FORBIDDEN` (not `404`) is correct.
- **Required reason.** A self-approval waives the control, so the decision
  rationale becomes mandatory: a blank or whitespace-only reason is rejected
  with `400`. An independent approval keeps its reason optional, exactly as
  before.
- **Checked twice.** The policy is read once before opening the transaction (to
  fail fast with a clean error) and again inside it (authoritative for the
  write). A setting flipped mid-request cannot be applied halfway.
- **Tenant-scoped.** The policy is read through the authenticated tenant
  (`req.auth.school.id`). There is no school-name branch and no client-supplied
  tenant input, so one school's policy can never affect another.

The list endpoint returns `approvalPolicy` alongside the page, so the UI can
decide which actions to offer without a second request. An absent field is
treated as the restrictive default.

## 4. Audit

An approved concession writes `CONCESSION_APPROVED` in both cases; the metadata
distinguishes them:

- `approvalPolicy` — the policy value in force for the decision.
- `selfApproved` — `true` only when the approver was the requester.
- `requestedById` — the requester, present on a self-approval so the "same
  person" fact is explicit in the log rather than inferable.
- the mandatory reason, for a self-approval.

The list summary reads `(self-approved)` for a self-approval so the history is
readable without opening the row.

## 5. Client behavior

- `src/lib/concessionApprovalRules.ts` holds the pure, unit-tested mirror of
  the server rules. It is a UI hint, never a security boundary, and it is
  written to fail safe: an unknown or missing policy resolves to the
  restrictive branch.
- Desktop and mobile row rendering call the same function, so the two views
  cannot drift.
- A self-approval opens `ConcessionSelfApprovalDialog`, which requires a reason
  (max 500 characters) before it will submit. An independent approval keeps the
  plain confirmation dialog.
- When the school allows self-approval, the concessions list shows a short note
  explaining that a reason is required and audited.

## 6. Tests

- `server/tests/fee-adjustments.unit.test.ts` — the policy matrix, the required
  reason, override staying distinct, and the fail-safe parser.
- `server/tests/fee-adjustments.integration.test.ts` — end-to-end approval
  (allowed and refused), audit metadata, tenant isolation, and the mandatory
  reason.
- `server/tests/settings.integration.test.ts` — the default, round trip, rejected
  writes, coercion of a corrupt row, tenant isolation, the permission split, and
  the `SETTING_CHANGE` audit row.
- `src/lib/concessionApprovalRules.test.ts` — the client mirror, including the
  fail-safe paths.
