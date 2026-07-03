# Component Detail

> Target users: `ACCESS_COMPONENTS` for read; per-tab gates for writes (see "Auth gating" below).

The detail page at `/components/<UUID>` is the editor surface. It renders [`pages/ComponentDetailPage.tsx`](../../frontend/src/pages/ComponentDetailPage.tsx) and decomposes into tabs (General, **Solution** (conditional), **Misc**, Build, VCS, **Documentation**, Distribution, Jira, Escrow, **Supported Versions**, Configurations, As Code, Overrides, History). The page-level form lives once and General / Solution / Documentation / Misc all share its state via `react-hook-form`. The `Tabs` are controlled so a server 400 on a field that lives on a non-active tab auto-switches to the owning tab (`sectionForField`, incl. `docs → documentation`).

**Labels** are edited in the page **header** (badges + a popover [`HeaderLabelsEditor`](../../frontend/src/components/editor/HeaderLabelsEditor.tsx)), not on General. A component with `solution = true` is flagged in the header (a prominent badge + an info `StatusBanner`).

## URL stability

`ComponentTable` links by **UUID** (`row.original.id`), so the URL is stable across renames. CRS `GET /rest/api/4/components/{idOrName}` resolves both forms — direct UUID lookup first, name fallback on `404`. Mutations (`PATCH`, `DELETE`) go through UUID only because the controller signature is `@PathVariable id: UUID`. After a rename, `useComponent.invalidateQueries(['component', id])` refreshes the cache; the URL doesn't change.

## Tabs

| Tab | Source | Notes |
|---|---|---|
| **General** | `GeneralTab` | Identity + ownership + metadata: name, **Display Name (nullable + unique; required for explicit+external)**, owner, release managers, security champions, system, clientCode, copyright, artifact IDs, plus a read-only **"who can edit"** list (owner + release managers + security champions, from `GET /{id}/editors`; admins also edit). **Solution toggle, Doc links, and Labels no longer live here** (see Solution / Documentation topics and the header labels editor). Detailed below. |
| **Solution** | `SolutionTab` | Conditional topic (Overview group) — rendered **only** when the component key matches a service-config solution pattern (`isSolutionCandidate`, `/portal/config`) **and** `component.solution` field-config isn't `hidden`. A single `solution` toggle; `readonly` field-config disables it, and `buildUpdateRequest` omits `solution` when hidden/readonly (defense-in-depth). Shares the page form. |
| **Documentation** | `DocumentationTab` | Doc-links editor moved off General (Build & Release group). `{ docComponentKey, majorVersion? }` rows backed by `component_doc_links`; a CRS `docs` 400 auto-switches here. Shares the page form. |
| **Misc** | `MiscTab` | Parent Component, Can-be-parent, and the read-only Group Key / synthetic-group display — moved off General. Shares the page form; the header Save covers it. `MISC_TAB_FIELDS` lets the 400 handler auto-switch here when a parent/canBeParent error returns. |
| **Build / VCS / Distribution / Jira / Escrow** | `BuildTab` etc. | Per-tab Save buttons; each tab handles its own mutation slice via the page-level `updateMutation`. Build's **Java / Maven Version** are dropdowns sourced from `GET /meta/{java,maven}-versions` (CRS `application.yml`, per-install overridable). Jira's **Display Name** is shown only when it diverges from the component display name. Mostly out of scope for this doc. |
| **Supported Versions** | `SupportedVersionsTab` | Coverage editor — the decoupled-version-model layer 1 (CRS [ADR-018](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/018-decoupled-version-model.md)), independent of per-attribute overrides. Reads `GET /{id}/supported-versions` → `{all, ranges, warnings}`; `all` ⇒ every version is defined, else `supported = ∪ ranges` (a version outside resolves to 404). Add-range / remove / "Set to all versions" each **declaratively PUT the full desired set** (instant save, no page-level Save bar) and the server returns the **merged** coverage (overlapping/contiguous ranges collapse; a set tiling all-versions becomes `all`) + non-blocking V1/V5 `warnings` (an override left outside supported). `useUpdateSupportedVersions` seeds the cache with the PUT response before invalidating, so back-to-back edits don't replace from stale data. Detailed below. |
| **Overrides** | `FieldOverrides` | Per-version field overrides. **Open-upper ranges (`[2.0,)`) are now first-class** (ADR-018; `isAllowedOverrideRange` rejects only the all-versions sentinel — that is the base default). Out of scope otherwise. |
| **History** | `ComponentHistoryTab` (B7.1.2) | New in P1; detailed below. |

## Supported versions (coverage) tab

The decoupled version model (CRS [ADR-018](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/018-decoupled-version-model.md)) splits a component's config into two independent layers: **coverage** ("supported versions") and **per-attribute overrides**. This tab edits layer 1; the Overrides tab + inline editors edit layer 2.

