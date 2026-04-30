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
