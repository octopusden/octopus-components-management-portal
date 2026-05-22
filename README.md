# octopus-components-management-portal

Web portal for managing the F1 Components Registry. Browser-facing companion to `octopus-components-registry-service` (CRS).

## What it is

A Spring Cloud Gateway (WebFlux) BFF that:

- Authenticates the browser via Keycloak (OIDC authorization-code flow) and forwards bearer tokens to CRS using Gateway's TokenRelay.
- Hosts a React 19 + Vite SPA built into the same JAR (`/static/` resources) and serves it via `SpaFallbackFilter`.
- Exposes its own anonymous build-info endpoint at `/portal/info`. The complementary CRS endpoint at `/rest/api/4/info` is proxied via `/rest/**` and is also anonymous on both sides — both feed the footer.

The architectural rationale (why this lives in a separate repo from CRS, what each side owns) is in CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/012-portal-architecture.md). A short Portal-side summary lives at [`docs/adr/001-spring-cloud-gateway-bff.md`](docs/adr/001-spring-cloud-gateway-bff.md).

## Key features

- **Components list / detail / editor** — backed by CRS v4 API (`/rest/api/4/components/**`, `/audit-log`, `/admin/**`, `/config/**`). Six tabs per component: General, Build, VCS, Distribution, Jira, Escrow. Inline per-version field overrides.
- **Admin tab** at `/admin` (`AdminSettingsPage`): field config editor, component defaults editor, **Migration panel** (async).
- **Migration UX** (`docs/features/admin-migration.md`): one-click `POST /admin/migrate`; status polled at 1 Hz from `GET /admin/migrate/job`; live `currentComponent` + counters; result tiles on COMPLETED.
- **App footer** (`docs/features/app-footer.md`): portal + CRS build versions side-by-side; Admin-mode toggle.
- **Admin-mode UX gate** (`docs/features/admin-mode.md`): a UX-only switch persisted in localStorage that gates destructive actions in the SPA (real authorization is server-side via CRS `@PreAuthorize`).
- **Role-based access** via `RequirePermission` against the user record returned by `/auth/me`.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Kotlin + Spring Boot 3 / Spring Cloud Gateway (WebFlux) + Spring Security OAuth2 Client |
| Frontend | React 19, Vite 6, TanStack Query 5, react-router 7, react-hook-form + zod, shadcn/ui (Radix) + TailwindCSS 4, zustand 5 |
| Tests | Vitest (unit), Playwright (e2e — limited; see [TD-001](docs/tech-debt/TD-001-playwright-keycloak-fixture.md)) |
| Build | Gradle (single JAR; npm orchestrated via `./gradlew build`) |

## Local development

The recommended dev loop is Vite HMR with a proxy to a local CRS backend. No Gradle in the inner loop.

```sh
# 1) start CRS locally on :4567 (see CRS docs/registry/deployment/dev-run.md)
# 2) start the portal backend (gateway + security + /portal/info) on :8090
./gradlew bootRun

# 3) start the SPA dev server with proxy to the gateway
cd frontend
npm install
npm run dev   # → http://localhost:5173, proxies /rest/**, /auth/**, /login, /oauth2, /logout to :8090
              # NB: /portal is NOT in the Vite proxy today; the footer's portal-side
              # build label only renders against the bundled JAR (./gradlew bootRun).
```

For a one-shot full build that mirrors CI:

```sh
./gradlew build
```

For a backend-only build (skips npm install/build):

```sh
./gradlew build -x npmCi -x npmBuild -x copyFrontendDist
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — request flow, BFF pattern, CSRF policy, SPA fallback.
- [`docs/adr/`](docs/adr/) — Portal-specific ADRs (canonical decision is in CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/012-portal-architecture.md)).
- [`docs/features/`](docs/features/) — feature docs (admin-migration, admin-mode, app-footer).
- [`docs/onboarding/components-management-portal.md`](docs/onboarding/components-management-portal.md) — OKD/Vault/TeamCity deployment checklist.
- [`docs/tech-debt/`](docs/tech-debt/) — open tech-debt items (TD-001 e2e fixture, TD-002 OpenAPI types, TD-003 session store, TD-004 TLS migration).
- [`AGENTS.md`](AGENTS.md) — agent / developer build commands and testing notes.

## License

Internal (F1 / Open Way Group).
