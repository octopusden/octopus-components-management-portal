# Component List

> Target users: anyone with `ACCESS_COMPONENTS` (anonymous reads also pass via `ROLE_ANONYMOUS`).

The components list at `/components` is the SPA's main navigation surface — pagination, search, attribute filters. The page is rendered by `pages/ComponentListPage.tsx` and driven by [`useComponents`](../../frontend/src/hooks/useComponents.ts), which calls `GET /rest/api/4/components` on the registry service.

## Filters

Independently optional filters, ANDed server-side. Each filter resets pagination to page 0 to avoid landing the user on an out-of-bounds page when the result set shrinks.

| Filter | Source / wire param | UI control | Notes |
|---|---|---|---|
| **Key or name** | `?search=…` (server-side ILIKE on `name` + `displayName`) | Debounced text input (300 ms), placeholder "Filter by key or name…" | Narrows this list only. With ≥ 2 characters a "Global search →" link offers the same text to the as-code [Global search](as-code-search.md). |
| **Owner** | `?owner=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/owners` via [`useOwners`](../../frontend/src/hooks/useOwners.ts) | CRS `SYS-035` baseline; multi-value OR added in CRS PR #265. Multiple selections produce `?owner=a,b` and match `componentOwner IN (...)`. |
| **System** | `?system=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/systems` via [`useFieldOptions('system')`](../../frontend/src/hooks/useFieldOptions.ts) | CRS SYS-042. Server-side JOIN through `component_systems` + `IN (...)`. |
| **Build system** | `?buildSystem=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/build-systems` via [`useFieldOptions('buildSystem')`](../../frontend/src/hooks/useFieldOptions.ts) (fallback when admin field-config has no options) | CRS SYS-041. OR semantics against `component_configurations.build_system` on the base row. |
| **Labels** | `?labels=…` (CSV, AND semantics) | `MultiSelectFilter` populated from `GET /components/meta/labels` via [`useLabels`](../../frontend/src/hooks/useLabels.ts) | CRS SYS-040. Each selected label produces its own JOIN+predicate (component must carry ALL labels). |
| **Status** | `?archived=false` sent to CRS by default (no Portal URL param); `?archived=true` = archived only; `?archived=all` = both (no CRS param) | *Status* segmented control *Active / Archived / All / Test* | Default is *Active*; "Clear all" and removing the *Status* chip return to it. *Test* is described in the next row. A legacy `?preset=archived` link is rewritten to `?archived=true`. |
| **Test components** | `?testComponent=false` sent to CRS by default (the Portal URL never carries `testComponent=false` — absent means hidden); `?testComponent=true` = only test components | *Test* option of the *Status* control (after *Active / Archived / All*) | Test components (e.g. the CVELAB stand) are hidden by default — the CRS API itself returns them unless filtered, hiding is a Portal decision. Only *Status: Test* (`archived=false&testComponent=true`) lists them; the other Status options, the URL/palette presets, "Clear all" and removing the *Status: Test components* chip return to `testComponent=false`. A legacy `?preset=test-components` link is rewritten to `?testComponent=true`. The command palette search also sends `testComponent=false`. Opening a test component by URL (UUID or name) still works. Archived test components appear under no Status option (Archived and All keep `testComponent=false`, Test keeps `archived=false`); they are reachable only by deep link or the hand-written list URL `?archived=true&testComponent=true`. Parent and doc pickers of a non-test component offer only non-test components (CRS rejects such references). Rows show a *Test* badge next to the status. |

The whole filter row lives in [`frontend/src/components/ui/filter-bar.tsx`](../../frontend/src/components/ui/filter-bar.tsx); the multi-selects use [`frontend/src/components/ui/MultiSelectFilter.tsx`](../../frontend/src/components/ui/MultiSelectFilter.tsx). A "Clear filters" button surfaces whenever any filter is active.

### + Filter

The filter bar is always one row: the key/name filter, the Main-placed pickers and a
**+ Filter** button. **+ Filter** opens a panel listing the Extended dimensions grouped by topic
(Classification, Ownership, Build & VCS, Jira, Distribution, Structure); a dimension that holds a
value shows it ("2 selected", "Yes", the text). Picking one opens its editor in the same panel —
the multi-select list inline, an **Any / Yes / No** segmented control for booleans, a "contains…"
text box — with a back arrow to the list. The button shows how many Extended dimensions are set.
Values never add controls to the bar: every value shows as a removable chip under it, and
"Clear all" clears everything. URL parameters are unchanged.

| Filter | Wire param | Control | Match |
|---|---|---|---|
| **Client code** | `?clientCode=…` | text | scalar ILIKE |
| **Solution** | `?solution=true\|false` | tri-state (Any/Yes/No) | scalar eq |
| **Jira project key** | `?jiraProjectKey=…` | text | base-row config eq |
| **Jira technical** | `?jiraTechnical=true\|false` | tri-state | base-row config eq |
| **VCS path** | `?vcsPath=…` | text | VCS-root ILIKE |
| **Production branch** | `?productionBranch=…` | text | VCS-root ILIKE on `branch` |
| **Parent component** | `?parentComponentName=…` | text | parent-join eq on key |
| **Can be parent** | `?canBeParent=true\|false` | tri-state | scalar eq |
| **Auto release** | `?autoRelease=true\|false` | tri-state | scalar eq |
| **Group key** | `?groupKey=…` | text | group-join eq on `groupKey` |
| **Release manager** | `?releaseManager=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/release-managers` via [`useReleaseManagers`](../../frontend/src/hooks/useReleaseManagers.ts) | child-collection join + `IN (...)` on `component_release_managers.username` |
| **Security champion** | `?securityChampion=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/security-champions` via [`useSecurityChampions`](../../frontend/src/hooks/useSecurityChampions.ts) | same, against `component_security_champions` |

