# Admin: TeamCity Resync

> Target users: registry admins (Keycloak realm role mapped to `IMPORT_DATA` permission, i.e. `ROLE_ADMIN`).

## What it does

Triggers `POST /rest/api/4/admin/teamcity-project-ids/sync` on CRS. The backend walks every DB-sourced component, queries the configured TeamCity for projects matching that component, and updates `components.teamcity_project_id` on each match. The result is a per-component report of `MATCHED`, `AMBIGUOUS_AUTO_RESOLVED`, `NO_MATCH`, or `ERROR`. The Portal renders the report as counter tiles when the job completes.

## UI surface

A second card on the `/admin` page, sitting next to "Run migration" and "Run history migration". Lives in [`frontend/src/components/admin/TeamCityResyncPanel.tsx`](../../frontend/src/components/admin/TeamCityResyncPanel.tsx). React Query hooks: [`useTeamCityResyncJob`](../../frontend/src/hooks/useTeamCityResync.ts) (polls `GET /admin/teamcity-project-ids/sync/job`), [`useRunTeamCityResync`](../../frontend/src/hooks/useTeamCityResync.ts) (the start mutation).

## Async-job pattern

Matches the components-migration panel state machine (kept in sync with [`admin-migration.md`](admin-migration.md)):

```
        ┌─────────┐  click + confirm
   IDLE │ button  │ ──────────► POST /admin/teamcity-project-ids/sync
        └─────────┘                   │
             ▲                        ▼
             │              ┌──────────────────┐
             │              │ RUNNING (spinner)│
             │              └──────────────────┘
             │                        │
             │            poll GET /admin/teamcity-project-ids/sync/job
             │                        │
             │              ┌─────────┴─────────┐
             │              ▼                   ▼
             │     COMPLETED              FAILED
             │     (counter tiles)        (destructive banner)
             │              │                   │
             └──────────────┴───────────────────┘
                       new run replaces job
```

The job state is in-memory on CRS (same caveat as the components-migration job — pod restart loses RUNNING state and the SPA falls back to IDLE).

## Counter tiles

On COMPLETED the panel renders seven `StatCard` tiles in a single row:

- **Scanned** — total components considered.
- **Updated** — `components.teamcity_project_id` rewritten because the match changed.
- **Unchanged** — match agreed with the existing value; no write.
- **No match** — no TC project found. Often a typo in component name or a project not yet created.
- **Ambiguous** — multiple TC projects matched and the auto-resolution rule did not pick one. Listed in the detail banner for manual fix.
- **Auto-resolved** — multiple TC projects matched and CRS picked the one whose name starts with `CDRelease-` (per CRS PR #188). Surface it so an operator can sanity-check the picks.
- **Errors** — the underlying TC client failed (auth, 5xx, timeout). Component IDs are listed in the destructive banner below.

Tiles are read-only — there is no click-through to a filtered list page.

## Cross-kind disable

The three admin async-job panels (components migration, history migration, TC resync) are cross-disabled while any one of them is `RUNNING`. The backend's `MigrationLifecycleGate` returns 409 on a cross-kind start anyway, but the SPA hides that error path by disabling the button. React Query dedupes the polling GETs so the three panels share one cache entry per job kind.

## Admin-mode gate

Like the migration panels, the Start button is dimmed until the user enables admin mode (the UX-only switch from [`admin-mode.md`](admin-mode.md)). Server-side `@PreAuthorize` remains the authoritative gate.

## Files of interest

- [`frontend/src/components/admin/TeamCityResyncPanel.tsx`](../../frontend/src/components/admin/TeamCityResyncPanel.tsx)
- [`frontend/src/hooks/useTeamCityResync.ts`](../../frontend/src/hooks/useTeamCityResync.ts)
- [`frontend/src/pages/AdminSettingsPage.tsx`](../../frontend/src/pages/AdminSettingsPage.tsx) — mounts the panel.

## Related

- CRS PR #28 — initial admin TC-resync endpoint (synchronous).
- CRS PR #35 — migration to the async-job pattern.
- CRS PR #37 — auto-resolved (`CDRelease-*`) tile and report shape.
- CRS PR #181 — backend async TC resync job (`POST /sync` + `GET /sync/job`).
- [`admin-migration.md`](admin-migration.md) — companion async-job feature.
