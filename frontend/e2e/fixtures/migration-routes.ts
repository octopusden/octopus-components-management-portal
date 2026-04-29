import type { Page, Route } from '@playwright/test'

// Per-journey page.route helpers for the three migration endpoints
// MigrationPanel hits. Centralised here so all four admin-migration
// journeys share one mock vocabulary — adding a new endpoint or
// renaming one happens once, not in four places.
//
// We deliberately mock all three endpoints in every journey, even the
// ones the journey doesn't strictly need: an accidental flicker in the
// status poll (3s tick) or job poll (1s tick) could otherwise reach
// live CRS and pollute downstream assertions or audit logs.

const STATUS_PATH = '**/rest/api/4/admin/migration-status'
const START_PATH = '**/rest/api/4/admin/migrate'
const JOB_PATH = '**/rest/api/4/admin/migrate/job'

function jsonRoute(route: Route, status: number, body: unknown) {
  void route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/**
 * Idle stack — used by the disabled-button and the viewer-redirect
 * journeys. /admin/migrate/job 404s (no job has ever been started),
 * /admin/migration-status reports git=936 db=0.
 */
export async function mockIdleMigration(page: Page) {
  await page.route(STATUS_PATH, (route) => jsonRoute(route, 200, { git: 936, db: 0, total: 936 }))
  await page.route(JOB_PATH, (route) => jsonRoute(route, 404, { error: 'no job' }))
  // Mock POST too as belt-and-braces — even though the disabled-button
  // journey never clicks, a flake-driven extra click shouldn't escape.
  await page.route(START_PATH, (route) => jsonRoute(route, 409, { error: 'job already running' }))
}

/**
 * Happy-path stack — used by the run-migration journey. Walks the
 * polling loop through RUNNING with growing counters, then COMPLETED
 * with one failed component so the failed-components <details> block
 * has something to render.
 */
export async function mockHappyPathMigration(page: Page, opts?: { jobId?: string }) {
  const jobId = opts?.jobId ?? 'e2e-migration-job-1'
  const total = 936

  // Status counters move git → db as the migration runs. We don't tie
  // these to the job state precisely — a stable post-run shape keeps
  // the assertions honest without coupling them to poll timing.
  await page.route(STATUS_PATH, (route) =>
    jsonRoute(route, 200, { git: 0, db: total, total }),
  )

  // POST /migrate seeds the job. Returns RUNNING.
  await page.route(START_PATH, (route) =>
    jsonRoute(route, 202, {
      id: jobId,
      state: 'RUNNING',
      total,
      migrated: 0,
      failed: 0,
      skipped: 0,
      currentComponent: null,
    }),
  )

  // GET /migrate/job walks RUNNING(0) → RUNNING(200, current=comp-247) →
  // COMPLETED(935 migrated, 1 failed). After the COMPLETED tick we keep
  // serving the same payload so any further poll (toast effect, query
  // invalidation) sees a stable terminal state.
  let calls = 0
  await page.route(JOB_PATH, (route) => {
    calls += 1
    if (calls === 1) {
      jsonRoute(route, 200, {
        id: jobId,
        state: 'RUNNING',
        total,
        migrated: 0,
        failed: 0,
        skipped: 0,
        currentComponent: null,
      })
      return
    }
    if (calls === 2) {
      jsonRoute(route, 200, {
        id: jobId,
        state: 'RUNNING',
        total,
        migrated: 200,
        failed: 0,
        skipped: 0,
        currentComponent: 'comp-247',
      })
      return
    }
    jsonRoute(route, 200, {
      id: jobId,
      state: 'COMPLETED',
      total,
      migrated: 935,
      failed: 1,
      skipped: 0,
      currentComponent: null,
      result: {
        components: {
          total,
          migrated: 935,
          failed: 1,
          skipped: 0,
          results: [
            {
              componentName: 'comp-broken',
              success: false,
              message: 'simulated failure for e2e fixture',
            },
          ],
        },
      },
    })
  })
}
