# Portal ADR-001: Spring Cloud Gateway BFF — Portal-side summary

## Status
Accepted. **Canonical decision:** CRS [ADR-012 — Portal architecture](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/012-portal-architecture.md).

This document is **not a copy** of ADR-012. It is a short Portal-side summary that captures only what is specific to this repository — implementation choices, file paths, and obligations Portal accepts from the canonical decision. Rationale, trade-offs, and the Option-A-vs-B-vs-C analysis stay in CRS ADR-012.

## What Portal owns

- **Spring Cloud Gateway (WebFlux).** Routes `/rest/**` and `/auth/**` to CRS, with `default-filters: TokenRelay`. Configured in [`src/main/resources/application.yaml`](../../src/main/resources/application.yaml).
- **OAuth2 Login (BFF).** Browser session backed by Keycloak authorization-code flow. Implementation in [`src/main/kotlin/.../configuration/SecurityConfig.kt`](../../src/main/kotlin/org/octopusden/octopus/components/portal/configuration/SecurityConfig.kt). Keycloak registration id is `keycloak` (kept as `OIDC_REGISTRATION_ID` constant — must stay in sync with `frontend/src/lib/auth.ts`).
- **CSRF policy.** Cookie-based double-submit using the **plain** `ServerCsrfTokenRequestAttributeHandler` (NOT the XOR variant). Inline rationale in `SecurityConfig.kt` lines 96–107. Do not "modernize" back to default.
- **SPA fallback.** [`SpaFallbackFilter`](../../src/main/kotlin/org/octopusden/octopus/components/portal/configuration/SpaFallbackFilter.kt) serves `classpath:/static/index.html` for any GET that is not API, asset, OIDC, or actuator. The exclusion list is the source of truth — see [`docs/architecture.md`](../architecture.md) §"SPA fallback" for the full enumeration.
- **Anonymous endpoints (permit-all).** `/portal/info`, `/rest/api/4/info`, `/actuator/health` (and sub-paths), static assets, OIDC back-channel. Drives the always-mounted footer.
- **Auth entry-point split.** `/rest/**` and `/auth/**` → 401 (so the SPA `api.ts` 401-handler fires cleanly); everything else → redirect to `/oauth2/authorization/keycloak`.

## What CRS owns (and Portal relies on)

Portal does **not** authorize. It assumes:

- CRS validates the bearer token against the same Keycloak realm.
- CRS enforces `@PreAuthorize` on every protected endpoint (CRS [ADR-004](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/004-auth-keycloak.md), `WebSecurityConfig.kt`).
- CRS keeps `/rest/api/4/info` and `/auth/me` reachable on the contracts pinned in CRS [SYS-033](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/requirements-common.md) and `SYS-034`.
- CRS implements the async migration contract on the shape pinned in CRS [MIG-027](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/requirements-migration.md).

If any of those contracts move on the CRS side, this Portal must move with them — drift is the most likely thing to break the BFF and is the main cost of the separate-repo decision.

## What this document does NOT cover

For the following, read the canonical CRS ADR-012:

- Why the team chose Option A (separate repo) over Option B-2 (monorepo embedded JAR) recommended in CRS ADR-009.
- Risks and mitigations of separating the repos (OpenAPI drift, deploy coordination, atomic API+UI changes — see also [TD-002](../tech-debt/TD-002-openapi-types.md)).
- Boundary contract between Portal and CRS — which prefixes are proxied, which are anonymous on both sides.

## See also

- [`docs/architecture.md`](../architecture.md) — implementation guide with file paths.
- [`docs/features/admin-migration.md`](../features/admin-migration.md) — most coupled feature.
- CRS [ADR-004](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/004-auth-keycloak.md), [ADR-009](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/009-ui-repository-strategy.md) (Superseded), [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/adr/012-portal-architecture.md).
