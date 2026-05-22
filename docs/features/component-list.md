# Component List

> Target users: anyone with `ACCESS_COMPONENTS` (anonymous reads also pass via `ROLE_ANONYMOUS`).

The components list at `/components` is the SPA's main navigation surface — pagination, search, attribute filters. The page is rendered by `pages/ComponentListPage.tsx` and driven by [`useComponents`](../../frontend/src/hooks/useComponents.ts), which calls `GET /rest/api/4/components` on the registry service.

## Filters

Independently optional filters, ANDed server-side. Each filter resets pagination to page 0 to avoid landing the user on an out-of-bounds page when the result set shrinks.

| Filter | Source / wire param | UI control | Notes |
|---|---|---|---|
| **Search** | `?search=…` (server-side ILIKE on `name` + `displayName`) | Debounced text input (300 ms) | |
| **Product type** | `?productType=…` | Single-select `<Select>` from `PRODUCT \| COMPONENT \| LIBRARY \| SERVICE` | Static list — see [TD-002](../tech-debt/TD-002-openapi-types.md) for the proper enum source. |
| **Owner** | `?owner=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/owners` via [`useOwners`](../../frontend/src/hooks/useOwners.ts) | CRS `SYS-035` baseline; multi-value OR added in CRS PR #265. Multiple selections produce `?owner=a,b` and match `componentOwner IN (...)`. |
| **System** | `?system=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/systems` | CRS SYS-042. Server-side JOIN through `component_systems` + `IN (...)`. |
| **Build system** | `?buildSystem=…` (CSV, OR semantics) | `MultiSelectFilter` populated from `GET /components/meta/build-systems` (fallback when admin field-config has no options) | CRS SYS-041. OR semantics against `component_configurations.build_system` on the base row. |
| **Labels** | `?labels=…` (CSV, AND semantics) | `MultiSelectFilter` populated from `GET /components/meta/labels` | CRS SYS-040. Each selected label produces its own JOIN+predicate (component must carry ALL labels). |
| **Archived** | `?archived=true \| false` (omit for "all") | Tri-state toggle cycling *All → Archived → Active → All* | Default is "show everything"; the button expresses that state explicitly so the toggle never looks broken. |

The whole filter row lives in [`frontend/src/components/ui/filter-bar.tsx`](../../frontend/src/components/ui/filter-bar.tsx); the multi-selects use [`frontend/src/components/ui/MultiSelectFilter.tsx`](../../frontend/src/components/ui/MultiSelectFilter.tsx). A "Clear filters" button surfaces whenever any filter is active.

### Multi-select picker (`MultiSelectFilter`)

Shared component used by the four CSV filters above. Each picker:

- Loads options lazily on first popover open via `onOpenChange` — keeps page mount free of meta-endpoint fetches and prevents Playwright's console-error listener from tripping on browser 404 logs before React-Query catches them.
- Renders selected values as inline `Badge` chips next to the trigger. When more chips would fit than the trigger has room for, the surplus collapses into a `+N` chip; clicking `+N` expands the row in place so the user can see every selected value without losing the typeahead.
- Echoes selections back to the URL as a CSV (`?owner=a,b`), keeping the wire shape that CRS expects without N repeated query params.
- Returns an empty array (not `undefined`) when cleared, so the call site omits the URL search param entirely instead of sending an empty string.

### Per-tenant filter visibility

`AdminSettingsPage` writes a `FieldConfig` map that controls which filters are visible on the list page. The visibility check happens inside `ComponentFilters` against the same config the editor uses, so admins can hide filters that aren't relevant for their installation (e.g. tenants without a `system` taxonomy).

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
