# Admin Mode

## What it is

A **UX-only** switch that gates destructive actions in the SPA (e.g. "Run migration") for users who already have the backend permission. It exists to prevent fat-finger admin actions from a long-lived browser tab.

It is **not a security boundary** — the actual authorization is enforced server-side by CRS `@PreAuthorize` on every admin endpoint (see [`admin-migration.md`](admin-migration.md) §"Auth gates" and CRS [ADR-004](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/registry/adr/004-auth-keycloak.md)).

## How it works

State lives in a small zustand store: [`frontend/src/lib/adminModeStore.ts`](../../frontend/src/lib/adminModeStore.ts).

```ts
interface AdminModeState {
  enabled: boolean
  toggle: () => void
  set: (enabled: boolean) => void
}

export const useAdminMode = create<AdminModeState>()(
  persist(
    (set) => ({
      enabled: false,
      toggle: () => set((s) => ({ enabled: !s.enabled })),
      set: (enabled) => set({ enabled }),
    }),
    { name: 'octopus.portal.adminMode' },
  ),
)
```

Properties:

- **Default off** on first load (`enabled: false`).
- **Persisted to `localStorage`** under key `octopus.portal.adminMode` so the toggle survives page refreshes.
- **Per-browser**, not per-user. Logging out and logging in as a different user does not reset the flag — the next admin in the same browser starts with the previous admin's last setting.

## Toggle UI

[`frontend/src/components/AdminPane.tsx`](../../frontend/src/components/AdminPane.tsx) renders the switch in the app footer (`AppFooter`). It is only mounted for users with the `IMPORT_DATA` permission (`RequirePermission`); non-admins never see it.

## How features consume it

```tsx
import { useAdminMode } from '../lib/adminModeStore'

function MigrationButton() {
  const adminMode = useAdminMode((s) => s.enabled)
  return (
    <Button disabled={!adminMode} onClick={runMigration}>
      Run migration
    </Button>
  )
}
```

When designing a new destructive feature:

1. Gate the **button enable** on `useAdminMode`.
2. Render a hint near the disabled button: e.g. "Enable Admin mode in the footer to run migration."
3. Do **not** rely on this for security. Always make sure the backend rejects the action with 403 if the user lacks the permission, regardless of UX state.

## What goes behind the gate

Use Admin mode for actions that are:

- **Cluster-wide** in effect (a one-click migration of all components).
- **Hard to reverse** without restoring from backup.
- **Likely to fire by accident** in a long-lived tab.

Do **not** gate everyday CRUD on it (editing one component's escrow config is gated by `canEditComponent` on the server and visible to the user as part of the form workflow — that's enough).

Today the only thing behind Admin mode is "Run migration" in [`docs/features/admin-migration.md`](admin-migration.md). When new candidates appear, document them here.

## Tests

- `frontend/src/lib/adminModeStore.test.ts` — store behavior + localStorage persistence.
- `frontend/src/components/AdminPane.test.tsx` — toggle visibility (only for admins) + interaction.
- Cross-feature: `frontend/src/components/admin/MigrationPanel.test.tsx` asserts the button is disabled when `enabled === false`.

## Known gaps

- **State is per-browser, not per-user.** If a shared kiosk-style admin workstation is ever a concern, this needs to clear on logout. Not currently a problem.
