import { test, expect } from '@playwright/test'
import auditFixture from './fixtures/audit-actions.json' with { type: 'json' }
import componentsFixture from './fixtures/components-with-archived.json' with { type: 'json' }
import fieldConfigFixture from './fixtures/field-config-mixed-visibility.json' with { type: 'json' }
import {
  mockAuditRecent,
  mockComponentDetail,
  mockComponentList,
  mockFieldConfig,
  mockOwners,
} from './_helpers'

// PR-2 visual-acceptance: every variant-driven UI surface must emit a
// stable data-variant / data-visibility attribute that downstream specs
// (and humans regressing the design system) can rely on without resorting
// to className substring matches.

test.describe('design tokens — Audit log action badges', () => {
  test('CREATE → success, UPDATE/RENAME → warning, DELETE → destructive', async ({ page }) => {
    await mockAuditRecent(page, auditFixture)
    await page.goto('/audit')

    // Each action label is rendered inside a Badge; the closest [data-variant]
    // ancestor is the Badge root. We auto-wait on visibility before reading
    // attributes — `Locator.getAttribute()` does not auto-retry, only
    // `expect(...).toHaveAttribute(...)` does.
    const expectVariant = async (text: string, variant: string) => {
      const label = page.getByText(text, { exact: true }).first()
      await expect(label).toBeVisible()
      const badge = label.locator('xpath=ancestor-or-self::*[@data-variant][1]')
      await expect(badge).toHaveAttribute('data-variant', variant)
    }

    await expectVariant('CREATE', 'success')
    await expectVariant('UPDATE', 'warning')
    await expectVariant('DELETE', 'destructive')
    await expectVariant('RENAME', 'warning')
  })
})

test.describe('design tokens — FieldConfig visibility cells', () => {
  test('each visibility Select trigger carries field-specific aria-label + data-visibility', async ({
    page,
  }) => {
    await mockFieldConfig(page, fieldConfigFixture)
    await page.goto('/admin')
    // The Field Configuration tab is the default in AdminSettings; if not,
    // the test will still pass once admin routing brings it forward.
    await page.getByRole('tab', { name: /field configuration/i }).click().catch(() => {
      // Tab may already be active or routing may auto-select it.
    })

    // Fixture defines: displayName=editable, clientCode=readonly, solution=hidden.
    const displayName = page.getByRole('combobox', { name: /displayName visibility/ })
    const clientCode = page.getByRole('combobox', { name: /clientCode visibility/ })
    const solution = page.getByRole('combobox', { name: /solution visibility/ })

    await expect(displayName).toHaveAttribute('data-visibility', 'editable')
    await expect(clientCode).toHaveAttribute('data-visibility', 'readonly')
    await expect(solution).toHaveAttribute('data-visibility', 'hidden')
  })
})

test.describe('design tokens — Component detail Archive button', () => {
  test('Archive button uses Button variant="destructive" (no inline custom classes)', async ({
    page,
  }) => {
    // ComponentDetailPage hits four endpoints on render: the list (header
    // breadcrumb fetches it), the detail body, the registry-wide field
    // config (visibility-gating in GeneralTab), and the owners list
    // (PeopleInput suggestions). All four MUST be route-mocked — leaving
    // any unmocked makes the spec dependent on live CRS state and risks
    // flakiness when admins change field-config or owners drift.
    await mockComponentList(page, componentsFixture)
    await mockFieldConfig(page, fieldConfigFixture)
    await mockOwners(page, [])

    // Build a non-archived component detail fixture from the list entry.
    const summary = (componentsFixture as { content: Array<Record<string, unknown>> }).content[0]
    const detailFixture = {
      ...summary,
      archived: false,
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      metadata: {},
      buildConfigurations: [],
      vcsSettings: [],
      distributions: [],
      jiraComponentConfigs: [],
      escrowConfigurations: [],
      versions: [],
    }
    await mockComponentDetail(page, detailFixture)

    await page.goto(`/components/${summary.id}`)

    // Header Archive button (not the AlertDialog confirm; pre-click only one
    // exists). Use exact /^archive$/i to avoid matching "Unarchive".
    const archiveBtn = page.getByRole('button', { name: /^archive$/i })
    await expect(archiveBtn).toBeVisible()
    await expect(archiveBtn).toHaveAttribute('data-variant', 'destructive')
  })
})
