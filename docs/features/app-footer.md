# App Footer

## What it shows

Persistent footer rendered on every page (`AppFooter`):

- Build label, e.g. `Components Registry — portal 0.0.1 · service 4.7.2-SNAPSHOT` (graceful fallback to `portal ? · service ?` if either info call fails).
- **Admin-mode toggle** (`AdminPane`), visible only to users with the `IMPORT_DATA` permission. See [`admin-mode.md`](admin-mode.md).

## Source

- [`frontend/src/components/AppFooter.tsx`](../../frontend/src/components/AppFooter.tsx)
- [`frontend/src/components/AdminPane.tsx`](../../frontend/src/components/AdminPane.tsx)
- [`frontend/src/hooks/useInfo.ts`](../../frontend/src/hooks/useInfo.ts) — both info hooks.

## Backend contract

| Method | Path | Auth | Source |
|---|---|---|---|
| `GET` | `/portal/info` | Anonymous (`permitAll` on portal `SecurityConfig`). | Portal `PortalInfoController` (this app, served locally — not proxied). |
| `GET` | `/rest/api/4/info` | Anonymous on **both** sides — Portal `permitAll` + CRS `permitAll`. | CRS `InfoControllerV4` (proxied via `/rest/**` Gateway route). Contract: CRS [SYS-033](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/requirements-common.md). |

Both endpoints respond with the same base shape:

```ts
interface InfoResponse {
  name: string     // artifact name from build-info.properties
  version: string  // build version from build-info.properties
}
```

The portal side additionally returns an optional `environmentLabel?: string` —
runtime config from `portal.environment-label` (set per environment in
service-config; falls back to the `PORTAL_ENVIRONMENT_LABEL` env var for
local/dev runs; e.g. `TEST INSTANCE` on QA), rendered as a full-width warning
banner inside the sticky `Layout` header so non-prod instances are unmistakable
on every page. The key is omitted when unset, so production keeps the exact
`{name, version}` body.

## Why both ends are anonymous

The footer is mounted **before login** (the SPA's static shell is reachable anonymously, only `/auth/me` and protected API routes require a JWT). If `/rest/api/4/info` required auth, every anonymous browser would:

1. Render the footer.
2. Fire `useCrsInfo`.
3. Get a 401 from CRS.
4. The shared `api.ts` wrapper would normally redirect to `/oauth2/authorization/keycloak`.
5. The user lands in a login flow they didn't ask for.

To avoid that, both ends are explicitly `permitAll` and `useInfo.ts` uses **plain `fetch`** rather than the shared `api` wrapper — `api` redirects on 401, plain `fetch` doesn't. The inline comment in `useInfo.ts:4-12` explains the choice.

## Caching & failure handling

```ts
const QUERY_OPTIONS = {
  staleTime: Infinity,  // build info doesn't change for the lifetime of the page
  retry: false,         // a 5xx here should fail closed, not block the footer
}
```

- **`staleTime: Infinity`** — build info is constant per-pod, per-page-load. One round-trip, never stale within the SPA session.
- **`retry: false`** — if either endpoint 5xx's, the footer shows `?` for that side and moves on. The footer must not block on a transient network blip.

## Adding a new build-info field

If you add a field to `InfoResponse` (e.g. git SHA, build timestamp), update both:

1. CRS `InfoControllerV4.kt` (and the matching test for SYS-033).
2. Portal `PortalInfoController.kt`.

Then update `frontend/src/lib/types.ts` (`CrsInfo`, `PortalInfo`) and the consumers — `AppFooter.tsx` and `Layout.tsx` (environment banner) both read `PortalInfo`. The `portal-info*.contract.json` fixtures in `frontend/src/test-fixtures/` are asserted on both sides (`PortalInfoControllerTest` / `useInfo.test.ts`), so extend them too. Without OpenAPI generation today (see [TD-002](../tech-debt/TD-002-openapi-types.md)), this drift is otherwise manual and easy to miss.

## Tests

- `frontend/src/components/AppFooter.test.tsx` — render with/without info, fallback strings.
- `frontend/src/hooks/useInfo.test.ts` — fetch wiring, retry: false behavior on 5xx.
