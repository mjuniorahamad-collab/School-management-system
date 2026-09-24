// Persisted active-school selection for multi-school users.
//
// Sessions carry no school id, so the active tenant is owned by the client:
// the last choice is persisted and re-sent as `X-School-Id` (via `apiClient`)
// on every API call, including login, so a returning user lands on the same
// school. On first login (or after a school was revoked) the server resolves a
// deterministic default and the AuthProvider reconciles to the returned id.

const STORAGE_KEY = "sms.activeSchoolId"

function readStored(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const current = { id: readStored() }

export function getActiveSchoolId(): string | null {
  return current.id
}

export function setActiveSchoolId(schoolId: string | null): void {
  current.id = schoolId
  if (typeof window === "undefined") return
  try {
    if (schoolId) {
      window.localStorage.setItem(STORAGE_KEY, schoolId)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage unavailable (private mode / quota): keep the in-memory value.
  }
}

export function clearActiveSchoolId(): void {
  setActiveSchoolId(null)
}