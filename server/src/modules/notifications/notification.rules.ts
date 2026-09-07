export const NOTIFICATION_TITLE_MAX = 120
export const NOTIFICATION_BODY_MAX = 1000
export const NOTIFICATION_LINK_MAX = 255
export const MAX_RECIPIENT_IDS = 200
export const MAX_ROLE_TARGETS = 5

/** De-duplicates user IDs while preserving first-seen order. */
export function dedupeIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

// Unified trigger titles so the UI and the audit trail always agree on phrasing.
export function buildFeeInvoiceNotificationTitle(): string {
  return "New fee invoice available"
}

export function buildFeePaymentNotificationTitle(): string {
  return "Fee payment received"
}

export function buildPortalLinkNotificationTitle(): string {
  return "Welcome to your portal"
}