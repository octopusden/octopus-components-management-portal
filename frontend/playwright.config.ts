import { defineConfig, devices } from '@playwright/test'

// Three Playwright projects keep storageState one-to-one with the spec
// they run, so an admin journey can never accidentally pick up a viewer
// cookie or vice versa. Project assignment is enforced by `testMatch`,
// not per-test test.skip(): if a spec moves projects, you change one
// glob here, not a sprinkle of conditionals across the suite.
//
// `workers: 1` and `fullyParallel: false` are kept on purpose. The portal
// keeps OAuth2 client state in an in-memory session store; running specs
// in parallel risks cross-test bleed via shared SESSION cookies even when
// each project has its own storageState. Until that's proven safe, serial.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // CI retries 2× to absorb a known, agent-dependent flake: the bundled
  // chromium-headless-shell #GPs (SIGSEGV) on its FIRST launch on Oracle Linux
  // 8/10 podman agents (it passes on RL9). The next launch in the same warm
  // container succeeds, so a retry recovers. Locally we keep retries: 0 so real
  // failures surface immediately. (Root-cause container fix tracked separately.)
  retries: process.env.CI ? 2 : 0,
  // List reporter for human-readable streaming into Gradle stdout, plus
  // JUnit + HTML so TeamCity (and a debugging engineer) get per-spec
  // results and screenshots on failure. Output paths are stable — the
  // PlaywrightContainer bind-mounts these directories from the host so
  // the artefacts survive the container's exit.
  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8090',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-anon',
      use: { ...devices['Desktop Chrome'] },
      // Anon project deliberately does NOT load any storageState — the
      // whole point is to assert the unauthenticated path.
      testMatch: /smoke-anon\.spec\.ts$/,
    },
    {
      name: 'chromium-viewer',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/viewer.json',
      },
      // Viewer project owns the smoke slice that doesn't touch /admin
      // (gated by IMPORT_DATA permission), plus the cross-role check
      // that /admin redirects viewers to /components. Also picks up
      // regression-*.spec.ts files — those are bug-reproduction specs
      // that exercise read-only endpoints, so the viewer storageState
      // (COMPONENTS_REGISTRY_VIEWER → ACCESS_COMPONENTS + ACCESS_AUDIT) is enough.
      testMatch: /(smoke-viewer|admin-migration-viewer|regression-[^/]+)\.spec\.ts$/,
    },
    {
      name: 'chromium-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      // Admin project owns the admin smoke slice, the migration
      // page.route happy-path / disabled-button journeys, and the
      // visual-acceptance suite under e2e/visual/. Visual specs are
      // route-mocked and admin-authenticated, so they piggyback this
      // project rather than starting a fourth one.
      //
      // The visual sub-pattern uses a negative-lookahead `(?!_)` so that
      // underscore-prefixed specs (e.g. `_compare-vs-prototype.spec.ts`)
      // are treated as ad-hoc compare/debug tools and never gated. Run
      // them manually via a direct path: `npx playwright test
      // e2e/visual/_compare-vs-prototype.spec.ts`.
      //
      // `editor-*` specs are editor-flow journeys that need
      // CREATE_COMPONENTS (admin) — most are route-mocked (same project
      // shape as the visual specs), but real-CRS journeys that self-skip
      // when the backend lacks the feature also live here (each spec's
      // header says which kind it is, e.g. editor-build-history).
      testMatch: /(smoke-admin|admin-migration|editor-[^/]+|visual\/(?!_)[^/]+)\.spec\.ts$/,
    },
  ],
})
