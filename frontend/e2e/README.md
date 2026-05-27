# Playwright e2e — environment contract

`./gradlew e2eTest` is the single command. A Kotlin/JUnit5 driver brings
up Postgres + Keycloak + CRS + portal + Playwright — all as containers
on a shared docker network — and asserts the suite passes.

The whole stack lives inside docker. There are no host-side
prerequisites beyond Docker itself: no `/etc/hosts` entries, no fixed
ports, no host npm install. CI agents only need a reachable Docker
daemon and credentials for whichever registry hosts the CRS image.

## Containers and aliases

| Container   | Image                                              | Network alias    |
|-------------|----------------------------------------------------|------------------|
| Postgres    | `postgres:16`                                      | `crs-postgres`   |
| Keycloak    | `quay.io/keycloak/keycloak:24.0.3`                 | `keycloak`       |
| CRS         | `${crs.docker.registry}/.../components-registry-service:${crs.version}` | `crs` |
| Portal      | `eclipse-temurin:21-jre` + bind-mounted bootJar    | `portal`         |
| Playwright  | `mcr.microsoft.com/playwright:v1.60.0-jammy`       | (one-shot)       |

The single canonical Keycloak URL — `http://keycloak:8080` — resolves
identically for CRS, the portal, and the headless browser, because
docker DNS resolves the alias the same way for every container on the
shared network. JWT `iss` validation passes without any
trust-boundary gymnastics.

## CRS image source

The CRS image is pulled from `<registry>/octopusden/components-registry-service:<crs.version>`.
The registry is resolved at e2eTest time in this priority order — first
non-blank wins:

1. `CRS_DOCKER_REGISTRY` env var
2. `-Pcrs.docker.registry=...` (or `crs.docker.registry` in `gradle.properties`)
3. `DOCKER_REGISTRY` env var (TeamCity passes its `%DOCKER_REGISTRY%` parameter here)
4. `-Pdocker.registry=...`
5. `octopus.github.docker.registry` (the build-wide GHCR property)

Nothing is baked in source — the registry hostname must come from CI
config or developer override. The driver fails fast with a clear error
if no source resolves a value. `crs.version` is pinned in
`gradle.properties` (override with `-Pcrs.version=...` or `CRS_VERSION`).

## Realm and users

Realm fixture: `infra/dev/keycloak/portal-realm.json`. Two clients —
`portal-bff` (authorization_code only, prod-faithful) and
`portal-e2e-direct` (direct grants, used by the JVM driver's userinfo
sanity check). Two users:

- `e2e-admin` — realm role `ADMIN` (bare; CRS converter prefixes `ROLE_`).
- `e2e-viewer` — realm role `REGISTRY_VIEWER`.

If `auth.setup.ts` fails parsing the Keycloak login form action, the
Keycloak version has likely been bumped — re-verify `FORM_ACTION_RE`
against the new login HTML.

## Projects

| Project           | storageState                  | testMatch                                                |
|-------------------|-------------------------------|----------------------------------------------------------|
| `chromium-anon`   | none                          | `smoke-anon.spec.ts`                                     |
| `chromium-viewer` | `playwright/.auth/viewer.json`| `smoke-viewer.spec.ts`, `admin-migration-viewer.spec.ts` |
| `chromium-admin`  | `playwright/.auth/admin.json` | `smoke-admin.spec.ts`, `admin-migration.spec.ts`         |

`workers: 1`, `fullyParallel: false` — kept on purpose. The portal uses
an in-memory session store; parallel specs risk cross-test bleed.
