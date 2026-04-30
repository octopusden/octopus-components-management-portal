# Audit Log

> Target users: `ACCESS_AUDIT` (today held by `ROLE_REGISTRY_VIEWER`, `ROLE_REGISTRY_EDITOR`, `ROLE_ADMIN`).

Two surfaces consume the audit log:

- **Global feed** at `/audit` (`pages/AuditLogPage.tsx`) — newest changes across all entities, with a filter sidebar (B7.1.3).
- **Per-component history** as a tab inside the component detail page (B7.1.2). Documented in [`docs/features/component-detail.md`](component-detail.md) §"History tab"; the wire-level details are also covered here.

Both surfaces render through the same [`AuditLogTable`](../../frontend/src/components/AuditLogTable.tsx) + [`AuditDiffViewer`](../../frontend/src/components/AuditDiffViewer.tsx) so the visual contract is identical.

## Global feed (B7.1.3)

`GET /rest/api/4/audit/recent` accepts seven optional filter params (CRS contract `SYS-036`); combinations are ANDed server-side. The page exposes five of them in the [`AuditLogFilters`](../../frontend/src/components/AuditLogFilters.tsx) sidebar (the remaining two — `entityType` + `entityId` — are owned by the per-component History tab):

| Filter | UI control | Wire param | Notes |
|---|---|---|---|
| **Changed by** | Debounced text input (300 ms) | `changedBy` | Free-text username. `''` → `undefined` (clear). The debounce convention matches `ComponentFilters` so a typist doesn't fire N requests per word. |
| **Source** | `<Select>` from `[api, git-history]` + "All sources" sentinel | `source` | Today only `api` (default for runtime events) and `git-history` (backfill from `/admin/migrate-history`) are emitted. Other values are reserved for future writers. |
| **Action** | `<Select>` from `[CREATE, UPDATE, DELETE, RENAME, ARCHIVE]` + "All actions" | `action` | Static enum. CRS could theoretically emit other action strings; if so, `action` is best-effort. |
| **From** | `<input type="datetime-local">` | `from` (ISO instant) | Browser-local time → `Date#toISOString()` → `Z`-suffixed UTC. CRS parses via `@DateTimeFormat(ISO.DATE_TIME)`. Half-open lower bound. |
| **To** | `<input type="datetime-local">` | `to` (ISO instant) | Same conversion. Half-open upper bound (`< to`). |

`from`/`to` together form a half-open `[from, to)` window over `audit_log.changed_at`. The [`localToInstant`](../../frontend/src/components/AuditLogFilters.tsx) helper is the conversion boundary — `new Date('2026-04-30T08:30')` (no Z, no offset) is parsed as the user's local time per ECMA-262, which is what we want.

A "Clear filters" button surfaces whenever any filter is active and resets the whole filter object to `{}`. Filter changes also reset the page to 0 to avoid landing the user on an out-of-bounds page when the result set shrinks.

## Per-component history (B7.1.2)

[`ComponentHistoryTab`](../../frontend/src/components/editor/ComponentHistoryTab.tsx) on the detail page issues `GET /rest/api/4/audit/Component/<id>` via [`useEntityAuditLog`](../../frontend/src/hooks/useAuditLog.ts).

Two things to know:

1. The entity-type literal is `'Component'` (capitalized), case-sensitive. It must match what `ComponentManagementServiceImpl` writes when publishing `AuditEvent`s (CRS `technical-design.md §6.4`). A revert that swaps casing on either side returns an empty page silently.
2. Page size is hard-coded to 50 with no "load more" affordance today. Components with >50 audit entries silently drop older rows. Tracked as a [B7.2 polish](../tech-debt/) — the existing `AuditLogTable` does not yet expose `totalElements` to the History tab, so a "Showing 50 of N" hint would need a small refactor.

Reuses `AuditLogTable` rather than minting a per-component variant. The duplicate "Entity Type" + "Entity ID" columns are noise on this surface (they're constant), but trimming them would fork the table for a cosmetic win — also B7.2 polish.

## Wire shape

```ts
// frontend/src/lib/types.ts
interface AuditLogEntry {
  id: number
  entityType: string         // 'Component' (today only)
  entityId: string           // UUID for components
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RENAME' | 'ARCHIVE' | string
  changedBy: string | null   // username from `audit_log.changed_by`
  changedAt: string          // ISO instant
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  changeDiff: Record<string, unknown> | null
  correlationId: string | null
  // Note: `source` ('api' | 'git-history') is present in CRS response but not yet
  // typed in the frontend interface — tracked as part of TD-002.
}
```

`changedBy` is populated via `SecurityService.getCurrentUser().username` (cloud-commons) for authenticated API events (see CRS technical-design §6.4), with a fallback of `'system'` for background contexts such as `/admin/migrate-history`. Audit rows written before the Keycloak auth wiring (commit `b97fad2`) may have `null` — the table renders that as italic *system*. Git-history rows carry the original git author signature ("Name \<email\>") rather than a Keycloak username.

## CSRF / auth

Both endpoints sit under `/rest/**` and are proxied through the portal gateway with TokenRelay; CRS gates on `@PreAuthorize @permissionEvaluator.hasPermission('ACCESS_AUDIT')`. CSRF doesn't apply (the endpoints are GET).

## Files of interest

- [`frontend/src/pages/AuditLogPage.tsx`](../../frontend/src/pages/AuditLogPage.tsx)
- [`frontend/src/components/AuditLogFilters.tsx`](../../frontend/src/components/AuditLogFilters.tsx)
- [`frontend/src/components/AuditLogTable.tsx`](../../frontend/src/components/AuditLogTable.tsx)
- [`frontend/src/components/AuditDiffViewer.tsx`](../../frontend/src/components/AuditDiffViewer.tsx)
- [`frontend/src/components/editor/ComponentHistoryTab.tsx`](../../frontend/src/components/editor/ComponentHistoryTab.tsx)
- [`frontend/src/hooks/useAuditLog.ts`](../../frontend/src/hooks/useAuditLog.ts)

## Related

- CRS `SYS-036` — `/audit/recent` filter params contract.
- CRS `MIG-026` — `/admin/migrate-history` (the writer behind `source = 'git-history'` rows).
- CRS technical-design `§6.4` — `CurrentUserResolver` (the writer behind `source = 'api'` rows' `changedBy`).
