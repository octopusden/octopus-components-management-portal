# Portal Architecture

> **Canonical decision:** CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/012-portal-architecture.md). This document describes how Portal implements its side of that contract — what files and which choices, with pointers into the source.

## Why this repo exists

The Portal lives in its own repository because the UI was extracted from CRS in April 2026. Previously the React/Vite SPA lived as the `components-registry-ui/` Gradle module inside the CRS repo; in PR #147 (commit `26278f29`) the module was deleted from CRS and the UI moved here, with a Spring Cloud Gateway BFF in front. The reversal of the earlier "single-repo, embedded JAR" recommendation is explained in CRS [ADR-012](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/012-portal-architecture.md), which is the canonical decision record; CRS [ADR-009](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/009-ui-repository-strategy.md) (Superseded) carries the pre-reversal analysis.

## Request flow

```
┌──────────────────────────────────────────────┐
│  Browser (React 19 SPA, Vite build, served   │
│  from classpath:/static by this JAR)         │
└──────────────────────┬───────────────────────┘
                       │ same-origin, cookie-based session
                       │ + X-XSRF-TOKEN (CSRF) on mutating calls
                       ▼
┌──────────────────────────────────────────────┐
│  Portal (Spring Cloud Gateway + WebFlux)     │
│  ┌───────────────────────────────────────┐   │
│  │ SpaFallbackFilter                     │   │
│  │   GET /,    /admin, /audit, /…        │   │
│  │   → classpath:/static/index.html      │   │
│  ├───────────────────────────────────────┤   │
│  │ SecurityConfig (OAuth2 Login)         │   │
│  │   /oauth2/**, /login/**, /logout/**   │   │
│  │   → Keycloak authorization-code flow  │   │
│  ├───────────────────────────────────────┤   │
│  │ PortalInfoController                  │   │
│  │   GET /portal/info  (anonymous)       │   │
│  ├───────────────────────────────────────┤   │
│  │ Gateway routes (TokenRelay default)   │   │
│  │   /rest/**, /auth/**  → CRS           │   │
│  └───────────────────────────────────────┘   │
└──────────────────────┬───────────────────────┘
                       │ Authorization: Bearer <jwt>
                       │ (anonymous for /rest/api/4/info)
                       ▼
┌──────────────────────────────────────────────┐
│  components-registry-service (CRS)           │
│  OAuth2 Resource Server, @PreAuthorize       │
└──────────────────────────────────────────────┘
```

## Source files (the architecture lives here)

| Concern | File | Notes |
|---|---|---|
| Browser auth flow | [`src/main/kotlin/.../configuration/SecurityConfig.kt`](../src/main/kotlin/org/octopusden/octopus/components/portal/configuration/SecurityConfig.kt) | OAuth2 Login + delegating entry point, CSRF policy, permitAll list. |
| SPA fallback | [`src/main/kotlin/.../configuration/SpaFallbackFilter.kt`](../src/main/kotlin/org/octopusden/octopus/components/portal/configuration/SpaFallbackFilter.kt) | GET-only fallback to `index.html`. Exclusion list is the source of truth. |
| Anonymous build-info | [`src/main/kotlin/.../controller/PortalInfoController.kt`](../src/main/kotlin/org/octopusden/octopus/components/portal/controller/PortalInfoController.kt) | `GET /portal/info` → `{name, version}` from Spring Boot `BuildProperties`, plus optional `environmentLabel` (from `PORTAL_ENVIRONMENT_LABEL`, e.g. `TEST` on QA) rendered as a header badge by the SPA; key omitted when unset, so prod keeps the original body. |
| Gateway routes + TokenRelay | [`src/main/resources/application.yaml`](../src/main/resources/application.yaml) | `/rest/**`, `/auth/**` proxied to CRS, default-filter TokenRelay. |
| Static asset serving | [`src/main/kotlin/.../configuration/WebConfig.kt`](../src/main/kotlin/org/octopusden/octopus/components/portal/configuration/WebConfig.kt) | Caching headers for hashed Vite assets vs. uncached `index.html`. |

## BFF pattern (browser ⇄ portal session, portal ⇄ CRS bearer)

The portal is a **BFF**: the browser holds a server-side session via OAuth2 Login, the portal stores the access token, Gateway's `TokenRelay` default-filter stamps `Authorization: Bearer <token>` on outgoing calls when a route matches an authenticated request.

