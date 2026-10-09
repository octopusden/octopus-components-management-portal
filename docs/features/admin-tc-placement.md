# Admin: Checkout Paths from TeamCity (Diff / Sync)

> Target users: Diff's report/table — any user who can view components. Running Diff or Sync —
> registry admins (Keycloak realm role mapped to `IMPORT_DATA` permission, i.e. `ROLE_ADMIN`).

> Companion: [`admin-tc-resync.md`](admin-tc-resync.md) / [`admin-migration.md`](admin-migration.md)
> — this feature is the fifth and sixth async-job admin action and shares their state machine.

## What it does

ONB-002: finds where a component's Checkout Directory, Source Path, or Build Working Directory has
drifted from what its linked TeamCity compile configuration(s) derive, and lets an operator write
back only the rows they choose — never a blind overwrite, and never touching a field a human
edited by hand. Two CRS jobs, both under `rest/api/4/admin/teamcity-placement`:

- **Diff** (`POST /diff`, read-only) — walks the current (Base) configuration of every in-scope,
  non-archived component (version-range overrides are not touched), derives placement from
  TeamCity, and classifies each row with one of eleven statuses (`PlacementDiffRowStatus`):
  `RESOLVED`, `IN_SYNC`, `INVALID`, `CONFLICT`, `MANUAL_EDIT`, `UNEXPRESSIBLE`, `NO_CHAIN`,
  `OUTSIDE_TEMPLATES`, `COMPILE_PAUSED`, `TC_ERROR`, `ROOTS_MISMATCH`. Only `RESOLVED` rows are ever offered to Sync.
  `ROOTS_MISMATCH` ("VCS roots differ from the registry", Can't derive bucket) means TeamCity's
  compile configurations attach repositories the registry does not list (e.g. a shared tooling
  repository); the details are in the row's notes and in the component's TeamCity Validation
  finding of the same name.
  Diff keeps no history — a new run replaces the previous result and id.
- **Sync** (`POST /sync`, `IMPORT_DATA`) — writes the selected components' `RESOLVED` + `BASE` rows
  through the same validation/name-derivation/audit path a manual PATCH uses. Requires the `diffId`
  of the Diff the selection came from; refused with 409 if a newer Diff has since replaced it, or if
  either side (TeamCity or CRS) changed for a component since that Diff ran ("changed since diff").

See the spec (`octopus-release-management-program` openspec change
`onb-001-teamcity-placement-sync`) and ADR-002 for the full rules this UI surfaces, and CRS's
`TeamcityPlacementControllerV4` / `teamcity/placement/*` for the backend implementation.

## UI surface

A fourth card on `/admin` → Maintenance tab (renamed from "Migration"), after TC resync and TC
validation, headed "Checkout paths from TeamCity". Lives in
[`frontend/src/components/admin/TeamCityPlacementPanel.tsx`](../../frontend/src/components/admin/TeamCityPlacementPanel.tsx),
with the pure grouping/formatting logic split out into
[`frontend/src/lib/placementGrouping.ts`](../../frontend/src/lib/placementGrouping.ts) (field diffs,
the "Proposed change" lines, component grouping) and
[`frontend/src/lib/placementStatus.ts`](../../frontend/src/lib/placementStatus.ts) (status → human
label / bucket / badge tone). React Query hooks live in
[`frontend/src/hooks/useTeamCityPlacement.ts`](../../frontend/src/hooks/useTeamCityPlacement.ts):
`useRunPlacementDiff` / `usePlacementDiffJob` / `usePlacementDiffReport` for Diff,
`useRunPlacementSync` / `usePlacementSyncJob` for Sync.

The whole `/admin` route already requires `IMPORT_DATA` in this Portal version (`RequirePermission`
on the route, not re-gated per-tab). The design brief has Diff's report/table open to anyone with
component read access — this version keeps it behind the existing route gate instead of
restructuring routing; a real per-tab split is a followup if a non-admin viewer needs it.

### Summary bar

Once a Diff completes, a summary bar sits above the table: one clickable, `aria-pressed` count
button per status bucket (Ready / Needs a look / Can't derive / Nothing to do —
`PLACEMENT_STATUS_BUCKETS` in `lib/placementStatus.ts`), a "Show all (N)" toggle, "Report from
\<local time\>" (`formatLocalDateTime` in `lib/date.ts`), and the "Open report (HTML)" / "Download
CSV" links straight to `GET /admin/teamcity-placement/diff/report.{html,csv}` — plain
cookie-authenticated anchors (via the exported `API_BASE` in `lib/api.ts`), not a fetch+blob dance.
The default view shows Ready + Needs a look only; clicking a bucket narrows to just that bucket
(click again to clear); "Show all" reveals the rest. The component text filter still narrows both.

### Result table

Grouped by component (`groupPlacementRows`): one header row per component with the only checkbox
(`aria-label="Select <componentKey>"`, keyed by `componentId` as before), the component key, and a
status chip per distinct status in the group. Disabled when the component has no `RESOLVED` Base
row. Underneath, one row per `PlacementRowDiff` — Base first, then overrides sorted by version
range — with four columns: **Applies to** ("Base" or "Override for versions \<range\>" — the raw
`vcs.settings` marker name never reaches the screen, see `appliesToLabel`), **Status** (human label
from `getPlacementStatusLabel`, the raw `PlacementDiffRowStatus` code as the badge's `title`
tooltip), **Proposed change** (one "Field name: before → after" line per changed field —
`buildProposedChangeLines`; a `null` directory renders as "(root)"; a VCS root name prefixes a line
only when the row has more than one root; "no change" when the row was derived but nothing
differs, empty when nothing was derived), and **Note**. "Select all visible ready (N)" replaces the
old "Select all resolved" — it only ever selects components currently visible under the active
bucket/text filters.

### Sync

"Sync selected (N)" opens a confirm dialog listing the selected component keys (first 10, then
"and N more"), the number of fields that will be written (`countChangedFields`, summed over the
selected components' Base rows only), and "Only base configurations are written. A before/after CSV
is kept for rollback." Confirming posts `POST /sync` with `{ diffId: <the displayed report's own
`diffId`>, componentIds: [...selected] }`. Two 409 shapes share this endpoint and the Portal tells
them apart (`isDiffReplacedConflict` in [`lib/migrationConflict.ts`](../../frontend/src/lib/migrationConflict.ts)):

- a same-kind attach (Sync is already RUNNING) — full job-response body, resolved as success like
  every other admin job hook.
- "diff replaced" (`diffId` no longer names the latest Diff) — CRS's `ErrorResponse` body
  `{"errorMessage":"diff replaced, re-run Diff","errorCode":"placement-diff-stale"}`, no
  `id`/`state`/`kind`; matched on `errorCode`, falling back to the message text. The panel shows "The Diff was replaced — re-run Diff." and clears
  the selection, rather than the generic destructive banner a cross-kind conflict gets.

On completion the panel renders `requested` / `applied` / `skipped` / `failed` tiles from
`PlacementSyncResult` and a "Download rollback trace (CSV)" link to
`GET /admin/teamcity-placement/sync/report.csv` (the before/after trace, `IMPORT_DATA`-gated like
the rest of Sync).

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
- [`frontend/src/lib/placementStatus.ts`](../../frontend/src/lib/placementStatus.ts) — status → human label / bucket / badge tone, row selectability.
- [`frontend/src/lib/placementGrouping.ts`](../../frontend/src/lib/placementGrouping.ts) — field diffs, "Proposed change" lines, component grouping.
- [`frontend/src/lib/migrationConflict.ts`](../../frontend/src/lib/migrationConflict.ts) — `isDiffReplacedConflict`.
- [`frontend/src/pages/AdminSettingsPage.tsx`](../../frontend/src/pages/AdminSettingsPage.tsx) — mounts the panel.

## Related

- CRS PR #510 — the backend Diff/Sync jobs and `rest/api/4/admin/teamcity-placement/**`.
- [`admin-tc-resync.md`](admin-tc-resync.md) / [`tc-validation.md`](tc-validation.md) — the earlier
  companion async-job admin features this one's pattern is copied from.
