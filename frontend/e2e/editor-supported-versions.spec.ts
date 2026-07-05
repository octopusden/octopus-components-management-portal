import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Supported Versions (coverage) via the ONE combined Save — real-CRS journey.
//
// The Supported Versions tab used to write immediately on every edit (PUT
// /components/{id}/supported-versions), and deleting the ONLY remaining range
// PUT an empty list — which CRS canonically collapses to all=true (ADR-018),
// silently widening coverage to every historical version on a single misclick.
//
// The tab now:
//   - drives a page-level DRAFT through the sticky SaveBar → Review diff → a
//     separate PUT on Confirm; Discard reverts the draft (nothing persisted).
//   - gates the last-range delete behind an explicit confirmation that stages an
//     all-versions widen — never a silent side-effect of a delete.
//
// Feature-gated on the CRS image: an image predating the supported-versions
// endpoint has no coverage model, so the setup probe skips the UI journey.
//
// Serial: the UI tests reuse the component created in setup.
// ---------------------------------------------------------------------------

const SUFFIX = Date.now().toString(36)
const COMPONENT = `e2e-sv-${SUFFIX}`
const RANGE_A = '[1.0,2.0)'
const RANGE_B = '[2.0,3.0)'

async function mutationHeaders(page: Page): Promise<Record<string, string>> {
  await page.request.get('/rest/api/4/components?page=0&size=1')
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
  }
}

test.describe.serial('Supported Versions ride the combined Save (admin, real CRS)', () => {
  let id: string | undefined
  let supported = false

  test('setup: create a component and scope it to a single bounded range', async ({ page }) => {
    const api = page.request
    const headers = await mutationHeaders(page)

    const create = await api.post('/rest/api/4/components', {
      headers,
      data: { name: COMPONENT, componentOwner: 'e2e-admin', baseConfiguration: { build: { buildSystem: 'MAVEN' } } },
    })
    expect(create.ok(), `cannot create ${COMPONENT} (HTTP ${create.status()})`).toBeTruthy()
    id = ((await create.json()) as { id: string }).id

    // Scope coverage to one bounded range via the declarative PUT; read it back.
    // An image without the coverage endpoint 404s / ignores it → skip the journey.
    const put = await api.put(`/rest/api/4/components/${id}/supported-versions`, {
      headers,
      data: { ranges: [RANGE_A] },
    })
    if (put.ok()) {
      const cov = (await (await api.get(`/rest/api/4/components/${id}/supported-versions`)).json()) as {
        all: boolean
        ranges: string[]
      }
      supported = cov.all === false && cov.ranges.includes(RANGE_A)
    }
    test.skip(!supported, 'CRS image has no supported-versions coverage endpoint — skipping UI journey')
  })

  test('last-range delete is gated by an explicit confirm and is reversible (no silent widen)', async ({ page }) => {
    test.skip(!id || !supported, 'setup did not create the component or coverage is unsupported')

    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /supported versions/i }).click()
    await expect(page.getByText(RANGE_A)).toBeVisible()

    // Removing the only range must NOT act immediately — it opens a confirmation.
    await page.getByRole('button', { name: `Remove supported range ${RANGE_A}` }).click()
    const confirm = page.getByRole('dialog', { name: /only supported range/i })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText(/sets coverage to/i)).toBeVisible()

    // Cancel → the range is still there and nothing was staged.
    await confirm.getByRole('button', { name: /cancel/i }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByText(RANGE_A)).toBeVisible()
    await expect(page.getByText('Unsaved changes')).toBeHidden()

    // Confirm the widen → the draft flips to All versions and arms the SaveBar,
    // but nothing has been persisted yet.
    await page.getByRole('button', { name: `Remove supported range ${RANGE_A}` }).click()
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: /widen to all versions/i }).click()
    await expect(page.getByText('All versions')).toBeVisible()
    await expect(page.getByText('Unsaved changes')).toBeVisible()

    // Discard → reverts to the server-scoped range; the silent widen never happened.
    await page.getByRole('button', { name: /discard/i }).click()
    await expect(page.getByText(RANGE_A)).toBeVisible()
    await expect(page.getByText('All changes saved')).toBeVisible()

    // Reload confirms nothing was persisted: still scoped to the single range.
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /supported versions/i }).click()
    await expect(page.getByText(RANGE_A)).toBeVisible()
    await expect(page.getByText('All versions')).toBeHidden()
  })

  test('adding a range flows through the SaveBar → Review → separate PUT and persists', async ({ page }) => {
    test.skip(!id || !supported, 'setup did not create the component or coverage is unsupported')

    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /supported versions/i }).click()

    // Add a second bounded range — staged only (no immediate write).
    await page.getByLabel('New supported version range').fill(RANGE_B)
    await page.getByRole('button', { name: /add range/i }).click()
    await expect(page.getByText('Unsaved changes')).toBeVisible()

    // Review lists the coverage change, then Confirm persists via the PUT.
    await page.getByRole('button', { name: 'Save changes' }).click()
    const review = page.getByRole('dialog', { name: /review changes/i })
    await expect(review).toBeVisible()
    await expect(review.getByText(/supported versions/i)).toBeVisible()
    await review.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByText('Component saved').first()).toBeVisible({ timeout: 10_000 })

    // Persisted: reload → both ranges present (rode the separate PUT after PATCH).
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /supported versions/i }).click()
    await expect(page.getByText(RANGE_A)).toBeVisible()
    await expect(page.getByText(RANGE_B)).toBeVisible()
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
