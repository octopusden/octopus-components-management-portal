# Component List

> Target users: anyone with `ACCESS_COMPONENTS` (anonymous reads also pass via `ROLE_ANONYMOUS`).

The components list at `/components` is the SPA's main navigation surface — pagination, search, attribute filters. The page is rendered by `pages/ComponentListPage.tsx` and driven by [`useComponents`](../../frontend/src/hooks/useComponents.ts), which calls `GET /rest/api/4/components` on the registry service.

## Filters

Five independently optional filters, ANDed server-side. Each filter resets pagination to page 0 to avoid landing the user on an out-of-bounds page when the result set shrinks.

| Filter | Source / wire param | UI control | Notes |
|---|---|---|---|
| **Search** | `?search=…` (server-side ILIKE on `name` + `displayName`) | Debounced text input (300 ms) | The debounce keeps a fast typist from firing N requests per word. |
| **Product type** | `?productType=…` | `<Select>` from a built-in option list (`PRODUCT`, `COMPONENT`, `LIBRARY`, `SERVICE`) | Static list today — see [TD-002](../tech-debt/TD-002-openapi-types.md) for the proper enum source. |
| **Owner** | `?owner=…` (exact match on `componentOwner`) | `<Select>` populated from `GET /components/meta/owners` via [`useOwners`](../../frontend/src/hooks/useOwners.ts) | Backed by CRS `SYS-035`. The picker hands back canonical owner strings, so the server-side filter is a case-sensitive `cb.equal`. Without this, the SPA would have to download the full ~900-component list to filter client-side. |
| **Archived** | `?archived=true|false` (omit for "all") | Tri-state toggle button cycling through *All → Archived only → Active only → All* | Tri-state matters because the default `archived` filter is "show everything"; the button has to express that explicitly to avoid the user thinking the toggle is broken. |
| **System** | `?system=…` (intentionally rejected on the server today) | `<Select>` available but currently produces HTTP 400 | Kept in the UI for forward-compat; CRS `ComponentManagementServiceImpl.buildSpecification` rejects until the JPA + `text[]` story is sorted. |

A "Clear filters" button surfaces whenever any filter is active and resets the whole filter object to `{}`.

## Owner picker (B7.1.1)

The owner dropdown is the only filter sourced from a live API rather than a static enum. Implementation details that future readers tend to trip on:

- Values come from `GET /rest/api/4/components/meta/owners`. The hook `useOwners` caches with `staleTime: 5 * 60_000`, so the picker doesn't refetch on every page mount.
- The list is rendered flat — no virtualization, no search-as-you-type. Acceptable while the owner cardinality is in the low hundreds; if it grows past that, switch to a typeahead variant matching `PeopleInput`'s pattern.
- An `__all__` sentinel value clears the filter (the same pattern `system` and `productType` use). Ranges back to `undefined` at the call site so the URL search param is omitted entirely, not sent as an empty string.
- Width is `180px` (vs `160px` for system / productType) to fit realistic owner emails. Don't shrink without checking what the longest live owner string looks like.

## Routing

`ComponentTable` links each row to `/components/<UUID>` (using `row.original.id`). UUIDs are stable across renames, so the URL doesn't break when 7.1.4 (Component rename) flips a name. The detail page accepts both UUID and name in the URL — see [`docs/features/component-detail.md`](component-detail.md).

## Files of interest

- [`frontend/src/pages/ComponentListPage.tsx`](../../frontend/src/pages/ComponentListPage.tsx)
- [`frontend/src/components/ComponentFilters.tsx`](../../frontend/src/components/ComponentFilters.tsx)
- [`frontend/src/components/ComponentTable.tsx`](../../frontend/src/components/ComponentTable.tsx)
- [`frontend/src/hooks/useComponents.ts`](../../frontend/src/hooks/useComponents.ts)
- [`frontend/src/hooks/useOwners.ts`](../../frontend/src/hooks/useOwners.ts)

## Related

- CRS `SYS-035` (owner filter contract) — `octopus-components-registry-service/docs/db-migration/requirements-common.md`.
- [`docs/features/component-detail.md`](component-detail.md) — what happens when you click a row.
- [TD-002 OpenAPI types](../tech-debt/TD-002-openapi-types.md) — replaces hand-written enums (`SYSTEM_OPTIONS`, `PRODUCT_TYPE_OPTIONS`).
