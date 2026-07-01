import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Field overrides via the ONE combined Save — real-CRS journey (item D).
//
// Field overrides used to write immediately (POST/PATCH/DELETE
// /components/{id}/field-overrides). Item D folds them into the editor's single
// SaveBar → Review dialog → ONE component PATCH carrying `fieldOverrides` as a
// desired-FULL-SET (CRS #385). This spec proves an override added in the UI
// rides that combined PATCH and persists.
//
// Feature-gated on the CRS image: an image predating #385 ignores the unknown
// `fieldOverrides` field on PATCH, so the override would not persist. The setup
// test probes the contract via the API and skips the UI journey on an old image
// (same spirit as editor-attribute-matrix's GAV / #358 gates).
//
// Serial: the UI test reuses the component created in setup.
// ---------------------------------------------------------------------------

const SUFFIX = Date.now().toString(36)
const COMPONENT = `e2e-fo-${SUFFIX}`
const ATTR = 'build.javaVersion'
const RANGE = '[2.0,3.0)'
const VALUE = '17'

async function mutationHeaders(page: Page): Promise<Record<string, string>> {
  await page.request.get('/rest/api/4/components?page=0&size=1')
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
  }
}

// Identical flow to editor-attribute-matrix: the sticky SaveBar → Review dialog.
async function saveViaReviewBar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save changes' }).click()
  const dialog = page.getByRole('dialog', { name: /review changes/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
}

test.describe.serial('Field overrides ride the combined Save (admin, real CRS)', () => {
  let id: string | undefined
  let supported = false

  test('setup: create a MAVEN component and probe the fieldOverrides-on-PATCH contract', async ({ page }) => {
    const api = page.request
    const headers = await mutationHeaders(page)

    const create = await api.post('/rest/api/4/components', {
      headers,
      data: { name: COMPONENT, componentOwner: 'e2e-admin', baseConfiguration: { build: { buildSystem: 'MAVEN' } } },
    })
    expect(create.ok(), `cannot create ${COMPONENT} (HTTP ${create.status()})`).toBeTruthy()
    id = ((await create.json()) as { id: string }).id

    // Probe: PATCH with a fieldOverrides desired-set, then read it back. An
    // image without #385 ignores the field → GET shows no override → skip.
    const detail = (await (await api.get(`/rest/api/4/components/${id}`)).json()) as { version: number }
    const probe = await api.patch(`/rest/api/4/components/${id}`, {
      headers,
      data: {
        version: detail.version,
        clearGroup: false,
        fieldOverrides: [{ overriddenAttribute: ATTR, versionRange: '[9.0,9.1)', value: '8' }],
      },
    })
    if (probe.ok()) {
      const list = (await (await api.get(`/rest/api/4/components/${id}/field-overrides`)).json()) as Array<{
        versionRange: string
      }>
      supported = list.some((o) => o.versionRange === '[9.0,9.1)')
      // Revert the probe override so the UI journey starts from a clean slate.
      if (supported) {
        const after = (await (await api.get(`/rest/api/4/components/${id}`)).json()) as { version: number }
        await api.patch(`/rest/api/4/components/${id}`, {
          headers,
          data: { version: after.version, clearGroup: false, fieldOverrides: [] },
        })
      }
    }
    test.skip(!supported, 'CRS image predates the fieldOverrides-on-PATCH contract (#385) — skipping UI journey')
  })

  test('add an override on the Overrides tab → combined Save → it persists', async ({ page }) => {
    test.skip(!id || !supported, 'setup did not create the component or the contract is unsupported')

    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /overrides/i }).click()

    // Open the Add-Override modal and fill a scalar (build.javaVersion) override.
    await page.getByRole('button', { name: /add override/i }).click()
    const dialog = page.getByRole('dialog', { name: /add override/i })
    await expect(dialog).toBeVisible()
    // Attribute Select (Radix combobox) → Java Version.
    await dialog.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Java Version', exact: true }).click()
    await dialog.getByLabel('Version Range').fill(RANGE)
    await dialog.getByPlaceholder('Value for Java Version').fill(VALUE)
    await dialog.getByRole('button', { name: /^create$/i }).click()
    await expect(dialog).toBeHidden()

    // The queued override arms the ONE SaveBar (no immediate write happened).
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await saveViaReviewBar(page)
    await expect(page.getByText('Component saved').first()).toBeVisible({ timeout: 10_000 })

    // Persisted: reload → the override row is in the table (rode the combined PATCH).
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /overrides/i }).click()
    const table = page.getByRole('table')
    await expect(table.getByText(ATTR)).toBeVisible()
    await expect(table.getByText(RANGE)).toBeVisible()
  })

  test.afterAll(async ({ playwright }) => {
    if (!id) return
    const use = test.info().project.use
    const ctx = await playwright.request.newContext({
      baseURL: use.baseURL,
      storageState: use.storageState as string | undefined,
    })
    try {
      await ctx.get('/rest/api/4/components?page=0&size=1')
      const token = (await ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')?.value
      const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
      }
      const del = await ctx.delete(`/rest/api/4/components/${id}`, { headers })
      expect(del.ok(), `cleanup delete failed (HTTP ${del.status()}) for ${id}`).toBeTruthy()
    } finally {
      await ctx.dispose()
    }
  })
})
