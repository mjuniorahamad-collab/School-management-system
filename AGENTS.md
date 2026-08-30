# School Management System — Engineering Constitution

This file is the permanent engineering rulebook for this repository. It is binding
for every future session, milestone, and contributor. If a conflict ever arises
between a one-time instruction and this file, this file governs — unless the
incoming instruction explicitly overrides it.

## 0. Judgement principle (non-negotiable)

> For ordinary implementation decisions, use professional engineering judgment and
> continue without unnecessarily blocking the user. Ask the user only when a decision
> materially affects business rules, data relationships, security, architecture,
> legal/compliance behavior, or another decision that cannot be safely inferred.

Direct consequences:

- Do not repeatedly ask for permission for trivial coding decisions.
- Do not ask the user to choose between minor implementation details.
- Do not create fake production functionality just to satisfy a visual requirement.
- Do not rewrite stable code without a reason.
- Do not introduce unnecessary dependencies.
- Do not create giant files.
- Do not duplicate logic.
- Do not silently make major architectural changes.
- Keep future modules compatible with existing architecture.
- Validate changes before claiming they work.

## 1. Product vision

A real, client-deliverable School Management System for a real school (currently the
placeholder brand "Bright Future International School"). Premium UX and
production-grade engineering. The current status is foundation milestones only —
production features come next, each with its own written domain specification.

## 2. Product scope

Completed foundations:

- Premium admin dashboard foundation (frontend) — PROTECTED BASELINE.
- Backend API foundation (Express + TypeScript) with health endpoint.
- Frontend API client boundary.

Deferred until individually spec'd (do NOT build proactively):

- Authentication + RBAC (the next major milestone, before the first real module).
- Domain modules: Students, Teachers, Admissions, Attendance, Fees, Exams, Results,
  Library, Transport, Hostel, Payroll, Parent portal.
- Real database schema / business relationships (promotion rules, fee installments,
  grading rules, attendance policies, class history, parent relationships, session
  behavior) — these are designed deliberately before each module, never guessed.

## 3. Current technology stack

- Frontend: React 19, Vite 8, TypeScript 5.9, Tailwind CSS 4, shadcn/ui
  (radix-nova preset), React Router 7, TanStack Query 5, Recharts 3, lucide-react,
  sonner, cmdk.
- Backend: Node.js (>= 22.18), Express 5, TypeScript (ESM / NodeNext), Prisma
  (PostgreSQL), zod, helmet, cors.
- Tooling: npm only, ESLint 9 + typescript-eslint, `tsx watch` for dev, `tsc` for
  production builds.

## 4. Frontend architecture

Layered, dependency flows downward only:

`types → data (mock) → services (facade) → hooks → components → pages → routes`

- Components NEVER import `src/data` directly and NEVER call `fetch`.
- `src/services/*` is the single data seam. The dashboard service currently resolves
  mock data; future modules call the REST API through `src/lib/apiClient.ts`. When a
  real endpoint exists, swap a method's implementation — never fake an API layer.
- `src/routes/navigation.ts` is the single source of truth for navigation and route
  generation. Unimplemented modules render `ModulePlaceholderPage`.
- Protected baseline: the completed dashboard and `src/components/ui/*` are stable;
  do not rebuild or rewrite them without a concrete reason.

## 5. Backend architecture

`server/` is modular by layer:

`routes → controllers → services → (lib / db)` plus `config`, `middleware`, `types`.

- `app.ts` exports `createApp()` (no listening) so it is testable;
  `server.ts` is the only entry point.
- ES modules; relative imports carry explicit `.js` extensions (compatible with both
  `tsx` runtime and `tsc` emit).
- All API routes live under `/api/v1`.
- Keep business logic in `services`, HTTP logic in `controllers`/`middleware`, and
  requests of configuration only through `config/env.ts`.

## 6. Data / API boundaries

- Frontend ↔ backend contract: REST JSON under `/api/v1`.
- Success envelope: `{ success: true, data: ... }`
- Error envelope: `{ success: false, error: { code: string, message: string } }`
  (optional `details` for validation details).
