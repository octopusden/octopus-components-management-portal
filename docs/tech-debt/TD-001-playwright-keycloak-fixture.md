# TD-001: Playwright Keycloak fixture for authenticated e2e

## Status

Open

## Context

The portal's `frontend/e2e/` currently contains only `smoke.spec.ts`, which
hits the gateway at `process.env.BASE_URL || 'http://localhost:8090'` and
assumes the request is routable without authentication. Since the
Keycloak rollout (`merge: integrate Keycloak auth (feature/keycloak-auth) into develop`,
commit `f9b06cc`), every backend route except the explicit `permitAll` set
(`/assets/**`, `/favicon.ico`, `/vite.svg`, `/actuator/health/**`,
`/logout/connect/back-channel/**`, plus `/portal/info` and `/rest/api/4/info`
added on this branch) demands a live OIDC session. Playwright has no
fixture that establishes one — there is no `auth.setup.ts`, no
`storageState` config in `playwright.config.ts`, no `globalSetup` that
performs the authorization code flow against a stand-in Keycloak.

## Why this matters now

The `/admin` Migration tab introduced on `feature/admin-migration-ui`
(this branch) has four user journeys that are best covered by e2e:

1. Admin user with `IMPORT_DATA` lands on `/admin` → sees the Migration
   tab + the Admin-mode switch in the footer + the version line
   `(portal X · service Y)`.
2. Admin toggles Admin mode → "Run migration" button enables → click →
   confirm dialog → mutation completes → 4 result tiles render.
3. Admin without Admin mode toggled sees the disabled button + helper
   text "Enable Admin mode in the footer to run migration."
4. Non-admin user has no AdminPane in footer; navigating to `/admin`
   redirects to `/components` per `RequirePermission`.

Each of those is exercised at unit / integration level today
(`MigrationPanel.test.tsx`, `AdminSettingsPage.test.tsx`,
`AppFooter.test.tsx`, `RequirePermission.test.tsx`) but not against a
real Keycloak/portal/CRS stack.

## Proposed work

1. Add `frontend/e2e/auth.setup.ts` that signs in via the OIDC authorization
   code flow against a docker-compose Keycloak fixture (see CRS
   `docker-compose.yml` for an existing realm + user setup), persisting
   the resulting session cookies into `playwright/.auth/<role>.json`.
2. Update `playwright.config.ts` with two projects:
   - `chromium-admin` — `storageState: 'playwright/.auth/admin.json'`
   - `chromium-viewer` — `storageState: 'playwright/.auth/viewer.json'`
3. Add `frontend/e2e/admin-migration.spec.ts` covering the four
   journeys above; the spec should stub the migration backend
   (`POST /rest/api/4/admin/migrate`) at the network level via
   `page.route` so the test does not actually run a multi-minute
   migration against a live testcontainer.
4. Wire the e2e job into CI alongside (or after) `qualityCoverage`.
   Today `./gradlew build` does not invoke Playwright; the docker-compose
   stack is also needed for the Keycloak fixture.

## Out of scope

- Rewriting the existing `smoke.spec.ts` — it remains a useful unauthenticated
  baseline. After this TD lands it can move under the `chromium-viewer`
  project so it runs with a viewer session.
- Cross-pod / multi-environment auth flows (PKCE variants, refresh-token
  rotation tests). The fixture only needs to prove that an authenticated
  session reaches the SPA and that role gating behaves as expected.

## References

- Branch `feature/admin-migration-ui` (this branch) introduces the
  `/admin` Migration tab and the Admin-mode footer toggle that this
  TD's e2e spec would cover.
- CRS `MIG-024` (`AdminControllerV4SecurityTest`) pins the security
  contract on the backend; this TD covers the corresponding browser
  flow.
- The plan `~/.claude/plans/agile-chasing-pnueli.md` § "E2E (Playwright)"
  explicitly defers e2e until the Keycloak fixture is in place.
