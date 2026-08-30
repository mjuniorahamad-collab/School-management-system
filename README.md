# School Management System

A premium, production-oriented School Management System for a real school client.
Current milestone: **premium admin dashboard foundation**.

## Stack (frontend — current milestone)

- React 19 + Vite + TypeScript
- Tailwind CSS 4 + shadcn/ui (Radix primitives)
- React Router 7
- TanStack Query 5
- Recharts 3
- Lucide React icons

## Structure

```
src/
  app/          Application composition: providers, route tree
  routes/       Single source of truth for navigation + routing
  components/
    layout/     Shell: sidebar, header, containers
    dashboard/  Dashboard widgets
    charts/     Recharts wrappers
    dialogs/    Workflow dialogs
    ui/         shadcn/ui primitives
  pages/        Route pages
  data/         TEMPORARY mock data (clearly labeled, never in UI components)
  services/     Service facade — components talk to this, never to mock data
  hooks/        Data/composition hooks
  types/        Domain types
  lib/          Utilities (formatting, cn, etc.)

server/         Reserved for the future Express + Prisma + PostgreSQL API
```

## Data architecture

```
UI components
   └─ hooks (useDashboardData) → services (dashboardService)
         └─ data layer (mock now → REST API + database later)
```

Components never import mock data directly. Replace the service implementation
with fetch calls later without touching the UI.

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — type-check + production build
- `npm run lint` — ESLint
- `npm run preview` — preview production build

## Branding

School name/logo/contact are placeholders ("Bright Future International School")
and isolated so they can be replaced at delivery time without restructuring.