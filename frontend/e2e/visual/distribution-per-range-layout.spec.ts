import { test, expect } from '@playwright/test'
import fieldConfigFixture from './fixtures/field-config-mixed-visibility.json' with { type: 'json' }
import { mockComponentDetail, mockComponentList, mockFieldConfig, mockOwners } from './_helpers'
import { expectNoHorizontalOverflow, expectNoOverlap, expectNoPageOverflow } from './_layout'

// Issue #146 layout guard. The per-range variant summary is a long comma-joined
// marker list; a broken `truncate` (e.g. on an inline element) lets it overflow
// the row and render the Edit/Delete controls on top of the text. jsdom unit
// tests cannot catch this (no layout engine) — a real browser can. Route-mocked
// so it needs no live CRS and is deterministic.

const ID = '11111111-1111-1111-1111-111111111111'

// Long docker summaries — generic tokens only. Six images per variant → a
// summary far wider than the row, so a non-truncating layout overflows.
const LONG_DOCKER = Array.from({ length: 6 }, (_, i) => ({
  imageName: `com.example.distribution.sample/example-service-module-${i}`,
  flavor: 'release',
}))

const RANGES = [
  '[1.7.3076,1.7.3209]', '[1.7.3210,1.7.3234)', '[1.7.3234,1.7.3431]', '(1.7.3431,1.7.3455)',
  '[1.7.3455,1.7.3483)', '[1.7.3483,1.7.3485)', '[1.7.3485,1.7.3491)', '[1.7.3491,1.7.3667]',
  '[1.7.3668,1.7.3688]', '[1.7.3689,1.7.3699)', '[1.7.3699,1.7.3774)', '[1.7.3774,1.8.309)',
  '[1.8.309,)',
]

const OVERRIDES = RANGES.map((versionRange, i) => ({
  id: `fo-${i}`,
  overriddenAttribute: 'distribution.docker',
  versionRange,
  rowType: 'MARKER',
  value: null,
  markerChildren: { dockerImages: LONG_DOCKER },
  createdAt: null,
  updatedAt: null,
}))

const DETAIL = {
  id: ID, name: 'layout-probe', displayName: 'Layout Probe', componentOwner: 'e2e',
  systems: [], productType: null, clientCode: null, solution: false, parentComponentName: null,
  archived: false, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: null,
  labels: [], docs: [], artifactIds: [], distributionExplicit: false, distributionExternal: false,
  securityGroups: [], teamcityProjects: [], canEdit: true,
  configurations: [
    {
      id: 'cfg-1', versionRange: '(,0),[0,)', rowType: 'BASE', overriddenAttribute: null,
      isSyntheticBase: false, build: null, escrow: null, jira: null,
      vcsEntries: [], mavenArtifacts: [], fileUrlArtifacts: [], dockerImages: [], packages: [], requiredTools: [],
    },
  ],
}

test.describe('Docker tab — per-range variant row layout (issue #146)', () => {
  test('long per-range summaries truncate; controls never overlap the text or overflow the page', async ({ page }) => {
    await mockComponentList(page, { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 })
    await mockComponentDetail(page, DETAIL)
    await mockFieldConfig(page, fieldConfigFixture)
    await mockOwners(page, [])
    await page.route('**/rest/api/4/components/*/field-overrides', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OVERRIDES) }),
    )

    await page.goto(`/components/${ID}`)
    // Docker images (and their per-range variants) moved to their own tab.
    await page.getByRole('tab', { name: /docker/i }).click()

    const section = page.getByTestId('docker-images-section')
    const rows = section.getByTestId('dist-per-range-row')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBe(OVERRIDES.length)

    for (let i = 0; i < OVERRIDES.length; i++) {
      const row = rows.nth(i)
      // The row's content must not spill past its own width (truncation works).
      await expectNoHorizontalOverflow(row)
      // The Edit control must not sit on top of the (truncated) summary text.
      await expectNoOverlap(
        row.getByTitle(/example-service/),
        row.getByRole('button', { name: /edit per-range variant/i }),
      )
    }

    // And nothing spills past the viewport.
    await expectNoPageOverflow(page)
  })
})
