# Users & Roles module — written domain specification

Status: **implemented** (backend: auth + RBAC + tenant-membership CRUD; frontend:
users page + assignable-roles catalog). This document is the authoritative
specification for managing who can sign in and what they can do inside the
school's admin shell, and follows the `docs/students-module.md` template.

## 1. Purpose

Provide the admin **System** module: list the people who belong to the school's
tenant, add or "invite" existing accounts, assign them a role, toggle whether
their membership is active, and remove them from the school. It also exposes the
platform-defined list of roles that a tenant administrator is allowed to assign.
It is the second System-area module (after Settings).

## 2. Domain rules

### Two distinct records

- A **`User`** is a global login identity (name, email, scrypt password hash,
  `status` = `ACTIVE | INACTIVE | SUSPENDED`). Emails are globally unique.
  Creating a user never overwrites an existing account's password.
- A **`TenantMembership`** is a user's membership in one school with one role
  and a per-school `status` = `ACTIVE | INACTIVE`. A user may exist in several
  schools, each with an independent membership + role.

### Users vs accounts

- The API never accepts `schoolId`: it is always resolved server-side from the
  authenticated session (`req.auth.school.id`), so a caller can only manage
  users within their own tenant.
- `POST /users` either **creates a new global user** (password required) or
  **finds an existing user by email and grants them membership** (password
  ignored). This is the "invite an existing account" path by design.
- `DELETE /users/:id` removes the **membership** only. The global user and any
  linked Teacher/Staff records are untouched.

### Roles

- The `Role` catalog is platform-defined (seeded). Within a tenant it is
  read-only (`GET /roles` returns only `ASSIGNABLE_ROLE_NAMES`; `SUPER_ADMIN`
  is excluded and never assignable).
- Account status and membership status are **different fields** and must never
  be conflated in the UI or API.

### Safety guards (enforced server-side, mirrored in UI copy)

- Only assignable roles may be assigned (`FORBIDDEN` otherwise).
- A tenant administrator cannot manage a platform `SUPER_ADMIN` membership,
  cannot deactivate their own membership, and cannot remove their own
  membership (self-lockout protection). Platform super admins bypass these.

### No delete of the global identity

- There is no endpoint to hard-delete a `User` or `Role` in this milestone.
  Roles are platform-managed; user identity is retained for audit/linkage.

## 3. API contract (`/api/v1/users`, `/api/v1/roles`)

All endpoints are JSON under the standard `{ success, data | error }` envelope,
require `requireAuth`, and enforce the listed permissions via route middleware.

Users:

| Method + path    | Permission    | Behavior                                                     |
| ---------------- | ------------- | ------------------------------------------------------------ |
| `GET /users`     | `users:view`  | Paginated list of tenant memberships with search + filters.  |
| `POST /users`    | `users:create`| Create a global user (or find by email) and grant membership.|
| `GET /users/:id` | `users:view`  | Single membership by user id.                                |
| `PATCH /users/:id`| `users:update`| Change membership role and/or status.                        |
| `DELETE /users/:id`| `users:delete`| Remove the membership from the tenant.                       |

Roles:

| Method + path | Permission | Behavior                                                |
| ------------- | ---------- | ------------------------------------------------------- |
| `GET /roles`  | `roles:view` | Assignable roles catalog (name + description), sorted.  |

Query parameters for `GET /users`:

- `page` (default 1), `pageSize` (default 20, max 100)
- `search` — matches user name or email (case-insensitive)
- `status` — membership status (`ACTIVE | INACTIVE`)
- `roleId` — filter by role id

Responses:

- List → `{ items: UserMembershipListItem[], total }`
- Detail → the `UserMembershipListItem` shape
- Create/Patch → the updated `UserMembershipDetail`
- `GET /roles` → `RoleListItem[]` (`{ id, name, description }`)

Envelope shapes:

```
UserMembershipListItem {
  id               // user id (used for /users/:id lookups)
  name, email
  accountStatus    // User.status: ACTIVE | INACTIVE | SUSPENDED
  membershipStatus // TenantMembership.status: ACTIVE | INACTIVE
  role: { id, name }
  createdAt
}
```

HTTP semantics: 400 `BAD_REQUEST` (validation, empty update, or self-lockout
guards), 401 `UNAUTHORIZED`, 403 `FORBIDDEN` (permission or non-assignable role
/ managing a platform super admin), 404 `NOT_FOUND` (unknown id — a global user
that is not a member of this tenant is indistinguishable from an unknown user).
The self-lockout guards (deactivate/remove your own membership) apply to tenant
administrators only; platform `SUPER_ADMIN` bypasses them by design.

Create payload:

```
{ name, email, password?, roleId }
```

Patch payload: at least one of `{ roleId?, status? }`.

### Permissions

Codes used: `users:view`, `users:create`, `users:update`, `users:delete`,
`roles:view`. Grants: `SUPER_ADMIN` and `SCHOOL_ADMIN` receive every code;
other roles receive none of these by default (tenant admin can grant).

## 4. Database schema (Prisma)

```
User 1──N UserRole 1──N Role 1──N RolePermission N──1 Permission
User 1──N TenantMembership N──1 School   // one active membership per school
```

Key notes: `User.email` is globally unique; `TenantMembership` unique on
`(userId, schoolId)`; `Role` is a seeded platform catalog with an
`ASSIGNABLE_ROLE_NAMES` allow-list in `server/src/permissions/permissions.ts`.
No new tables were introduced by this module (reuses the auth foundation).

## 5. Frontend

- `src/types/users.ts` — domain + form-payload types and option constants.
- `src/services/usersService.ts` / `rolesService.ts` — API seam over
  `/users` and `/roles`.
- `src/hooks/useUsers.ts` / `useRoles.ts` — TanStack Query hooks with cache
  invalidation on all mutations and sonner toasts.
- `src/pages/users/UsersPage.tsx` — two-tab page (**Users** | **Roles**),
  gated by `users:view`, following the `FeesPage` tab pattern.
- `src/components/users/` — toolbar (debounced search, status + role filters),
  desktop table + mobile cards, status/role badges, create/edit and detail
  dialogs, and the read-only `RolesTab`.
- `src/lib/userFormRules.ts` — client validation mirroring server rules
  (name required, valid email, password ≥ 8 chars when creating a new
  account, role required).
- Routing: `/users` added to `IMPLEMENTED_PATHS` and lazy-loaded in
  `src/routes/route-tree.tsx`; nav item already present (gated `users:view`).

## 6. Tests

- `src/lib/userFormRules.test.ts` — DB-free: required-name, email format,
  password-length-on-create, role-required, payload mapping.
- Backend: `server/tests/users-roles.integration.test.ts` already covers the
  API, RBAC, tenant isolation, assignable-role enforcement, and self-lockout
  guards.

## 7. Future considerations (out of scope)

- Audit logging of user-management actions (expected with the Audit Logs phase).
- Role creation/customization or permission editing (platform-managed today).
- Self-service profile / change-password endpoints.
- Parent-portal accounts reuse this same identity + membership model.