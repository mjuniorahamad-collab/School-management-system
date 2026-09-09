// Shared types for the profile-photo feature (students, teachers, staff).

/** Resource kinds that carry profile photos. Mirrors the backend route groups. */
export type PhotoKind = "students" | "teachers" | "staff"

/** Backend `PUT/DELETE /<kind>/:id/photo` response payload. */
export interface PhotoResult {
  photoUrl: string | null
}