- **Read:** `useSupportedVersions` → `GET /{id}/supported-versions` → `{ all, ranges, warnings }`. `all = true` renders "All versions" (no bounded coverage rows); otherwise the bounded `ranges` are listed in numeric order (`compareVersionRanges`).
- **Write (declarative, instant):** there is **no page-level Save** — add-range, remove, and "Set to all versions" each compute the full desired set and `PUT` it via `useUpdateSupportedVersions`. The server stores the set **merged** (overlapping/contiguous ranges collapse into maximal segments; a set tiling all-versions becomes `all`) and returns that merged coverage plus non-blocking `warnings` (V1/V5 — an override left entirely outside supported never resolves). Coverage is **decoupled** from overrides — it never reshapes them (no write-time auto-split) — but it does change which enumerated range **views** resolve (the read-time partition), so the mutation seeds the cache with the response before invalidating and also invalidates `field-overrides` + `component`.
- **Client validation:** the add input gates on `isAllowedOverrideRange` (valid syntax, not an all-versions shape incl. a `(,)` segment inside a composite). Overlapping/adjacent ranges are **allowed** — the server merges them (no disjoint requirement); only the all-versions sentinel is rejected (use "Set to all versions"). Editing is gated by component ownership (`canEdit`); read-only otherwise.
- **Relation to Overrides:** open-upper override ranges (`[2.0,)`) are now first-class on the Overrides tab; "extend coverage to ≥2 and default it to value X" is two edits — extend supported here, add an open-upper override there.
- **Version lifecycle (future teaser).** A read-only, non-interactive "coming soon" block sits at the bottom of the tab showing the planned lifecycle states (Active development / On maintenance / Archived). It is the structural home for the deferred lifecycle layer (CRS [ADR-018](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/018-decoupled-version-model.md)); not yet wired to any state.

## General tab

### Name (B7.1.4 — rename)

The name input is gated by `RENAME_COMPONENTS`. With the permission, the input is editable; without, it's `disabled` with explicit explanatory text:

> Renaming requires the `RENAME_COMPONENTS` permission (typically `ROLE_ADMIN`). Ask an admin to rename this component or request the permission.

For users with the permission a different hint surfaces:

> Renaming changes the canonical identifier — every legacy v1/v2/v3 lookup by old name will resolve to the renamed component.

The UX gate is a hint, not a security boundary. Server-side `@PreAuthorize canRenameComponent` is the actual authority — bypassing the disabled state would still get a 403. The reason we still gate in the UI is to set expectations: a "disabled forever" lie creates support tickets.

The save handler in `ComponentDetailPage.handleSave` only sends `name` on a real change (`trimmedName !== '' && trimmedName !== component.name`). Defence in depth — even if the UI gate were bypassed, an unchanged form value never trips the server's gate.

### Display Name (nullable + unique; required for explicit+external)

`displayName` is **nullable** + UNIQUE server-side, stored verbatim from the DSL — it is NOT
backfilled to the component key (so the legacy v1/v2/v3 `$.name` stays byte-compatible). It is
**required only for explicit+external** components (`distribution.explicit && distribution.external`,
mirroring the CRS DSL validator); otherwise optional. On the General tab the `*` marker / create-form
requirement therefore appears only under that gate. `buildUpdateRequest` value-compares against the
persisted value and gates on *interacted* (dirty OR touched), so **clearing** it sends `""` — the
server stores `null` (or returns a 400 keyed `displayName` for an explicit+external component, routed
inline). There is no client clear-guard: a clear is a valid edit and the server owns the EE rule. A
uniqueness 400 (keyed `displayName`; a duplicate component **key** is keyed `name`) maps inline. In
the list/detail UI the display name is shown as a secondary line only when present AND it differs
from the name (otherwise a redundant echo or absent).

### Parent component (B7.1.5) — now on the Misc tab

The parent picker (and Can-be-parent / Group Key) moved to `MiscTab.tsx`. `<ComponentSelect>`
autocomplete (`frontend/src/components/ui/ComponentSelect.tsx`) drives the parent picker:
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

### Schema-v2 child collections (PR #38 Wave B)

With CRS schema v2 (`component_configurations` as the wide row), component child collections are edited from the page-level form:

- **TeamCity projects** — `projectId` rows backed by the `component_teamcity_projects` child table. Sort order is preserved (server sorts by `sort_order`); the header exposes them as read-only quick links.
- **Doc links** — `{ docComponentKey: string, majorVersion?: string | null }` rows backed by `component_doc_links`. Identifies the documentation source by component key and (optionally) the major version it documents (e.g. `3.x`); the editor maps a blank input to `null` on save. **Moved to the dedicated Documentation topic** ([`DocumentationTab`](../../frontend/src/components/editor/DocumentationTab.tsx)); it still shares the page form and saves in the same PATCH.
- **Artifact IDs** — `{ groupPattern: string, artifactPattern: string }` rows backed by `component_artifact_ids`. Order preserved; primary use is fuzzy-match by build artifact identifier in downstream Feign consumers. Edited from General via [`ArtifactOwnershipEditor`](../../frontend/src/components/editor/ArtifactOwnershipEditor.tsx).

