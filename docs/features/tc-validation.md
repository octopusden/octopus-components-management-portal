# TeamCity Validation

> Target users: registry admins (Keycloak realm role mapped to `IMPORT_DATA` permission, i.e. `ROLE_ADMIN`) for the sweep and all findings surfaces; everyone else sees none of this feature.

## What it does

Triggers `POST /rest/api/4/admin/teamcity-validation` on CRS. The backend scans every component's TeamCity project(s) against a set of validation rules (e.g. build config drift, custom/overridden build steps, multiple Java/Maven versions) and records findings per project. The job result (`TeamCityValidationResult`) is a counter object — `scanned`, `findings`, `componentsWithIssues`, `errors: string[]`.

Unlike [TeamCity Resync](admin-tc-resync.md) (which repairs `teamcity_project_id`/`teamcity_project_url`), this feature is read-only diagnostics: it never mutates component data, only validation records that the rest of the Portal surfaces.

## Admin panel (trigger + job status)

A card on `/admin`, next to migration/resync ([`TeamCityValidationPanel.tsx`](../../frontend/src/components/admin/TeamCityValidationPanel.tsx)). Mirrors [`TeamCityResyncPanel`](../../frontend/src/components/admin/TeamCityResyncPanel.tsx)'s async-job state machine (IDLE → RUNNING → COMPLETED/FAILED) and is cross-disabled against the other three async jobs (components migration, history migration, TC resync) via the same single-flight lifecycle gate. Hooks: [`useRunTeamCityValidation`, `useTeamCityValidationJob`](../../frontend/src/hooks/useTeamCityValidation.ts).

## Findings surfaces (all admin-only)

| Surface | File | What it shows |
|---|---|---|
| Validations page — TeamCity tab | [`pages/ValidationsPage.tsx`](../../frontend/src/pages/ValidationsPage.tsx) | Registry-wide KPIs (components with issues, unique findings), a by-type breakdown, and a filterable/sortable findings table (`GET /admin/teamcity-validations`, `/summary`). Type filter is multi-select; a finding's `type` can itself be a comma-separated list (one finding can flag more than one rule), rendered as one badge per type. |
| Component detail — Validations > TeamCity | [`components/TeamCityValidationsTab.tsx`](../../frontend/src/components/TeamCityValidationsTab.tsx) | This component's findings, grouped by project. Empty state when clean. |
| Component detail — project header | `ComponentDetailPage.tsx`'s `teamcity-projects-list` block | Per-project status icon (checkmark/warning) + issue count, admin-only. |
| Components list | [`components/ComponentTable.tsx`](../../frontend/src/components/ComponentTable.tsx) | A row with a TeamCity finding (and no Unregistered-Released issue) shows a warning triangle; folded into the **"With problems"** preset. See [`component-list.md`](component-list.md#validation-problem-indicators-admin-only). |

The Validations page also merged the former standalone `/health` (Registry Health) page in as its second tab, **Unregistered Release** — an unrelated, pre-existing validation facility (registered-version checks) that now shares the same admin-only page and component-detail sidebar group for a single "Validations" mental model.

## Finding message formatting (`TeamCityMessage`)

Findings carry a free-text `message` that can contain literal `\n` line breaks and lines shaped like `- STEP_ID in BUILD_CONF_ID` or `- BUILD_CONF_ID`. [`components/TeamCityMessage.tsx`](../../frontend/src/components/TeamCityMessage.tsx) renders these consistently everywhere a message appears (the findings table and the per-component tab share the exact same component, so text color/line-height never drift between the two):

- Each `-`-prefixed line becomes a real bulleted `<li>` (consecutive bullets share one `<ul>`) instead of a literal `-` character.
- `STEP_ID`/`BUILD_CONF_ID` are linked into the TeamCity admin UI — `{base}/admin/editBuildRunners.html?id=buildType:BUILD_CONF_ID` and `{base}/admin/editRunType.html?id=buildType:BUILD_CONF_ID&runnerId=STEP_ID` — where `base` is derived from the finding's project `projectUrl` (stripping the trailing `/project/<id>`). No base URL → identifiers render as plain bullet text, no link.

## Files of interest

- [`frontend/src/components/admin/TeamCityValidationPanel.tsx`](../../frontend/src/components/admin/TeamCityValidationPanel.tsx) — admin trigger + job status.
- [`frontend/src/hooks/useTeamCityValidation.ts`](../../frontend/src/hooks/useTeamCityValidation.ts) — start mutation + job poll.
- [`frontend/src/hooks/useTeamCityValidations.ts`](../../frontend/src/hooks/useTeamCityValidations.ts) — summary + findings list queries (note the plural — distinct from the singular hook above).
- [`frontend/src/lib/teamcityValidationTypes.ts`](../../frontend/src/lib/teamcityValidationTypes.ts) — type label lookup, CSV-type splitting, status → tone.
- [`frontend/src/components/TeamCityMessage.tsx`](../../frontend/src/components/TeamCityMessage.tsx) — shared message renderer.
- [`frontend/src/pages/ValidationsPage.tsx`](../../frontend/src/pages/ValidationsPage.tsx) — registry-wide page (both tabs).
- [`frontend/src/components/TeamCityValidationsTab.tsx`](../../frontend/src/components/TeamCityValidationsTab.tsx) — per-component tab.

## Related

- [`admin-tc-resync.md`](admin-tc-resync.md) — companion async-job feature (project-id repair, not validation).
- [`admin-migration.md`](admin-migration.md) — the async-job pattern all four admin jobs share.
- [`component-detail.md`](component-detail.md#validations-admin-only) — per-component Validations sidebar group.
- [`component-list.md`](component-list.md#validation-problem-indicators-admin-only) — list-page warning badges and the "With problems" preset.
