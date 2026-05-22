# Component Detail

> Target users: `ACCESS_COMPONENTS` for read; per-tab gates for writes (see "Auth gating" below).

The detail page at `/components/<UUID>` is the editor surface. It renders [`pages/ComponentDetailPage.tsx`](../../frontend/src/pages/ComponentDetailPage.tsx) and decomposes into eight tabs (General, Build, VCS, Distribution, Jira, Escrow, Overrides, History). The page-level form lives once and tabs share its state via `react-hook-form`.

## URL stability

`ComponentTable` links by **UUID** (`row.original.id`), so the URL is stable across renames. CRS `GET /rest/api/4/components/{idOrName}` resolves both forms — direct UUID lookup first, name fallback on `404`. Mutations (`PATCH`, `DELETE`) go through UUID only because the controller signature is `@PathVariable id: UUID`. After a rename, `useComponent.invalidateQueries(['component', id])` refreshes the cache; the URL doesn't change.

## Tabs

| Tab | Source | Notes |
|---|---|---|
| **General** | `GeneralTab` | Identity + ownership: name, displayName, owner, productType, system, clientCode, parent component, archive flag. Detailed below. |
| **Build / VCS / Distribution / Jira / Escrow** | `BuildTab` etc. | Per-tab Save buttons; each tab handles its own mutation slice via the page-level `updateMutation`. Out of scope for this doc. |
| **Overrides** | `FieldOverrides` | Per-version field overrides. Out of scope. |
| **History** | `ComponentHistoryTab` (B7.1.2) | New in P1; detailed below. |

## General tab

### Name (B7.1.4 — rename)

The name input is gated by `RENAME_COMPONENTS`. With the permission, the input is editable; without, it's `disabled` with explicit explanatory text:

> Renaming requires the `RENAME_COMPONENTS` permission (typically `ROLE_ADMIN`). Ask an admin to rename this component or request the permission.

For users with the permission a different hint surfaces:

> Renaming changes the canonical identifier — every legacy v1/v2/v3 lookup by old name will resolve to the renamed component.

The UX gate is a hint, not a security boundary. Server-side `@PreAuthorize canRenameComponent` is the actual authority — bypassing the disabled state would still get a 403. The reason we still gate in the UI is to set expectations: a "disabled forever" lie creates support tickets.

The save handler in `ComponentDetailPage.handleSave` only sends `name` on a real change (`trimmedName !== '' && trimmedName !== component.name`). Defence in depth — even if the UI gate were bypassed, an unchanged form value never trips the server's gate.

### Parent component (B7.1.5)

`<ComponentSelect>` autocomplete (`frontend/src/components/ui/ComponentSelect.tsx`) drives the parent picker:
- Suggestions come from `GET /rest/api/4/components?search=<query>` via [`useComponents`](../../frontend/src/hooks/useComponents.ts). Two-character minimum on the input keeps the request volume sane.
- The current component is filtered out of the suggestion list (`excludeName`) — a component cannot be its own parent.
- Submits the canonical `name`, never `displayName`. The backend stores `parentComponentName` as a name reference, not a UUID.
- Empty input ⇒ "no parent". The save handler maps blank → `null` (JSON Merge Patch clear, per FS §1.4) vs unchanged → `undefined`.

### Save handler tri-states

`handleSave` carries three subtle "only send when changed" patterns to keep non-admin saves from tripping server-side permission gates:

| Field | Wire shape | When sent |
|---|---|---|
| `name` | `string` (rename) | Only when `trimmedName !== '' && trimmedName !== component.name`. |
| `parentComponentName` | `string \| null \| undefined` | Three states: `unchanged → undefined`, `'' → null` (clear), `value → string` (set). |
| `archived` | `boolean` | Only when `values.archived !== component.archived`. ARCHIVE_COMPONENTS gate. |

If any of these fields is always sent, a non-admin's plain edit (only `displayName` or owner) would 403 because the server's PATCH SpEL guards `(#request.archived == null or canArchiveComponent(...))` etc.

### Schema-v2 General-tab editors (PR #38 Wave B)

With CRS schema v2 (`component_configurations` as the wide row), three child-collection editors live on the General tab next to the scalar fields:

