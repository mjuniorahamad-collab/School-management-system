# School Management System

A premium, production-oriented School Management System for a real school client.
Current milestone: **engineering foundation** — admin dashboard, Express API
foundation, and the frontend/backend boundary. Domain modules come next, each with
its own written specification.

## Stack

- Frontend: React 19 + Vite + TypeScript · Tailwind CSS 4 + shadcn/ui (Radix) ·
  React Router 7 · TanStack Query 5 · Recharts 3 · Lucide icons
- Backend: Node.js (>= 22.18) + Express 5 + TypeScript · Prisma (PostgreSQL) ·
  zod · helmet · cors
- Tooling: npm · ESLint 9 + typescript-eslint · `tsx watch` (dev) · `tsc` (build)

## Structure

```
src/            Frontend
  app/          Application composition: providers, route tree
  routes/       Single source of truth for navigation + routing
  components/
    layout/     Shell: sidebar, header, containers
    dashboard/  Dashboard widgets
    charts/     Recharts wrappers
    dialogs/    Workflow dialogs
    ui/         shadcn/ui primitives (PROTECTED — do not hand-edit)
  pages/        Route pages
  data/         TEMPORARY mock data (clearly labeled, never in UI components)
  services/     Service facade — components talk to this, never to mock data
  hooks/        Data/composition hooks
  types/        Domain types + API envelope types (src/types/api.ts)
  lib/          Utilities (formatting, cn, apiClient.ts)
server/         Express + TypeScript + Prisma (PostgreSQL) API
  src/
    config/     Typed environment (zod)
    controllers/  HTTP handlers
    middleware/   Request logging, error handling, 404s
    routes/     Routers mounted under /api/v1
    services/   Business logic
    lib/        ApiError, response envelope, logger, lazy Prisma client
    types/      API envelope types
    app.ts      createApp() factory (no listen — testable)
    server.ts   Entry point + graceful shutdown
  prisma/       schema.prisma (datasource/generator only — no models yet)
```

## Data architecture

```
UI components
   └─ hooks → services (dashboardService)
         └─ data layer (mock now → REST API + database later)
```

Components never import mock data or call `fetch` directly. Future module data
flows through `src/lib/apiClient.ts` → `/api/v1`. The dashboard keeps its validated
mock service until each module gains a real endpoint — never wrapped in fake HTTP.

## Environment

Copy `.env.example` to `.env` for local development. The single root `.env` serves
both sides. Requirements are documented from `.env.example`; the API boots with no
database configured.

## Scripts

| Command                  | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Vite dev server (proxies `/api` → :4000)       |
| `npm run dev:server`     | API dev server (`tsx watch`)                    |
| `npm run build`          | Frontend type-check + production build         |
| `npm run build:server`   | API production build (`server/dist`)            |
| `npm run start:server`   | Run the built API (`node server/dist/server.js`)|
| `npm run typecheck`      | Type-check frontend + server                   |
| `npm run lint`           | ESLint (frontend + server)                     |
| `npm run generate:prisma`| Generate Prisma Client (needed after install)  |

Fresh clone: `npm install`, then `npm run generate:prisma`. Health check:
`GET http://localhost:4000/api/v1/health`.

## Branding

School name/logo/contact are placeholders ("Bright Future International School")
and isolated so they can be replaced at delivery time without restructuring.

## Engineering rulebook

`AGENTS.md` is the binding engineering constitution for this repository
(architecture, boundaries, security, validation, definition of done). Change it
only with a concrete reason.