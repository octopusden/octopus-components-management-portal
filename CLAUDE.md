# CLAUDE.md

See [AGENTS.md](./AGENTS.md) for architecture, build commands, and testing guidelines.

## UI Stack

React 19 + Vite + shadcn/ui (Radix UI + Tailwind CSS 4 + CVA) + React Hook Form + Zod + TanStack Table + Zustand + react-router 7.
Decision: CRS [ADR-003 — UI stack](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/003-ui-stack-react19.md).

## Key Documentation

Portal docs index: [DOCS.md](./DOCS.md). Canonical cross-repo decisions live in CRS (`octopus-components-registry-service`, branch `main`, path `docs/registry/`):
- CRS [ADR-003](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/003-ui-stack-react19.md) — UI stack choice
- CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/012-portal-architecture.md) — portal as a separate repo + BFF / transparent-proxy boundary
- Portal-side BFF summary [`docs/adr/001-spring-cloud-gateway-bff.md`](docs/adr/001-spring-cloud-gateway-bff.md) and implementation guide [`docs/architecture.md`](docs/architecture.md)

## Project Status

MVP in active development. Prioritize features over refactoring.
