import { test, expect } from '@playwright/test'
import componentsFixture from './fixtures/components-with-archived.json' with { type: 'json' }
import auditFixture from './fixtures/audit-actions.json' with { type: 'json' }
import {
  mockComponentList,
  mockComponentListError,
  mockAuditRecent,
  mockAuditRecentError,
} from './_helpers'

// PR-3 visual-acceptance: every page that previously inlined an empty /
// loading / error block now reaches it through one of the four state
// primitives — EmptyState, InlineError, StatusBanner, SkeletonBlock /
// SkeletonTable. Specs target their `data-testid` attributes so the
// asserts survive any future class-name churn.

const EMPTY_LIST_FIXTURE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
}

test.describe('state primitives — /components', () => {
  test('renders <SkeletonTable> while the list is loading', async ({ page }) => {
    // Stall the list response indefinitely so the skeleton stays mounted.
    await page.route('**/rest/api/4/components?**', (route) => {
      // Intentionally never call route.fulfill / continue / abort — the
      // request hangs until the test ends.
      void route
    })
    await page.goto('/components')
    await expect(page.getByTestId('skeleton-table')).toBeVisible()
  })

  test('renders <EmptyState> when the list comes back empty', async ({ page }) => {
    await mockComponentList(page, EMPTY_LIST_FIXTURE)
    await page.goto('/components')
    const empty = page.getByTestId('empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No components found')
  })

  test('renders <InlineError> when the list endpoint errors', async ({ page }) => {
    await mockComponentListError(page)
    await page.goto('/components')
    const err = page.getByTestId('inline-error')
    await expect(err).toBeVisible()
    await expect(err).toContainText(/Failed to load/i)
  })
})

test.describe('state primitives — /audit', () => {
  test('renders <EmptyState> when audit is empty', async ({ page }) => {
    await mockAuditRecent(page, EMPTY_LIST_FIXTURE)
    await page.goto('/audit')
    const empty = page.getByTestId('empty-state')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No audit log entries found.')
  })

  test('renders <InlineError> when audit endpoint errors', async ({ page }) => {
    await mockAuditRecentError(page)
    await page.goto('/audit')
    await expect(page.getByTestId('inline-error')).toBeVisible()
  })

  test('renders rows when audit returns the canonical action fixture', async ({ page }) => {
    await mockAuditRecent(page, auditFixture)
    await page.goto('/audit')
    // Row-render sanity check — guarantees the PR-2 variants are reachable.
    await expect(page.getByText('CREATE')).toBeVisible()
    await expect(page.getByText('UPDATE')).toBeVisible()
    await expect(page.getByText('DELETE')).toBeVisible()
    await expect(page.getByText('RENAME')).toBeVisible()
  })
})

test.describe('state primitives — list with data', () => {
  test('archived row is dimmed via opacity-50 when fixture contains an archived entry', async ({
    page,
  }) => {
    await mockComponentList(page, componentsFixture)
    await page.goto('/components')

    // The fixture has one row with archived: true — find it by name and
    // walk up to the closest <tr> to read its computed opacity.
    const archivedNameCell = page.getByText('legacy-archived', { exact: true }).first()
    await expect(archivedNameCell).toBeVisible()
    const tr = archivedNameCell.locator('xpath=ancestor::tr[1]')
    await expect(tr).toHaveCSS('opacity', '0.5')
  })
})
