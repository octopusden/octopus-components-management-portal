import { test, expect } from '@playwright/test'

// "As Code" tab on the component detail page. Viewer has ACCESS_COMPONENTS, which
// is all the as-code endpoint requires, so this runs in the chromium-viewer project.
// No self-skip: the pinned CRS image (crs.version) serves GET .../as-code, so a
// non-OK probe is a real failure, not a missing feature.
test.describe('Components Management Portal – As Code tab (viewer)', () => {
  async function firstComponentId(request: import('@playwright/test').APIRequestContext): Promise<string> {
    const resp = await request.get('/rest/api/4/components?page=0&size=1')
    const data = await resp.json()
    return data.content[0].id as string
  }

  test('renders highlighted code and supports Full/Resolved + Copy', async ({ page }) => {
    const id = await firstComponentId(page.request)

    const probe = await page.request.get(`/rest/api/4/components/${id}/as-code`)
    expect(probe.ok(), `GET as-code for ${id} returned HTTP ${probe.status()}`).toBe(true)

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })

    // Open the tab.
    await page.getByRole('tab', { name: /as code/i }).click()

    // FULL view: a highlighted code block with the component definition.
    const codeBlock = page.locator('pre')
    await expect(codeBlock).toBeVisible({ timeout: 10_000 })
    await expect(codeBlock).toContainText('{')

    // Registered before the switch: the box may be seeded with 1.0.0 already. Waiting
    // for this response keeps the previous <pre> from passing the check below while
    // the 350ms version debounce is still pending.
    const resolved = page.waitForResponse(
      (r) => r.url().includes('/as-code?') && new URL(r.url()).searchParams.get('version') === '1.0.0',
    )

    // Switch to Resolved → a version input appears.
    await page.getByRole('tab', { name: /^resolved$/i }).click()
    const versionInput = page.getByLabel('Version', { exact: true })
    await expect(versionInput).toBeVisible()
    await versionInput.fill('1.0.0')
    await resolved
    // Either the resolved code renders or the inline "falls outside every configured
    // range" hint shows (depends on fixture data) — both are acceptable, just no crash.
    await expect(
      page.locator('pre').or(page.getByText(/falls outside every configured range/i)),
    ).toBeVisible({ timeout: 10_000 })

    // Back to Full, then Copy → success toast.
    await page.getByRole('tab', { name: /^full$/i }).click()
    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    // .first(): the toast title is also echoed in the toast's live region.
    await expect(page.getByText(/copied to clipboard/i).first()).toBeVisible({ timeout: 5_000 })
  })
})
