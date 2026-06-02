import { test, expect } from '@playwright/test'

// "As Code" tab on the component detail page. Viewer has ACCESS_COMPONENTS, which
// is all the as-code endpoint requires. The spec self-skips until the CRS backend
// ships GET /rest/api/4/components/{id}/as-code (separate PR), so it won't flake
// against a registry image that predates the endpoint.
test.describe('Components Management Portal – As Code tab (viewer)', () => {
  async function firstComponentId(request: import('@playwright/test').APIRequestContext): Promise<string> {
    const resp = await request.get('/rest/api/4/components?page=0&size=1')
    const data = await resp.json()
    return data.content[0].id as string
  }

  test('renders highlighted code and supports Full/Resolved + Copy', async ({ page }) => {
    const id = await firstComponentId(page.request)

    const probe = await page.request.get(`/rest/api/4/components/${id}/as-code`)
    test.skip(!probe.ok(), `as-code endpoint not deployed (HTTP ${probe.status()})`)

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })

    // Open the tab.
    await page.getByRole('tab', { name: /as code/i }).click()

    // FULL view: a highlighted code block with the component definition.
    const codeBlock = page.locator('pre')
    await expect(codeBlock).toBeVisible({ timeout: 10_000 })
    await expect(codeBlock).toContainText('{')

    // Switch to Resolved → a version input appears.
    await page.getByRole('tab', { name: /^resolved$/i }).click()
    const versionInput = page.getByLabel('Version')
    await expect(versionInput).toBeVisible()
    await versionInput.fill('1.0.0')
    // Either the resolved code renders or an inline "no configuration resolves"
    // hint shows (depends on fixture data) — both are acceptable, just no crash.
    await expect(
      page.locator('pre').or(page.getByText(/no configuration resolves/i)),
    ).toBeVisible({ timeout: 10_000 })

    // Back to Full, then Copy → success toast.
    await page.getByRole('tab', { name: /^full$/i }).click()
    await page.getByRole('button', { name: /copy/i }).click()
    await expect(page.getByText(/copied to clipboard/i)).toBeVisible({ timeout: 5_000 })
  })
})