The editable collections share the page-level `react-hook-form` state; the page Save bar sends them together with scalar General fields in one PATCH.

### Release Managers / Security Champions (SYS-039 — multi-value)

`releaseManager` and `securityChampion` are **ordered multi-value** lists (first = primary), edited with [`PeopleListInput`](../../frontend/src/components/ui/PeopleListInput.tsx) — a reorderable people editor (add / remove / move-up / move-down) that reuses the single-value `PeopleInput` autocomplete for its add-row. `componentOwner` is **unchanged** — it stays a single-value `PeopleInput`.

- **JSON field names stay singular** (`releaseManager`, `securityChampion`); only the type changed `string` → `string[]` in the v4 contract. Legacy v1/v2/v3 keep the comma-joined `String`.
- **UI labels are plural** ("Release Managers" / "Security Champions"); the form field keys remain singular.
- **Dedupe**: a username already present cannot be added again (keep-first), mirroring the server-side canonicalization (trim → drop-blank → keep-first dedupe).
- **Employee status**: after two typed characters, each people picker asks CRS for an exact username match via `GET /rest/api/4/components/meta/employees?search=...`; matching suggestions are marked Active or Inactive before selection. Saved owner / release-manager / security-champion values are checked together via `POST /rest/api/4/components/meta/employees/status`, and inactive values get an inline badge.
- **Fail-open UI**: when employee-service integration is disabled or unavailable, CRS returns no match / `null` status. The Portal then renders no status badge and still lets CRS enforce the configured write-time policy.
- **Create dialog**: Component Owner is required and uses the same exact-match picker. A field-prefixed CRS `400` is rendered inline instead of as a generic toast.
- **Save semantics mirror `labels`**: the `PeopleListInput.onChange` sets `{ shouldDirty: true, shouldTouch: true }`, and `ComponentDetailPage` synthesises a dirty flag for the clear-all case (touched + server-had-values + form-now-empty). `buildUpdateRequest` then dirty-gates a REPLACE: omit when not dirty (pre-hydration guard), emit the ordered canonicalized array when dirty (with `[]` = explicit clear).
- The readonly field-config branch renders the joined list (comma-separated, disabled).

> People fields are **not** part of the global **Component Defaults** admin form (`ComponentDefaultsForm`): the real `Defaults.groovy` never sets `componentOwner` / `releaseManager` / `securityChampion`, so those three inputs were removed and any stale stored keys are stripped on load and before every save (form-view and raw-JSON paths).

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
| Plain edit | Save and inline override controls follow the detail response `canEdit` flag | `canEditComponent(#id.toString())` |
| Archive / unarchive | none (Switch is always interactive) | `canArchiveComponent(...)` (ROLE_ADMIN today) |
| Rename | `disabled` input with hint when missing `RENAME_COMPONENTS` | `canRenameComponent(...)` (ROLE_ADMIN today) |
| Delete | `RequirePermission` around the page (the route is gated up-front)<sup>†</sup> | `canDeleteComponent(...)` |

<sup>†</sup> Today the page itself is reachable to any authenticated user; the Delete button does its own check via `useCurrentUser` + `hasPermission('DELETE_COMPONENTS')`. See `ComponentDetailPage.tsx` for the exact placement.

## Navigation between detail pages

When the user navigates `/components/A → /components/B`, React Router can reuse the page instance. The page-level `useForm` rehydrates via `useEffect([component, setValue])`, but `<ComponentSelect>`, `<PeopleInput>` and `<PeopleListInput>`'s add-row keep internal state (`inputValue`) in their own `useState`. To prevent stale typed-but-unblurred input from leaking into the new component's form, we pass `key={component.id}` to `<GeneralTab>` so React tears down the subtree and remounts on navigation. See `ComponentDetailPage.tsx:282-289` for the rationale comment.

## Files of interest

- [`frontend/src/pages/ComponentDetailPage.tsx`](../../frontend/src/pages/ComponentDetailPage.tsx)
- [`frontend/src/components/editor/GeneralTab.tsx`](../../frontend/src/components/editor/GeneralTab.tsx)
- [`frontend/src/components/ui/ComponentSelect.tsx`](../../frontend/src/components/ui/ComponentSelect.tsx)
- [`frontend/src/components/ui/PeopleListInput.tsx`](../../frontend/src/components/ui/PeopleListInput.tsx)
- [`frontend/src/components/editor/ComponentHistoryTab.tsx`](../../frontend/src/components/editor/ComponentHistoryTab.tsx)
- [`frontend/src/lib/conflict.ts`](../../frontend/src/lib/conflict.ts)
- [`frontend/src/hooks/useComponent.ts`](../../frontend/src/hooks/useComponent.ts)

## Related

- CRS [`ADR-004`](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/004-auth-keycloak.md) — role / permission matrix.
- CRS technical-design `§6.3` `PermissionEvaluator` — method → permission table.
- [`docs/features/audit-log.md`](audit-log.md) — what's behind the History tab.
