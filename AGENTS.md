# AGENTS.md

Guidance for AI agents and developers working on this repository.

**Start with [`DOCS.md`](DOCS.md)** — the wayfinding map showing what lives in this repo vs the CRS repo, with the "owns vs delegates" rules.

## Documentation hygiene

- Keep only **living** docs in the tree: architecture, ADRs, feature docs, tech-debt, onboarding, and the `README`/`AGENTS`/`DOCS` indexes — things that describe **how the system works now**.
- Do **not** commit **historical working artifacts** — design briefs, implementation/redesign plans, prep analyses, iteration change-logs, mockups, or one-off PR-review records. Once the work ships, that context already lives in the **PR and git history**; a completed plan left in the tree only rots, drifts, and misleads. Delete it as part of landing the feature.
- Rule of thumb: if a doc describes *how a specific change was made* (a plan, a prep pass, a review record — usually past tense or a dated title) rather than *how the system behaves*, it doesn't belong in `docs/`. When in doubt, it goes in the PR description, not the repo.

## Search & Context Efficiency

- Backend Kotlin lives in `src/`, the SPA in `frontend/src/`. Scope searches to one of those — don't sweep the whole tree.
- Do **not** read or grep generated/heavy dirs: `node_modules/`, `frontend/node_modules/`, `.gradle/`, `.kotlin/`, `frontend/dist/`, `frontend/playwright-report/`, `frontend/test-results/`, `frontend/.vite/`, `.idea/`. They are gitignored (so `rg`/Grep skip them) and direct `Read` is denied in `.claude/settings.json`.
- **Exception — stay readable:** `build/` and `frontend/build/` are gitignored (skipped by search) but **not** `Read`-denied, because they hold the reports agents legitimately consult (`build/reports/**`, `frontend/build/reports/coverage`, `frontend/build/test-results`).
- **Git worktrees live *beside* the repo, not inside it** — create them under `../octopus-components-management-portal-wt/<name>` (matches CRS). A nested worktree tree inside the repo root confuses IDE indexing, Gradle, and Docker build context; `_wt/` stays gitignored + `Read`-denied only as a defensive net in case one is created there by old habit.

## Architecture

- Portal-side summary with file paths: [`docs/architecture.md`](docs/architecture.md) and Portal ADR [`docs/adr/001-spring-cloud-gateway-bff.md`](docs/adr/001-spring-cloud-gateway-bff.md).
- Canonical decision (rationale, trade-offs, separate-repo decision): CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/012-portal-architecture.md).

**In brief:** Spring Cloud Gateway (WebFlux) BFF + React 19 SPA bundled into the same JAR. Browser JS calls `/rest/**` on the same origin — the portal proxies to `components-registry-service` with TokenRelay. Browser auth is OAuth2 Login (cookie session); CSRF is plain double-submit; SPA fallback serves `index.html` for non-API GETs.

## Change discipline

Generic agent craft — investigate first, keep changes focused, verify honestly — belongs in a personal engineering baseline, not here. This section is only what's **Portal-specific** or worth pinning to a concrete gate.

- **CRS owns business behavior and the REST contract** — don't guess or re-derive it in Portal. Treat [`DOCS.md`](DOCS.md), CRS docs, and the vendored OpenAPI spec (`frontend/src/lib/api/v4.json`) as the source of truth. Enforced formatter/linter/typechecker rules outrank incidental local style.
- **Don't silently swallow unexpected failures.** At the outbound-service, polling/background, and BFF **transport** boundaries, any intentional fail-soft must leave an observable result or log and be covered by a focused test. A local `value ?? fallback` doesn't need the ceremony.
- **Verify the affected behavior first, then run the gate relevant to what you changed** — `./gradlew qualityStatic` / `qualityCoverage` for the SPA, `./gradlew test` / `build` for backend Kotlin (see [Build Commands](#build-commands)). Report skipped or environment-blocked checks explicitly.

## Portal invariants

Load-bearing rules; preserve them. The tag shows **how each is actually enforced** — prose-only ones are review-critical because nothing catches a violation automatically.

- **OpenAPI types are generated — never hand-edit `frontend/src/lib/api/schema.d.ts` or `frontend/src/lib/api/v4.json`.** Refresh through the documented workflow (`npm run vendor-spec`) and keep the two in sync with CRS. *[gate: `generate-types:check` + `vendor-spec:check` in `merge-gate.yml`]*
- **Browser code must never receive or persist OAuth access tokens.** Preserve same-origin `/rest/**`, server-side TokenRelay, and the double-submit CSRF model (see [`docs/architecture.md`](docs/architecture.md)). *[BFF routing + CSRF are partly covered by config and WebFlux tests; the no-token-in-the-browser guarantee itself has no automated check — review-critical]*
- **Admin mode is a UX gate only** — real authorization lives in CRS (`@PreAuthorize`), a **separate repo**; Portal only gates the UX (a client-side double-check). Never treat it as a security boundary. *[enforced in CRS, not here — confirm the server-side check exists rather than relying on the UX gate]*
- **External calls and polling stay bounded** by explicit timeout / concurrency; add retries or caching only where the failure and staleness semantics are understood. *[partly config — feature-specific validation budgets in `application.yaml`, React Query `staleTime`/retry per hook; there is no blanket enforcement of all outbound calls, so new call paths are review-critical]*
- **Living-docs discipline** — when behavior, config, or architecture changes, update the owning document in the same change; don't add plans or historical records (see [Documentation hygiene](#documentation-hygiene)). *[prose-only]*

## Features

- [`docs/features/component-list.md`](docs/features/component-list.md) — list page filters incl. owner dropdown (B7.1.1).
- [`docs/features/component-detail.md`](docs/features/component-detail.md) — tabs, rename gating (B7.1.4), parent autocomplete (B7.1.5), conflict UX (B7.1.6).
- [`docs/features/audit-log.md`](docs/features/audit-log.md) — global feed filters (B7.1.3) + per-component History tab (B7.1.2).
- [`docs/features/admin-migration.md`](docs/features/admin-migration.md) — async `/admin/migrate` flow.
- [`docs/features/admin-mode.md`](docs/features/admin-mode.md) — UX-only switch gating destructive actions.
- [`docs/features/admin-tc-resync.md`](docs/features/admin-tc-resync.md) — admin TeamCity resync flow (`IMPORT_DATA` permission).
- [`docs/features/app-footer.md`](docs/features/app-footer.md) — anonymous build-info on both Portal and CRS sides.

## Tech debt

[`docs/tech-debt/`](docs/tech-debt/): TD-001 Playwright Keycloak fixture, TD-002 OpenAPI types, TD-003 persisted session store, TD-004 TLS Ingress migration (done), TD-005 schema-v2 migration follow-ups.

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
