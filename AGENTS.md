# AGENTS.md

Guidance for AI agents and developers working on this repository.

**Start with [`DOCS.md`](DOCS.md)** — the wayfinding map showing what lives in this repo vs the CRS repo, with the "owns vs delegates" rules.

## Architecture

- Portal-side summary with file paths: [`docs/architecture.md`](docs/architecture.md) and Portal ADR [`docs/adr/001-spring-cloud-gateway-bff.md`](docs/adr/001-spring-cloud-gateway-bff.md).
- Canonical decision (rationale, trade-offs, separate-repo decision): CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/012-portal-architecture.md).

**In brief:** Spring Cloud Gateway (WebFlux) BFF + React 19 SPA bundled into the same JAR. Browser JS calls `/rest/**` on the same origin — the portal proxies to `components-registry-service` with TokenRelay. Browser auth is OAuth2 Login (cookie session); CSRF is plain double-submit; SPA fallback serves `index.html` for non-API GETs.

## Features

- [`docs/features/component-list.md`](docs/features/component-list.md) — list page filters incl. owner dropdown (B7.1.1).
- [`docs/features/component-detail.md`](docs/features/component-detail.md) — tabs, rename gating (B7.1.4), parent autocomplete (B7.1.5), conflict UX (B7.1.6).
- [`docs/features/audit-log.md`](docs/features/audit-log.md) — global feed filters (B7.1.3) + per-component History tab (B7.1.2).
- [`docs/features/admin-migration.md`](docs/features/admin-migration.md) — async `/admin/migrate` flow.
- [`docs/features/admin-mode.md`](docs/features/admin-mode.md) — UX-only switch gating destructive actions.
- [`docs/features/app-footer.md`](docs/features/app-footer.md) — anonymous build-info on both Portal and CRS sides.

## Tech debt

[`docs/tech-debt/`](docs/tech-debt/): TD-001 Playwright Keycloak fixture, TD-002 OpenAPI types, TD-003 persisted session store, TD-004 TLS Ingress migration (deadline 2026-05-07).

## Local dev stack

Canonical recipe: shipping comment block at the top of [`infra/dev/docker-compose.yml`](infra/dev/docker-compose.yml).

It documents: one-time `/etc/hosts` setup (`127.0.0.1 keycloak`), `.env` from `.env.example`, bringing the stack up via `./up.sh up -d`, launching the BFF via `./gradlew bootRun` with the right `AUTH_SERVER_*` and `SPRING_CLOUD_*` env, running the SPA via `npm run dev` on `:5173`, and a "Gotchas" section covering the legacy `docker-compose` fallback, the Keycloak healthcheck quirk, `.env` not propagating to git worktrees, Flyway migration churn, and the BFF host-run Spring-Cloud-Config opt-outs. The Gotchas section ends with a smoke-quickcheck — what to visually confirm after the stack is up.

Default credentials (substituted into the realm from `.env`): `e2e-admin` / `$E2E_ADMIN_PASSWORD` (admin), `e2e-viewer` / `$E2E_VIEWER_PASSWORD` (viewer).

## Build Commands

```bash
# Full build (includes frontend)
./gradlew build

# Backend only (skip frontend)
./gradlew build -x npmCi -x npmBuild -x copyFrontendDist

# Run tests
./gradlew test

# Frontend lint + typecheck
./gradlew qualityStatic

# Frontend test coverage
./gradlew qualityCoverage
```

## Testing

- Kotlin tests: `src/test/kotlin/`
- Frontend tests: `frontend/src/**/*.test.tsx`
- Test fixtures (static assets for WebFlux tests): `src/test/resources/static/`

When writing tests, always write a failing test first that reproduces the bug,
then fix the production code until the test passes.