Practical implications:

- The browser **never sees the JWT.** It sends a session cookie + an `X-XSRF-TOKEN` header on mutating calls.
- CRS sees a clean bearer token from the gateway. It cannot tell that a particular call originated in a browser session vs. a direct Feign client (and does not care).
- Direct Feign consumers (DMS, JIRA utils, etc.) keep talking to CRS without going through the portal at all. The portal is only on the browser path.

## Auth entry-point split (401 for API, 302 for navigation)

`SecurityConfig` registers a `DelegatingServerAuthenticationEntryPoint`:

- **`/rest/**` and `/auth/**`** → `HttpStatusServerEntryPoint(401)`. The SPA's `frontend/src/lib/api.ts` 401-handler fires cleanly (e.g. surfaces a "session expired" toast / redirects via JS) without the noise of a `Location: /oauth2/authorization/keycloak` round-trip baked into a fetch response.
- **anything else** → `RedirectServerAuthenticationEntryPoint("/oauth2/authorization/keycloak")`. Typed-URL navigations (`https://portal/components/foo`) start the OIDC dance.

This is wired **after** `oauth2Login(Customizer.withDefaults())` so the delegating entry point overrides Spring Security's default redirect-everywhere behaviour. See `SecurityConfig.kt` — the `delegatingEntryPoint` is built starting at line 73 and wired via `.exceptionHandling { … }` at line 109.

## CSRF policy: plain double-submit, NOT XOR

Because authentication is a session cookie, mutating cross-origin calls could ride the user's session. We protect with double-submit:

```
request → SpA reads XSRF-TOKEN cookie (HttpOnly=false)
        → echoes the value verbatim in X-XSRF-TOKEN header
        → server matches header against cookie
```

The handler is `ServerCsrfTokenRequestAttributeHandler` (the **plain** one), not `XorServerCsrfTokenRequestAttributeHandler` (the default since Spring Security 5.8 with BREACH mitigation).

**Why plain, not XOR?** The XOR handler emits a different token in the cookie than it expects in the header — the SPA reading the cookie raw and echoing it raw would 403 on every non-safe request. The full inline rationale is in `SecurityConfig.kt` lines 124–131 (inside the `.csrf { csrf -> … }` block) — do not "modernize" that block back to the default.

A `csrfCookieWebFilter` bean (also in `SecurityConfig.kt`) materialises the token on every request so the cookie is set on first load, before the SPA has anything to echo.

## SPA fallback: which paths fall through to backend?

`SpaFallbackFilter` runs as a `WebFilter` and serves `classpath:/static/index.html` for any **GET** that is not API, asset, OIDC, or actuator. The exclusion list is the source of truth:

```
SpaFallbackFilter excludes (passes through to backend, not to SPA):
  /rest/        → Gateway → CRS
  /auth/        → Gateway → CRS (covers /auth/me)
  /portal/      → PortalInfoController and any future portal-local endpoint
  /actuator/    → Spring Boot Actuator
  /login        and /login/...    → OAuth2 Login
  /oauth2       and /oauth2/...   → Spring Security OAuth2
  /logout       and /logout/...   → Spring Security logout (incl. back-channel)
  /assets/      → Vite-built hashed assets
  /favicon.ico  /vite.svg  /index.html
  any path with a "."   → static asset, not an SPA route
```

**Adding a new top-level backend prefix?** Update `SpaFallbackFilter` *and* the permit-all set in `SecurityConfig` together. The two lists must agree on what is a backend route vs. an SPA route, and they're the most likely thing to drift. The exact same prefix list also has to be reflected in the SPA's `frontend/src/lib/api.ts` if the SPA is going to call it.

## Coupling with CRS

| Direction | Endpoint prefix | Auth shape |
|---|---|---|
| Portal → CRS (proxied) | `/rest/**` | TokenRelay forwards `Authorization: Bearer …` from session. |
| Portal → CRS (proxied) | `/auth/**` | TokenRelay; CRS expects auth on `/auth/me`. |
| Portal → CRS (anonymous) | `/rest/api/4/info` | `permitAll` on both sides. Footer build label. |
| Portal-only | `/portal/info` | `permitAll`. Portal build label. |
| Portal-only | `/oauth2/**`, `/login/**`, `/logout/**` | OIDC dance. |