- `src/types/api.ts` (frontend) and `server/src/types/index.ts` (backend) mirror the
  envelope — keep them in sync when the contract changes.
- The dashboard currently uses mock data by design. Convert per-module only when its
  real endpoint exists. Never wrap mock data in fake HTTP calls.

## 7. Component architecture rules

- One focused pattern per file; small components composed together.
- `src/components/ui/*` is shadcn-generated and PROTECTED. Do not hand-edit beyond
  small sanctioned tweaks (e.g. the `Progress` indicator extension).
- Feature components live in `src/components/<feature>/`; shared visuals in
  `src/components/shared/`.
- Widgets accept an optional `className` for grid composition.
- No giant files: ~400 lines per file is a strong signal to split; ~500+ is an error
  signal. Same applies to backend files.

## 8. TypeScript rules

- `strict` everywhere; `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- Frontend: bundler resolution. Backend: NodeNext, `import "./x.js"` for relative
  imports.
- Use `import type` for type-only imports.
- No `any` without a written justification; no TS `enum` (incompatible with
  `erasableSyntaxOnly` — use string literal unions or `as const`).
- Shared domain types: frontend `src/types/`, backend `server/src/types/`.
- Environment is typed: zod on the backend, `ImportMetaEnv` on the frontend.

## 9. UI / design rules

- Tailwind 4 tokens in `src/index.css`. Indigo primary, slate-50 background, Inter
  font, white cards, tabular numbers, semantic colors (emerald/amber/red/sky).
- No gradients, no ad-hoc colors — use existing tokens.
- Prefer shadcn/ui components over bespoke primitives.

## 10. Accessibility rules

- Semantic elements; `aria-label` on icon-only buttons; Radix primitives own
  keyboard/focus behavior — do not fight them.
- Keep color-contrast via CSS tokens; visible `focus-visible` rings.
- Decorative icons use `aria-hidden`; respect `prefers-reduced-motion` (already in
  `src/index.css`).

## 11. Responsive design rules

- Mobile-first. Sidebar collapses; mobile drawer via Sheet; header/search/hide
  secondary actions defensively at small widths; grids stack.
- Sanity-test layouts at ~360, 768, and 1280 px widths.

## 12. Security rules

- Backend: helmet headers, allow-listed CORS from `CORS_ORIGIN`, `express.json`
  size limit, central error handling that never leaks stack traces or internals,
  zod validation at the API boundary.
- Frontend: only `VITE_`-prefixed env vars are exposed to bundles; never bundle
  secrets.
- Authentication and RBAC are NOT implemented yet. Do not add fake auth, and do not
  claim auth exists.

## 13. Environment-variable rules

- Only `.env.example` is committed. Never create or commit `.env` or real secrets.
- Single root `.env` serves both sides (Vite reads it for `VITE_*`; the server loads
  it via `process.loadEnvFile()`). No `dotenv`.
- Required/optional values are documented in `.env.example`:
  - `NODE_ENV` (optional, default `development`), `PORT` (optional, default `4000`),
    `CORS_ORIGIN` (optional, sensible localhost default).
  - `DATABASE_URL` — REQUIRED only once DB-backed features are enabled; the server
    must boot without it today.
  - `VITE_API_URL` (optional, default `/api/v1`).

## 14. Git safety rules

- Only commit when the user explicitly asks.
- Never run destructive commands (`git reset --hard`, `git clean -fd`, force-push,
  etc.) unless explicitly instructed.
- Suggest commit messages for logical milestones; create the commit only when the
  work is verified and the user wants it.

## 15. Testing / validation rules

Canonical validation before claiming anything works:

1. `npm run lint` → zero problems.
2. `npm run typecheck` → passes (frontend `tsc -b` + server typecheck).
3. `npm run build` and `npm run build:server` → pass.
4. Server boots (`npm run dev:server`) and `GET /api/v1/health` → 200; an unknown
   `/api/v1/...` route → 404 envelope.
5. Frontend dev/preview serves `/`, `/dashboard`, `/students`, `/settings`.
6. `git status` is clean (or only intended files differ).

Never claim success without actually running the checks. No test framework exists
yet; when one is added, its running command becomes part of this list.

Fresh-clone setup: `npm install` then `npm run generate:prisma` (Prisma must be
generated before server typecheck/build that references `@prisma/client`).

## 16. Mock-data rules

- Mock data lives only under `src/data/`, labeled TEMPORARY MOCK, and is consumed
  only through `src/services/`.
- Do not extend mock data into new modules. When a module has a real endpoint, its
  data comes from the API.
- Mock timestamps are date-anchored; keep them moving/relative-safe.

## 17. Error-handling rules

- Backend: throw `ApiError` (status + code + message). The central error handler
  maps it to the error envelope; unknown errors log full detail server-side and
  return a generic `INTERNAL_ERROR` to the client.
- Frontend: `apiClient` normalizes failures to `ApiClientError`; UI surfaces errors
  via sonner toasts and TanStack Query error state. No raw `alert()`.

## 18. Naming conventions

- Files: component files `PascalCase.tsx`; all other modules `kebab-case.ts`.
- Backend files `kebab-case.ts` (e.g. `health.controller.ts`).
- Identifiers: `camelCase` functions/vars, `PascalCase` classes/interfaces/types,
  `SCREAMING_SNAKE_CASE` constants, codes, and env names.
- Route groups: `*.route.ts`, controllers `*.controller.ts`, services `*.service.ts`.

## 19. File / folder organization

- Frontend under `src/`: `app`, `components/{ui,dashboard,dialogs,layout,shared}`,
  `config`, `context`, `data`, `hooks`, `lib`, `pages`, `routes`, `services`, `types`.
- Backend under `server/src/`: `config`, `controllers`, `middleware`, `routes`,
  `services`, `lib`, `types`, plus `app.ts` and `server.ts`.
- Place code in the folder matching its layer. Do not scatter.

## 20. Dependency rules

- Before adding a package, ask: is it necessary? Does it duplicate something
  already available (Node built-ins, existing deps)? What does it add to the supply
  chain? Do not add packages just because tutorials use them.
- After every dependency change, run `npm run lint`, `npm run typecheck`, and the
  relevant builds.
- npm only; commit `package-lock.json`.

## 21. Definition of done

A task is done only when all of:

- Implements the requested behavior exactly — no fake or placeholder functionality.
- Typed, strict-mode clean; lint clean; typecheck and builds pass.
- Server + dashboard boot; routes verified per section 15.
- Boundaries respected (layers, service seam, `/api/v1` contract).
- No secrets introduced; env documented; AGENTS.md rules followed.
- Git state matches the user's intent (clean or requested commits).

## 22. Development workflow

1. Inspect the repository and relevant files first.
2. Plan multi-step work (track tasks).
3. Implement the smallest clean change.
4. Validate with section 15 commands.
5. Report exactly what changed, what was verified, and any caveats.

Never skip validation; never skip reporting.

## 23. How to handle ambiguity

Default: apply professional judgment, document the decision, and continue. Ask the
user only when a decision materially affects business rules, data relationships,
security, architecture, or legal/compliance behavior, or cannot be safely inferred.
When asking, prefer one focused question with a recommended option.

## 24. Rules preventing unnecessary user questions

Do not ask for approval on trivial decisions: naming, minor UI details, file
placement, formatting, refactor mechanics, or which of two equivalent implementations
to pick. Derive answers from this file and existing code patterns, then proceed.

## 25. Rules preventing fake functionality

- Never ship UI that looks functional but does nothing, except where explicitly a
  labeled demo (see `DialogDemoNote` pattern).
- Never stub production behavior (auth, RBAC, payments, reports) just to look done.
- Never replace real behavior with mocks silently. Mocks are explicit, labeled, and
  routed through the service seam.
- Never claim a feature "works" when it is a placeholder or unverified.