The `?releaseManager=` / `?securityChampion=` params predate their pickers — they already backed the Registry Health people deep-links (the personal presets use the *Mine* `involves` filter instead). The dropdowns are what let a user filter by **someone else**. Options are the **in-use** sets (only usernames actually assigned on some component), so every option matches at least one component (archived ones included, as with the other in-use lists, so an archived-only name needs the *Archived* preset); an employee who is nobody's release manager is deliberately not offered. Both endpoints are served by CRS since v3.0.16; against an older CRS, `useMetaInUse`'s 404/501 → empty-vocabulary contract keeps the picker openable rather than erroring.

These params are added to [`useComponents`](../../frontend/src/hooks/useComponents.ts) and served by the CRS v4 `listComponents` controller (see `octopus-components-registry-service/docs/registry/functional-spec.md`). Each control is placed by the field's **Searchable** setting (below), not hard-coded into the row.

### Multi-select picker (`MultiSelectFilter`)

Shared component used by the four CSV filters above. Common behaviour:

- Closed trigger renders as `<placeholder>` (e.g. *All labels*) plus a small `Badge` with the **count** of current selections — not inline chips per selection. Open popover renders a search input + a checkable list of all known options.
- Echoes selections back to the URL as a CSV (`?owner=a,b`), keeping the wire shape that CRS expects without N repeated query params.
- Returns an empty array (not `undefined`) when cleared, so the call site omits the URL search param entirely instead of sending an empty string.

Per-filter option-fetch timing differs:

- **Owner** and **Build system** load options on first render — `useOwners()` and `useFieldOptions('buildSystem')` are called unconditionally from `ComponentFilters`.
- **System** and **Labels** are lazy — `useFieldOptions('system', { enabled: systemActivated })` and `useLabels({ enabled: labelsActivated })` only fire after the user opens the popover for the first time (the `onOpenChange` handler flips the corresponding `*Activated` flag, which never goes back to `false`). This keeps page mount free of two meta-endpoint fetches and prevents Playwright's console-error listener from tripping on browser 404 logs before React-Query catches them on tenants where these endpoints are not yet wired.

### Per-tenant filter placement (`searchable`)

`AdminSettingsPage` writes a `FieldConfig` map that controls where each field appears in the list-page search. The check happens inside `ComponentFilters` against the same config the editor uses, so admins can place or hide filters per installation (e.g. tenants without a `system` taxonomy).

Each field carries a **`searchable`** placement — one of:

- **`Main`** — always-visible filter in the top row (today's defaults: `system`, `buildSystem`, `labels`, `componentOwner`).
- **`Extended`** — edited in the **+ Filter** panel (values shown as chips) (the default for the new single-value filters above).
- **`None`** — not searchable; the control is never rendered.

The effective placement is resolved by [`searchabilityFor`](../../frontend/src/hooks/useFieldConfig.ts): an explicit `searchable` wins; otherwise a legacy `filterable: false` maps to `None`; otherwise a central `DEFAULT_SEARCHABILITY` map applies; otherwise the field defaults to `Extended`. This means a fresh install (empty field-config) already places every filter correctly before an admin saves the catalog. `searchable` **supersedes** the older boolean `filterable` flag, which was never surfaced in the admin UI — `filterable: false` is still honoured (as `None`) for backward-compat. Placement is independent of the form-level `visibility` flag (a field can be editor-hidden yet searchable, or vice-versa).

## Validation problem indicators (admin-only)

Two independent, Portal-computed problem sources feed the same row-level indicator and the **"With problems"** preset (`ListPresetBar`), both admin-only:

- **Unregistered Release** — from `useValidationProblems`/`useComponentsWithProblems` (the registered-version validation report).
- **TeamCity** — from `useTeamCityValidations`, keyed by `componentId` (not name, unlike the report above).

A row shows **at most one** warning triangle: an Unregistered-Released issue takes priority (`ValidationBadge`); a `TeamCityProblemBadge` only renders when the row has no Unregistered-Released issue. The **"With problems"** preset unions both sources into one row set (deduped by component), so a component with only a TeamCity finding still shows up. See [`docs/features/component-detail.md`](component-detail.md#validations-admin-only) for the per-component view of the same two sources.

## Routing

`ComponentTable` links each row to `/components/<UUID>` (using `row.original.id`). UUIDs are stable across renames, so the URL doesn't break when 7.1.4 (Component rename) flips a name. The detail page accepts both UUID and name in the URL — see [`docs/features/component-detail.md`](component-detail.md).

## Files of interest

- [`frontend/src/pages/ComponentListPage.tsx`](../../frontend/src/pages/ComponentListPage.tsx)
- [`frontend/src/components/ComponentFilters.tsx`](../../frontend/src/components/ComponentFilters.tsx)
- [`frontend/src/components/ComponentTable.tsx`](../../frontend/src/components/ComponentTable.tsx)
- [`frontend/src/hooks/useComponents.ts`](../../frontend/src/hooks/useComponents.ts)
- [`frontend/src/hooks/useOwners.ts`](../../frontend/src/hooks/useOwners.ts)

## Related

- CRS `SYS-035` (owner filter contract) — `octopus-components-registry-service/docs/registry/requirements-common.md`.
- [`docs/features/component-detail.md`](component-detail.md) — what happens when you click a row.
- [TD-002 OpenAPI types](../tech-debt/TD-002-openapi-types.md) — replaces hand-written enums (`SYSTEM_OPTIONS`, `PRODUCT_TYPE_OPTIONS`).
