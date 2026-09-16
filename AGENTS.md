# AGENTS.md

Guidance for AI agents and developers working on this repository.

**Start with [`DOCS.md`](DOCS.md)** — the wayfinding map showing what lives in this repo vs the CRS repo, with the "owns vs delegates" rules.

## Spec-first

Behaviour is agreed in writing **before** it is implemented. The `spec / gate`
check in [`merge-gate.yml`](.github/workflows/merge-gate.yml) enforces two things
on every PR:

- **spec-delta** — a PR touching shipped behaviour must also touch a spec.
  Behaviour is `src/main/{kotlin,resources}/**` (the BFF, including the gateway
  routes and security config), `frontend/src/**`, `frontend/vite.config.ts` and
  `frontend/index.html`. Excluded: `*.test.*`, `frontend/src/test/**` and
  `frontend/src/test-fixtures/**`, and the generated
  `frontend/src/lib/api/{schema.d.ts,v4.json}`. A spec is `docs/features/**`,
  `docs/architecture.md`, `docs/adr/**`, or `openspec/**`.
- **spec-first** — the first commit touching a spec must come **strictly before**
  the first commit touching behaviour. A spec written in the same commit as the
  code, or after it, is a record of what got built rather than an agreement about
  what to build, and fails the gate.

Practical consequence: commit the spec on its own, get it agreed, then implement.
If you squash locally, re-split before pushing — GitHub's squash-on-merge is fine,
the gate reads branch commits, not the merge result.

**Spec and implementation belong in the same PR.** The spec goes in first as its
own commit and is reviewed before the code is written; the code then lands on
the same branch. Merging a spec-only PR and implementing in the next one walks
into the gate: that second PR changes behaviour and touches no spec, so it is
blocked, and reaching for `no-spec-impact` there would be a lie. If a spec
genuinely has to merge on its own — a proposal nobody is building yet — then the
implementing PR must open with the commit that folds the delta into
`openspec/specs/` and archives the change, so a spec commit still precedes the
first behaviour commit.

**Escape hatch:** apply the `no-spec-impact` label for changes with no
observable behaviour (refactor, tests, build/CI, dependency bumps). It skips
both checks. Nothing in the PR body opts out — a label is structured, visible on
the PR, recorded in the timeline, and can be applied by a reviewer rather than
only self-declared. Use it honestly; it is the only thing standing between this
gate and the drift it exists to stop.

The gate script is [`.github/scripts/spec-gate.sh`](.github/scripts/spec-gate.sh),
configured entirely by environment so it stays byte-identical with the CRS copy;
its suite (`spec-gate.test.sh`) runs in the same job.

## Documentation hygiene

- Keep only **living** docs in the tree: architecture, ADRs, feature docs, tech-debt, onboarding, and the `README`/`AGENTS`/`DOCS` indexes — things that describe **how the system works now**.
- **`openspec/` is the one exception, and it is structured.** In-flight change proposals live in `openspec/changes/<id>/`; on completion the delta is applied to `openspec/specs/` and the change folder moves to `openspec/archive/`. The archive is kept deliberately: it is the decision record for *why* a behaviour is the way it is, which the specs themselves do not carry.
- Do **not** commit **ad-hoc working artifacts** anywhere else — design briefs, implementation/redesign plans, prep analyses, iteration change-logs, mockups, or one-off PR-review records dropped into `docs/`. A loose plan in `docs/` has no lifecycle: nothing applies it, nothing retires it, so it rots and misleads. If a change is worth planning in the tree, plan it in `openspec/changes/`, where the lifecycle is enforced; otherwise it goes in the PR description.
- Rule of thumb: `docs/` and `openspec/specs/` describe *how the system behaves*; `openspec/changes/` describes *what we are about to change*; `openspec/archive/` describes *what we changed and why*. A doc that fits none of those three does not belong in the repo.

## Search & Context Efficiency

- Backend Kotlin lives in `src/`, the SPA in `frontend/src/`. Scope searches to one of those — don't sweep the whole tree.
- Do **not** read or grep generated/heavy dirs: `node_modules/`, `frontend/node_modules/`, `.gradle/`, `.kotlin/`, `frontend/dist/`, `frontend/playwright-report/`, `frontend/test-results/`, `frontend/.vite/`, `.idea/`. They are gitignored (so `rg`/Grep skip them) and direct `Read` is denied in `.claude/settings.json`.
- **Exception — stay readable:** `build/` and `frontend/build/` are gitignored (skipped by search) but **not** `Read`-denied, because they hold the reports agents legitimately consult (`build/reports/**`, `frontend/build/reports/coverage`, `frontend/build/test-results`).
- **Git worktrees live *beside* the repo, not inside it** — create them under `../octopus-components-management-portal-wt/<name>` (matches CRS). A nested worktree tree inside the repo root confuses IDE indexing, Gradle, and Docker build context; `_wt/` stays gitignored + `Read`-denied only as a defensive net in case one is created there by old habit.

## Architecture

- Portal-side summary with file paths: [`docs/architecture.md`](docs/architecture.md) and Portal ADR [`docs/adr/001-spring-cloud-gateway-bff.md`](docs/adr/001-spring-cloud-gateway-bff.md).
- Canonical decision (rationale, trade-offs, separate-repo decision): CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/main/docs/registry/adr/012-portal-architecture.md).

**In brief:** Spring Cloud Gateway (WebFlux) BFF + React 19 SPA bundled into the same JAR. Browser JS calls `/rest/**` on the same origin — the portal proxies to `components-registry-service` with TokenRelay. Browser auth is OAuth2 Login (cookie session); CSRF is plain double-submit; SPA fallback serves `index.html` for non-API GETs.

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