- **TeamCity projects** — `projectId` rows backed by the `component_teamcity_projects` child table. Sort order is preserved (server sorts by `sort_order`); the editor re-emits the full list on each save.
- **Doc links** — `{ docComponentKey: string, majorVersion: string }` rows backed by `component_doc_links`. Identifies the documentation source by component key and the major version it documents (e.g. `3.x`).
- **Artifact IDs** — `{ groupPattern: string, artifactPattern: string }` rows backed by `component_artifact_ids`. Order preserved; primary use is fuzzy-match by build artifact identifier in downstream Feign consumers.

Each editor is a `useFieldArray` row list with inline add and per-row delete. They share the page-level `react-hook-form` state; the General tab Save button mutates them together with the scalar fields in one PATCH.

### Optimistic-locking conflict UX (B7.1.6)

On `409 Conflict`:
1. `queryClient.refetchQueries({ queryKey: ['component', id], type: 'active' })` is awaited so the cache lands the post-conflict state. Note: `refetchQueries`, **not** `invalidateQueries` — the latter resolves once the cache marker is set, not after the network round-trip, so `getQueryData` would still see the user's stale snapshot. See the inline comment at `ComponentDetailPage.tsx:110-121` for the rationale; future "simplifications" back to `invalidate` are wrong.
2. The post-refetch `ComponentDetail` is fed to [`describeOptimisticConflict`](../../frontend/src/lib/conflict.ts), which builds a toast that names *what* and *when* (using the freshly-loaded `updatedAt`). When the cache fetch hasn't landed yet (rare in practice), the helper degrades to a "updated by another user" message rather than inventing data.
3. Toast is `variant: 'destructive'` — colour matches the prior failure UX so the user sees something went wrong without reading the title.

This is the lighter path Plan §7.1.6 explicitly allowed. The full ConflictResolutionDialog with field-level diff and merge actions is deferred to B7.2.

## Auth gating

| Action | UX gate | Server gate |
|---|---|---|
| Read everything | none (public per CRS Phase 1 backward compat) | `permitAll` filter chain on GET |
| Plain edit | none (any authenticated user with `EDIT_COMPONENTS`) | `canEditComponent(#id.toString())` |
| Archive / unarchive | none (Switch is always interactive) | `canArchiveComponent(...)` (ROLE_ADMIN today) |
| Rename | `disabled` input with hint when missing `RENAME_COMPONENTS` | `canRenameComponent(...)` (ROLE_ADMIN today) |
| Delete | `RequirePermission` around the page (the route is gated up-front)<sup>†</sup> | `canDeleteComponent(...)` |

<sup>†</sup> Today the page itself is reachable to any authenticated user; the Delete button does its own check via `useCurrentUser` + `hasPermission('DELETE_COMPONENTS')`. See `ComponentDetailPage.tsx` for the exact placement.

## Navigation between detail pages

When the user navigates `/components/A → /components/B`, React Router can reuse the page instance. The page-level `useForm` rehydrates via `useEffect([component, setValue])`, but `<ComponentSelect>` and `<PeopleInput>` keep internal state (`inputValue`) in their own `useState`. To prevent stale typed-but-unblurred input from leaking into the new component's form, we pass `key={component.id}` to `<GeneralTab>` so React tears down the subtree and remounts on navigation. See `ComponentDetailPage.tsx:282-289` for the rationale comment.

## Files of interest

- [`frontend/src/pages/ComponentDetailPage.tsx`](../../frontend/src/pages/ComponentDetailPage.tsx)
- [`frontend/src/components/editor/GeneralTab.tsx`](../../frontend/src/components/editor/GeneralTab.tsx)
- [`frontend/src/components/ui/ComponentSelect.tsx`](../../frontend/src/components/ui/ComponentSelect.tsx)
- [`frontend/src/components/editor/ComponentHistoryTab.tsx`](../../frontend/src/components/editor/ComponentHistoryTab.tsx)
- [`frontend/src/lib/conflict.ts`](../../frontend/src/lib/conflict.ts)
- [`frontend/src/hooks/useComponent.ts`](../../frontend/src/hooks/useComponent.ts)

## Related

- CRS [`ADR-004`](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/004-auth-keycloak.md) — role / permission matrix.
- CRS technical-design `§6.3` `PermissionEvaluator` — method → permission table.
- [`docs/features/audit-log.md`](audit-log.md) — what's behind the History tab.
