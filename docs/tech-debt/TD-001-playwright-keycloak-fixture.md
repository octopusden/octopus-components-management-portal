# TD-001: Authenticated Playwright Keycloak fixture

## Status

Open.

## Context

The portal has one Playwright spec that exercises the BFF auth flow end-to-end: `frontend/e2e/admin-migration.spec.ts`. It needs the browser to land on `/admin` with a real authenticated session — same-origin cookie, signed JWT bearer forwarded by TokenRelay, the works. Other specs (`smoke-admin.spec.ts`, `regression-components-list.spec.ts`, the visual suite) need the same setup.

Today the fixture is `frontend/e2e/auth.setup.ts`. It scripts the OIDC authorization-code flow against the testcontainers Keycloak from `infra/dev/keycloak/portal-realm-dev.json`, persists the session via Playwright's `storageState`, and feeds it to every `*.spec.ts` that needs auth. It works for the journeys we run today but carries a few sharp edges:

- **Form-action encoding drift.** Keycloak's login form posts to a URL whose `action` attribute contains HTML entities (`&amp;`); a single-pass `decodeURIComponent` would mis-handle this. The fixture relies on a single-pass decode that was hardened in `3e74608` and validated only by spec runs. The next Keycloak bump can break this without changing observable behaviour in the auth.setup itself.
- **No JIT user provisioning.** The fixture assumes the user exists in the realm at startup; new realms need the test user added manually. We tolerate this because `portal-realm-dev.json` is checked in, but it makes adding new role-based journeys awkward.
- **No coverage of the post-token-expiry path.** `ClientAuthorizationException` handling in `ApiClientAuthorizationFailureFilter` is unit-tested but never run end-to-end; the fixture has no hook to force the access token's `exp` to land in the past.

## Symptoms (when this will hurt)

- A Keycloak version bump that changes `action` URL encoding will fail every authenticated spec with `auth.setup` itself going green — fragile signal.
- Adding a journey for a new role (e.g. `ROLE_AUDITOR`) requires editing both `portal-realm-dev.json` *and* the auth.setup. There is no helper that says "give me a logged-in browser with role X".
- The optimistic-locking conflict UX, rename gate, and TLS migration smoke (TD-004) all need authenticated traversal of multi-step flows we can't yet script reliably.

## Acceptance criteria

1. A helper API — call site shape `loginAs({ roles: ['IMPORT_DATA', 'EDIT_COMPONENTS'] })` — that returns a Playwright `BrowserContext` with a valid session and the requested role mapping, creating the realm user on demand.
2. A token-expiry helper — `expireAccessToken(context)` — that fast-forwards the BFF session's token so the next XHR exercises the `ApiClientAuthorizationFailureFilter` path.
3. Decoupling from `frontend/e2e/auth.setup.ts`'s single-pass decode: the helper drives the OIDC dance through HTTP, not by parsing the login HTML.
4. Existing specs (`admin-migration.spec.ts`, `smoke-admin.spec.ts`, `regression-components-list.spec.ts`) migrate to the helper without behaviour changes.

## Related

- [`docs/architecture.md`](../architecture.md) §"Limits and known gaps" — flags this as the e2e coverage gap.
- [`docs/features/admin-migration.md`](../features/admin-migration.md) §"E2E: not yet" — the canonical caller of this gap.
- `frontend/e2e/admin-migration.spec.ts` — current journey that exercises the existing setup.
- `frontend/e2e/auth.setup.ts` — current Playwright auth fixture (single-pass form-action decode lives here).
