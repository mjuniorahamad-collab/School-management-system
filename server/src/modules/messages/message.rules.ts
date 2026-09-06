export const GROUP_CONVERSATION_LIMIT = 50
export const LAST_MESSAGE_PREVIEW_LENGTH = 160
export const RECIPIENT_SEARCH_LIMIT = 25

/**
 * Stable identity for a 1:1 thread between two users. The sorted pair key makes
 * "start a direct conversation" idempotent: both directions resolve to the same
 * conversation, so no duplicate threads can be created.
 */
export function buildDirectKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":")
}

/** Bounded preview of a message body for the conversation list projection. */
export function truncatePreview(body: string): string {
  if (body.length <= LAST_MESSAGE_PREVIEW_LENGTH) return body
  return `${body.slice(0, LAST_MESSAGE_PREVIEW_LENGTH - 1)}…`
}