Anonymous endpoints are deliberate on both sides — see CRS ADR-012 §"Boundary contract" and `WebSecurityConfig.kt` on the CRS side.

### Specific endpoints consumed by the SPA (B7.1)

The P1 UI features rely on these CRS endpoints (all behind the `/rest/**` proxy except `/auth/me` which sits under `/auth/**`):

| Endpoint | Used by | CRS contract |
|---|---|---|
| `GET /components?search=…&archived=…&owner=…&system=…&buildSystem=…&labels=…&page=…&size=…&sort=…` | List page filter sidebar (B7.1.1), parent autocomplete (B7.1.5) | `owner`, `system`, `buildSystem` are CSV with OR semantics (companion CRS PR binds `List<String>?`); `labels` is CSV with AND semantics; `archived` defaults to `false` (active only); pagination + sort are Spring Data conventions. `SYS-035` for `owner` baseline. |
| `GET /components/meta/owners` | Owner multi-select on the list page (B7.1.1), people input on detail | existing |
| `GET /components/meta/labels` | Labels multi-select on the list page | new CRS contract; mirrors `/meta/owners` (junction-sourced, distinct labels in use) |
| `GET /components/meta/systems` | System multi-select on the list page | new CRS contract; mirrors `/meta/owners` (junction-sourced, distinct systems in use) |
| `GET /components/meta/build-systems` | Build System multi-select on the list page (fallback when admin field-config has no options) | existing CRS enum endpoint |
| `GET /components/meta/systems/dictionary` | Editor multi-select on the detail page: full systems dictionary (not just in-use values) | new CRS contract; distinct from `/meta/systems` which surfaces junction-sourced in-use values for the filter bar |
| `GET /components/meta/labels/dictionary` | Editor multi-select on the detail page: full labels dictionary (not just in-use values) | new CRS contract; distinct from `/meta/labels` which surfaces junction-sourced in-use values for the filter bar |
| `GET /components/{idOrName}` | Detail page fetch (UUID first, name fallback) | existing |
| `PATCH /components/{id}` with `name` | Rename (B7.1.4) | `canRenameComponent` SpEL |
| `PATCH /components/{id}` with `parentComponentName` | Parent autocomplete save (B7.1.5) | `canEditComponent` |
| `GET /audit/Component/{id}` | Per-component History tab (B7.1.2) | existing |
| `GET /audit/recent?changedBy=&source=&action=&from=&to=` | Audit-log filter sidebar (B7.1.3) | `SYS-036` |
| `GET /rest/api/2/common/supported-groups` | Create Component dialog: allowed groupId prefixes (auto-suggest + validation gate) | existing CRS v2 endpoint; lives outside `/rest/api/4`, reached via `apiAbsolute` helper |

When a new endpoint is consumed, **add a row here** so the boundary stays reviewable. Cross-repo links between living indexes (this `architecture.md` and CRS docs) may use the active branch (`v3` for CRS, `develop` for Portal) per [`DOCS.md`](../DOCS.md) authoring rule #5.

## Limits and known gaps

- **Session store is in-memory.** Pod restart logs every browser user out. Tracked as [`TD-003`](tech-debt/TD-003-persisted-session-store.md).
- **Frontend types are hand-written**, not generated from CRS OpenAPI. Drift risk. Tracked as [`TD-002`](tech-debt/TD-002-openapi-types.md) (mirror of CRS TD-004).
- **Authenticated e2e is missing.** Only `frontend/e2e/smoke.spec.ts` runs unauthenticated. Tracked as [`TD-001`](tech-debt/TD-001-playwright-keycloak-fixture.md).
- **TLS termination is inline on the prod Route**, with a cert that expires 2026-05-07. Migration to Ingress + shared wildcard Secret tracked as [`TD-004`](tech-debt/TD-004-tls-ingress-migration.md).

## See also

- CRS [ADR-012 — Portal architecture](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/012-portal-architecture.md) — canonical decision.
- CRS [ADR-004 — Keycloak auth](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/004-auth-keycloak.md) — role/permission matrix on the resource-server side.
- [`docs/features/admin-migration.md`](features/admin-migration.md) — async migration UX, the most coupled feature.
