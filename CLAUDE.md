# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for architecture, build commands, and testing guidelines.

## UI Stack

React 19 + Vite + shadcn/ui (Radix UI + Tailwind CSS 4 + CVA) + React Hook Form + Zod + TanStack Table + Zustand + react-router 7.
Decision: ADR-003 in `octopus-components-registry-service` (branch `v3-without-ui`).

## Key Documentation

Full docs in `octopus-components-registry-service` (branch `v3-without-ui`), path `docs/db-migration/`:
- ADR-003 — UI stack choice
- ADR-012 — portal as separate repo + transparent proxy
- TD-003 — planned BFF layer

## Project Status

MVP in active development. Prioritize features over refactoring.
