# Component List

> Target users: anyone with `ACCESS_COMPONENTS` (anonymous reads also pass via `ROLE_ANONYMOUS`).

The components list at `/components` is the SPA's main navigation surface — pagination, search, attribute filters. The page is rendered by `pages/ComponentListPage.tsx` and driven by [`useComponents`](../../frontend/src/hooks/useComponents.ts), which calls `GET /rest/api/4/components` on the registry service.

## Filters

Independently optional filters, ANDed server-side. Each filter resets pagination to page 0 to avoid landing the user on an out-of-bounds page when the result set shrinks.

| Filter | Source / wire param | UI control | Notes |
|---|---|---|---|
| **Search** | `?search=…` (server-side ILIKE on `name` + `displayName`) | Debounced text input (300 ms) | |
| **Owner** | `?owner=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/owners` via [`useOwners`](../../frontend/src/hooks/useOwners.ts) | CRS `SYS-035` baseline; multi-value OR added in CRS PR #265. Multiple selections produce `?owner=a,b` and match `componentOwner IN (...)`. |
| **System** | `?system=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/systems` via [`useFieldOptions('system')`](../../frontend/src/hooks/useFieldOptions.ts) | CRS SYS-042. Server-side JOIN through `component_systems` + `IN (...)`. |
| **Build system** | `?buildSystem=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/build-systems` via [`useFieldOptions('buildSystem')`](../../frontend/src/hooks/useFieldOptions.ts) (fallback when admin field-config has no options) | CRS SYS-041. OR semantics against `component_configurations.build_system` on the base row. |
| **Labels** | `?labels=…` (CSV, AND semantics) | `MultiSelectFilter` populated from `GET /components/meta/labels` via [`useLabels`](../../frontend/src/hooks/useLabels.ts) | CRS SYS-040. Each selected label produces its own JOIN+predicate (component must carry ALL labels). |
| **Archived** | `?archived=false` (default; omit for "all") | Two-state toggle cycling *Active only ↔ All* | The button label flips between *Show archived components* and *Hide archived components*. Default is `archived: false` (active only); "Clear filters" returns to that state, not to *All*. |

The whole filter row lives in [`frontend/src/components/ui/filter-bar.tsx`](../../frontend/src/components/ui/filter-bar.tsx); the multi-selects use [`frontend/src/components/ui/MultiSelectFilter.tsx`](../../frontend/src/components/ui/MultiSelectFilter.tsx). A "Clear filters" button surfaces whenever any filter is active.

### Extended search

An **Extended search** toggle (next to the archived button) reveals a second filter row of single-value controls that back the less-common search dimensions. The toggle auto-opens when the current filter already carries an extended value (so a shared/bookmarked URL never hides its own active filters), and "Clear filters" clears the extended row along with everything else.

| Filter | Wire param | Control | Match |
|---|---|---|---|
| **Client code** | `?clientCode=…` | text | scalar ILIKE |
| **Solution** | `?solution=true\|false` | tri-state (Any/Yes/No) | scalar eq |
| **Jira project key** | `?jiraProjectKey=…` | text | base-row config eq |
| **Jira technical** | `?jiraTechnical=true\|false` | tri-state | base-row config eq |
| **VCS path** | `?vcsPath=…` | text | VCS-entry ILIKE |
| **Production branch** | `?productionBranch=…` | text | VCS-entry ILIKE on `branch` |
| **Parent component** | `?parentComponentName=…` | text | parent-join eq on key |
| **Can be parent** | `?canBeParent=true\|false` | tri-state | scalar eq |
| **Group key** | `?groupKey=…` | text | group-join eq on `groupKey` |

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
- **`Extended`** — only shown when the Extended search toggle is open (the default for the new single-value filters above).
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
