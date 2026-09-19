import { API_BASE_URL } from "@/lib/apiClient"
import type { PhotoKind } from "@/types/photos"

/**
 * Builds the display URL for a stored profile photo.
 *
 * The backend photo routes serve bytes authenticated (never a public URL). The
 * storage key changes on every upload, so it is passed as a `v` cache-buster
 * query to ensure a replaced photo is never served from a stale browser cache.
 * Without a key the record has no photo and we return null so the UI falls
 * back to initials.
 */
export function photoDisplayUrl(
  kind: PhotoKind,
  personId: string,
  storageKey: string | null,
): string | null {
  return buildDisplayUrl(`/${kind}`, personId, storageKey)
}

/**
 * Builds the display URL for a child's profile photo in the Parent Portal.
 * Uses the same storage abstraction as `photoDisplayUrl`: authenticated bytes
 * served through the ownership-scoped portal route, keyed with the storage-key
 * cache-buster, and null (initials fallback) when the child has no photo.
 */
export function portalChildPhotoUrl(
  studentId: string,
  storageKey: string | null,
): string | null {
  return buildDisplayUrl("/me/children", studentId, storageKey)
}

function buildDisplayUrl(
  basePath: string,
  personId: string,
  storageKey: string | null,
): string | null {
  if (!storageKey) return null
  return `${API_BASE_URL}${basePath}/${encodeURIComponent(personId)}/photo?v=${encodeURIComponent(storageKey)}`
}