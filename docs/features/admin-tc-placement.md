# Admin: TeamCity Placement (Diff / Sync)

> Target users: Diff's report/table — any user who can view components. Running Diff or Sync —
> registry admins (Keycloak realm role mapped to `IMPORT_DATA` permission, i.e. `ROLE_ADMIN`).

> Companion: [`admin-tc-resync.md`](admin-tc-resync.md) / [`admin-migration.md`](admin-migration.md)
> — this feature is the fifth and sixth async-job admin action and shares their state machine.

## What it does

ONB-002: finds where a component's Checkout Directory, Source Path, or Build Working Directory has
drifted from what its linked TeamCity compile configuration(s) derive, and lets an operator write
back only the rows they choose — never a blind overwrite, and never touching a field a human
edited by hand. Two CRS jobs, both under `rest/api/4/admin/teamcity-placement`:

- **Diff** (`POST /diff`, read-only) — walks every in-scope component, derives placement from
  TeamCity, and classifies each row with one of ten statuses (`PlacementDiffRowStatus`):
  `RESOLVED`, `IN_SYNC`, `INVALID`, `CONFLICT`, `MANUAL_EDIT`, `UNEXPRESSIBLE`, `NO_CHAIN`,
  `OUTSIDE_TEMPLATES`, `COMPILE_PAUSED`, `TC_ERROR`. Only `RESOLVED` rows are ever offered to Sync.
  Diff keeps no history — a new run replaces the previous result and id.
- **Sync** (`POST /sync`, `IMPORT_DATA`) — writes the selected components' `RESOLVED` + `BASE` rows
  through the same validation/name-derivation/audit path a manual PATCH uses. Requires the `diffId`
  of the Diff the selection came from; refused with 409 if a newer Diff has since replaced it, or if
  either side (TeamCity or CRS) changed for a component since that Diff ran ("changed since diff").

See the spec (`octopus-release-management-program` openspec change
`onb-001-teamcity-placement-sync`) and ADR-002 for the full rules this UI surfaces, and CRS's
`TeamcityPlacementControllerV4` / `teamcity/placement/*` for the backend implementation.

## UI surface

A fourth card on `/admin` → Migration tab, after TC resync and TC validation. Lives in
[`frontend/src/components/admin/TeamCityPlacementPanel.tsx`](../../frontend/src/components/admin/TeamCityPlacementPanel.tsx).
React Query hooks live in
[`frontend/src/hooks/useTeamCityPlacement.ts`](../../frontend/src/hooks/useTeamCityPlacement.ts):
`useRunPlacementDiff` / `usePlacementDiffJob` / `usePlacementDiffReport` for Diff,
`useRunPlacementSync` / `usePlacementSyncJob` for Sync.

The whole `/admin` route already requires `IMPORT_DATA` in this Portal version (`RequirePermission`
on the route, not re-gated per-tab). The design brief has Diff's report/table open to anyone with
component read access — this version keeps it behind the existing route gate instead of
restructuring routing; a real per-tab split is a followup if a non-admin viewer needs it.

### Report

Once a Diff completes, "Open report (HTML)" and "Download CSV" link straight to
`GET /admin/teamcity-placement/diff/report.{html,csv}` — plain cookie-authenticated anchors (via
the exported `API_BASE` in `lib/api.ts`), not a fetch+blob dance; the browser's session cookie
carries the auth the same way it does for every other Portal request.

### Result table

One row per `PlacementRowDiff`: component, row (`Base` or the marker name + version range), a
status badge (colour from `getPlacementStatusTone` in
[`lib/placementStatus.ts`](../../frontend/src/lib/placementStatus.ts)), each VCS root's
current → derived Checkout Directory / Source Path, the row's current → derived Build Working
Directory, and its notes. Filterable by status (native `<select>`) and by component key (free
text); both filters are client-side over the already-fetched report (no server round-trip). A row's
selection checkbox is enabled only when `isPlacementRowSelectable` (`status === 'RESOLVED' &&
rowLabel === 'BASE'`) — a marker (`vcs.settings`) row or any non-`RESOLVED` status is never
selectable, matching the backend's write scope. "Select all resolved" selects every selectable row
regardless of the current filter view.

### Sync

"Sync selected (N)" opens a confirm dialog naming the count, then
`POST /sync` with `{ diffId: <the currently-displayed Diff job's id>, componentIds: [...selected] }`.
Two 409 shapes share this endpoint and the Portal tells them apart
(`isDiffReplacedConflict` in [`lib/migrationConflict.ts`](../../frontend/src/lib/migrationConflict.ts)):

- a same-kind attach (Sync is already RUNNING) — full job-response body, resolved as success like
  every other admin job hook.
- "diff replaced" (`diffId` no longer names the latest Diff) — CRS's plain `ResponseStatusException`
  body, no `id`/`state`/`kind`. The panel shows "The Diff was replaced — re-run Diff." and clears
  the selection, rather than the generic destructive banner a cross-kind conflict gets.

On completion the panel renders `requested` / `applied` / `skipped` / `failed` tiles from
`PlacementSyncResult` and a link to `GET /admin/teamcity-placement/sync/report.csv` (the
before/after rollback trace, `IMPORT_DATA`-gated like the rest of Sync).

## Async-job pattern

Same shape as [`admin-tc-resync.md`](admin-tc-resync.md), doubled (Diff and Sync are independent
job kinds, each with its own `/job` endpoint) — poll every 1 s while `RUNNING`, stop on a terminal
state, in-memory on CRS (pod restart loses `RUNNING` state).

## Cross-kind disable

All six admin async-job kinds (components migration, history migration, TC resync, TC validation,
TC placement Diff, TC placement Sync) share one `MigrationLifecycleGate` slot on the backend. This
panel cross-disables Run Diff / Sync selected against the other four.

**Known gap:** the other four panels do not yet cross-disable against Diff/Sync running — they
were built before this feature existed. Clicking one of them mid-Diff/Sync still works correctly
(the shared gate 409s and `formatMigrationError` renders the friendly banner), it just isn't
pre-emptively greyed out the way it is symmetrically for the other three. Add
`usePlacementDiffJob` / `usePlacementSyncJob` reads to those four panels' `otherKindRunning` checks
if that gap is worth closing.

## Admin-mode gate

Like the other migration panels, Run Diff / Sync selected are dimmed until Admin mode is armed
(`admin-mode.md`). Server-side `@PreAuthorize` remains the authoritative gate.

## Files of interest

- [`frontend/src/components/admin/TeamCityPlacementPanel.tsx`](../../frontend/src/components/admin/TeamCityPlacementPanel.tsx)
- [`frontend/src/hooks/useTeamCityPlacement.ts`](../../frontend/src/hooks/useTeamCityPlacement.ts)
- [`frontend/src/lib/placementStatus.ts`](../../frontend/src/lib/placementStatus.ts) — status → badge tone, row selectability.
- [`frontend/src/lib/migrationConflict.ts`](../../frontend/src/lib/migrationConflict.ts) — `isDiffReplacedConflict`.
- [`frontend/src/pages/AdminSettingsPage.tsx`](../../frontend/src/pages/AdminSettingsPage.tsx) — mounts the panel.

## Related

- CRS PR #510 — the backend Diff/Sync jobs and `rest/api/4/admin/teamcity-placement/**`.
- [`admin-tc-resync.md`](admin-tc-resync.md) / [`tc-validation.md`](tc-validation.md) — the earlier
  companion async-job admin features this one's pattern is copied from.
