# Admin: Migration

> Target users: registry admins (Keycloak realm role mapped to `IMPORT_DATA` permission, i.e. `ROLE_ADMIN` per CRS ADR-004).

## What it does

Triggers a full Git → DB migration of the legacy components-registry DSL (Groovy/Kotlin) into the CRS PostgreSQL schema. After the cut-over the CRS resolver serves all components from DB rather than re-parsing Git on every restart.

## UI surface

- **Where:** `/admin` (`AdminSettingsPage`) → "Migration" tab. Visible only to users carrying the `IMPORT_DATA` permission (`RequirePermission`).
- **Components:**
  - [`frontend/src/components/admin/MigrationPanel.tsx`](../../frontend/src/components/admin/MigrationPanel.tsx) — main UI: idle / running / completed / failed states, "Run migration" button, four result tiles, per-component progress.
  - [`frontend/src/components/AdminPane.tsx`](../../frontend/src/components/AdminPane.tsx) — Admin-mode footer toggle that gates the destructive button. See [`admin-mode.md`](admin-mode.md).

## Backend contract (CRS, owned by MIG-027)

| Method | Path | Status | Body |
|---|---|---|---|
| `POST` | `/rest/api/4/admin/migrate` | `202 Accepted` (newly-started) **or** `409 Conflict` (existing `RUNNING` job — re-run guard) | `MigrationJobResponse` |
| `GET` | `/rest/api/4/admin/migrate/job` | `200 OK` (running / completed / failed) **or** `404 Not Found` (no job since pod boot) | `MigrationJobResponse \| null` |
| `GET` | `/rest/api/4/admin/migration-status` | `200 OK` | `MigrationStatus { git, db, total }` |

Wire shape (`MigrationJobResponse`, see CRS `dto/v4/MigrationJobResponse.kt`):

```ts
type JobState = 'RUNNING' | 'COMPLETED' | 'FAILED'

interface MigrationJobResponse {
  id: string                  // UUID assigned at startAsync()
  state: JobState
  startedAt: string           // ISO instant
  finishedAt: string | null   // null while RUNNING
  total: number
  migrated: number
  failed: number
  skipped: number
  currentComponent: string | null   // populated during RUNNING
  errorMessage: string | null       // populated on FAILED
  result: FullMigrationResult | null // populated on COMPLETED
}
```

There is no `CANCELLED` state and no cancel endpoint. Cancellation is out of scope (CRS MIG-027 §Out of scope).

## Frontend logic

[`frontend/src/hooks/useMigration.ts`](../../frontend/src/hooks/useMigration.ts) hosts three hooks:

- **`useRunMigration`** (`POST /admin/migrate`): mutation that resolves successfully on both 202 *and* 409 — the same body shape comes back in either case, the only thing that differs is the HTTP status. Code path: catch the `ApiError`, parse the JSON body, treat as success. Rationale: the SPA should *attach* to a running job rather than show a destructive error block under the button it just clicked.
- **`useMigrationJob`** (`GET /admin/migrate/job`): polls every **1 s** while `state === 'RUNNING'`; stops polling on terminal states. Returns `null` (not error) on 404 — that just means "no job since pod boot, render the idle state."
- **`useMigrationStatus`** (`GET /admin/migration-status`): the running counts (`db` / `git` / `total`). MigrationPanel polls this at 3 s while a job is running so the top-tile counters climb live as components commit.

## State machine & UX

```
                 ┌─── 404 ────────────────► IDLE
                 │     (no job since boot)    │
                 │                            │ click "Run migration"
                 │                            ▼
GET /admin/migrate/job          POST /admin/migrate
                 │                  │           │
                 │       202 ──────►│           │ 409
                 │                  ▼           ▼
                 └─── 200, RUNNING ►RUNNING (poll @1s)
                                    │
                                    ├─► COMPLETED  → result tiles + invalidate caches
                                    └─► FAILED     → errorMessage + retry button
```

UX details to preserve:

- **Fast path on 202:** if CRS hands back `state === 'COMPLETED'` directly (executor finished before the response was built — backend tests force this via `SyncTaskExecutor`, but a real production thread can win the race on small migrations), `useRunMigration.onSuccess` invalidates the `['migration', 'status']` and `['config', 'component-defaults']` query caches. The polling listener never sees the RUNNING → COMPLETED transition in that case, so this short-circuit is necessary.
- **Pod restart during RUNNING:** the next `GET /admin/migrate/job` returns 404 (state was in-memory). The SPA falls back to IDLE. The user must re-run. Tracked in CRS [MIG-028](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/requirements-migration.md).
- **Re-run after COMPLETED / FAILED:** allowed. CRS replaces the slot; the previous result is no longer reachable via `GET /admin/migrate/job`. The SPA never rendered a "history" of jobs, only the current one.

## Auth gates (real, not UX)

The "Run migration" button is gated in two layers:

| Layer | What it checks | Authority |
|---|---|---|
| UX | User has `IMPORT_DATA` permission **and** Admin-mode is toggled in the footer. | UX hint only — not a security boundary. |
| Backend | Class-level `@PreAuthorize("@permissionEvaluator.canImport()")` on `AdminControllerV4` + `WebSecurityConfig` `/rest/api/4/**` requires JWT. | The actual gate. CRS [MIG-024](https://github.com/octopusden/octopus-components-registry-service/blob/v3/docs/db-migration/requirements-migration.md). |

Removing the UX gate would not let a non-admin run a migration — the server would 403. The Admin-mode toggle exists to prevent the kind of fat-finger admin disaster that comes from a single-click migration in a browser tab someone opened a week ago.

## Performance budget

- ~933 components migrate in **under 5 minutes** on a hot CRS pod (warm Git clone, warm JVM).
- Cold pods can take longer (several minutes for the initial clone). This is not a contractual SLA, but a smoke-test budget — use it to catch regressions in `ImportService`.

See CRS NFS §5.6 "Async migration job" for the full perf/observability table.

## Tests

- Unit / integration: `frontend/src/components/admin/MigrationPanel.test.tsx`, `frontend/src/hooks/useMigration.test.ts`.
- Backend: CRS `MigrationIntegrationTest`, `AdminControllerV4SecurityTest` (auth gate per MIG-024).
- E2E: not yet — see [TD-001](../tech-debt/TD-001-playwright-keycloak-fixture.md).

## Known gaps

1. **Job state is in-memory** (single-pod). Pod restart loses progress. Tracked in CRS MIG-028.
2. **No audit_log entries for run start / end** — the migration run itself is not synthesized into an audit row, only the per-component CRUD events it produces are. Open follow-up under MIG-028.
3. **No cancellation** — by design (MIG-027 §Out of scope). If you need to "stop" a running migration, restart the pod (which is the only effective cancel today, and which leaves state in the 404 branch).
