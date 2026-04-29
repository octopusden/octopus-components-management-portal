# Documentation Map

The Components Registry domain is split across two repositories. This file is the wayfinding index — it tells you which doc lives where and which repo is the source of truth for each concern. The principle is **content in one place + link, not duplication**: when you see something cross-referenced, follow the link rather than copying.

## Repos

| Repo | Role |
|---|---|
| **`octopus-components-management-portal`** (this repo, branch `develop`) | Browser-facing BFF + React SPA. Spring Cloud Gateway + OAuth2 Login. Owns the browser experience. |
| **[`octopus-components-registry-service`](https://github.com/octopusden/octopus-components-registry-service)** (branch `v3`) | Backend service — REST API, data model, migrations, resolvers, audit. Owns the data and business logic. |

## What lives where

### This repo (Portal) owns

| Concern | Doc | What it covers |
|---|---|---|
| **Repo overview + local dev loop** | [`README.md`](README.md) | Vite proxy setup, npm/Gradle build commands, dev → prod flow. |
| **Portal architecture (BFF, CSRF, SPA fallback)** | [`docs/architecture.md`](docs/architecture.md) | Implementation details with file pointers (`SecurityConfig.kt`, `SpaFallbackFilter.kt`, `PortalInfoController.kt`). Canonical decision lives in CRS ADR-012; this doc is the *implementation* guide. |
| **Portal-side ADR summary** | [`docs/adr/001-spring-cloud-gateway-bff.md`](docs/adr/001-spring-cloud-gateway-bff.md) | Short Portal-side summary linking to canonical CRS ADR-012. Captures only what's specific to this repo. |
| **Frontend feature docs** | [`docs/features/`](docs/features/) | UX flows for admin-migration, admin-mode, app-footer. |
| **OKD onboarding checklist** | [`docs/onboarding/components-management-portal.md`](docs/onboarding/components-management-portal.md) | Vault, Spring Cloud Config, OKD secrets, TeamCity wiring. |
| **Portal-side tech-debt (frontend + ops)** | [`docs/tech-debt/`](docs/tech-debt/) (`TD-NNN`) | Playwright Keycloak fixture (frontend), OpenAPI types (frontend), persisted session store (BFF), TLS Ingress migration (ops/infra). |
| **Agent / build commands** | [`AGENTS.md`](AGENTS.md) | Build, test, quality gates. Read before touching code. |

### CRS repo owns

Read these in [`octopus-components-registry-service`](https://github.com/octopusden/octopus-components-registry-service):

| Concern | Doc (in CRS) | What it covers |
|---|---|---|
| **Product requirements** | `docs/db-migration/prd.md` | Goals, user stories, phases, milestones. |
| **Functional spec** | `docs/db-migration/functional-spec.md` | What the API does — CRUD, search, audit, import, info, auth. |
| **Non-functional spec** | `docs/db-migration/non-functional-spec.md` | Performance budgets, async-job SLAs, observability. |
| **Technical design** | `docs/db-migration/technical-design.md` | Architecture, DB schema, JPA entities, API contracts, security. |
| **Architecture decisions** | `docs/db-migration/adr/` | All ADRs — backend, data, security. Includes `ADR-012` (canonical decision for the Portal-CRS boundary). |
| **Numbered requirements** | `docs/db-migration/requirements-{common,migration,resolver}.md` (`SYS-NNN`, `MIG-NNN`, `RES-NNN`) | Acceptance criteria + test pointers. RES-NNN pin parity between the DB resolver and the legacy Git resolver — relevant when Portal features depend on resolver behaviour. |
| **Implementation status** | `docs/db-migration/implementation-progress.md` | Backend phases + what shipped when. |
| **Backend tech-debt** | `docs/db-migration/tech-debt/` | Flyway rollout, OpenAPI spec generation. |

## Cross-repo concerns (read both)

These are concerns whose state is split deliberately — the link goes both ways and you may need both pages.

| Concern | Portal side | CRS side |
|---|---|---|
| **Architecture / boundary contract** | [`docs/architecture.md`](docs/architecture.md) (impl) + [`docs/adr/001-...`](docs/adr/001-spring-cloud-gateway-bff.md) (summary+link) | ADR-012 (canonical) |
| **OpenAPI spec generation** | [`docs/tech-debt/TD-002-openapi-types.md`](docs/tech-debt/TD-002-openapi-types.md) — frontend consumption | TD-003 — backend wiring |
| **Async migration UX** | [`docs/features/admin-migration.md`](docs/features/admin-migration.md) — SPA hooks, polling, fallback | MIG-027 (contract), MIG-028 (persisted state, open) |
| **Auth model** | [`docs/architecture.md`](docs/architecture.md) §"BFF pattern" + `SecurityConfig.kt` | ADR-004 — role/permission matrix on resource server |
| **Build info / footer** | [`docs/features/app-footer.md`](docs/features/app-footer.md) — `useInfo.ts`, /portal/info | SYS-033 — `/rest/api/4/info` |
| **Identity** | `frontend/src/hooks/useCurrentUser.ts` | SYS-034 — `/auth/me` |
| **Cutover (Git resolver retirement)** | Affects when `/admin/migrate-history` retires — see CRS ADR-013 §Stage 5C | ADR-013 — Cutover strategy (Proposed) |

## Authoring rules

When you write a new doc, pick **one** repo as the owner using these rules:

1. **Browser experience, UI feature, BFF wiring** → Portal.
2. **Backend behavior, data, contracts** → CRS.
3. **Cross-cutting concern** → write in the repo that has more of the implementation; link from the other repo.
4. **Never duplicate content.** If you find yourself copy-pasting between repos, replace one side with a link.
5. **Cross-repo links to code should target a stable ref** (a release tag or a merge commit SHA), not `blob/<branch>/...` — branches move and permalinks don't rot. Cross-repo links between **living indexes** (this `DOCS.md`, `AGENTS.md`, top-level READMEs) may use the active branch (`v3` for CRS, `develop` for Portal) — they're meant to track the head, not freeze with it.

## How to update this map

Add a row when you create a new top-level doc. Move/reword a row when ownership shifts. Don't list every individual ADR or requirement — point at the index.

Mirror file: [`octopus-components-registry-service/DOCS.md`](https://github.com/octopusden/octopus-components-registry-service/blob/v3/DOCS.md). Both files describe the same map from their own perspective; either can be the entry point.
