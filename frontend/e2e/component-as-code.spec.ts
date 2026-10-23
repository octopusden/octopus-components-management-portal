import { test, expect, type APIRequestContext } from '@playwright/test'

// "As Code" tab on the component detail page. Viewer has ACCESS_COMPONENTS, which
// is all the as-code endpoint requires, so this runs in the chromium-viewer project.
// No self-skip: the pinned CRS image (crs.version) serves GET .../as-code, so a
// non-OK probe is a real failure, not a missing feature.
//
// Data: the seeded `e2e-component` (src/test/resources/e2e/crs-fixture/TestComponents.groovy)
// has a single ALL_VERSIONS block, so every version resolves in real CRS. That makes
// the resolved view a positive check (200 + the rendered body), and leaves no real
// version outside the ranges — the out-of-range hint is exercised against a mocked 404.
const SEEDED_COMPONENT = 'e2e-component'
const IN_RANGE_VERSION = '1.0.0'
const OUT_OF_RANGE_VERSION = '0.0.0-out-of-range'

test.describe('Components Management Portal – As Code tab (viewer)', () => {
  async function seededComponentId(request: APIRequestContext): Promise<string> {
    const resp = await request.get(`/rest/api/4/components?search=${SEEDED_COMPONENT}&page=0&size=20`)
    expect(resp.ok(), `component search returned HTTP ${resp.status()}`).toBe(true)
    const data = (await resp.json()) as { content: Array<{ id: string; name: string }> }
    const match = data.content.find((c) => c.name === SEEDED_COMPONENT)
    expect(match, `seeded component ${SEEDED_COMPONENT} not found`).toBeDefined()
    return match!.id
  }

  const isResolveFor = (version: string) => (url: string) =>
    url.includes('/as-code?') && new URL(url).searchParams.get('version') === version

  test('renders highlighted code and supports Full/Resolved + Copy', async ({ page }) => {
    const id = await seededComponentId(page.request)

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

    // Resolved, in range: real CRS must resolve it, and the <pre> must show exactly
    // that response body. Registered before the switch so no response is missed;
    // waiting on it also keeps the previous Full <pre> from passing during the
    // 350ms version debounce.
    const resolved = page.waitForResponse((r) => isResolveFor(IN_RANGE_VERSION)(r.url()))
    await page.getByRole('tab', { name: /^resolved$/i }).click()
    const versionInput = page.getByLabel('Version', { exact: true })
    await expect(versionInput).toBeVisible()
    await versionInput.fill(IN_RANGE_VERSION)
    const resolvedResp = await resolved
    expect(resolvedResp.status(), `GET as-code?version=${IN_RANGE_VERSION}`).toBe(200)
    await expect(codeBlock).toHaveText(await resolvedResp.text(), { useInnerText: true, timeout: 10_000 })

    // Resolved, out of range: CRS answers 404 for a version outside every range; the
    // seeded data has none, so that answer is mocked. The UI must show the hint, not
    // an error and not a code block.
    await page.route(
      (url) => isResolveFor(OUT_OF_RANGE_VERSION)(url.toString()),
      (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ errorMessage: 'No configuration resolves for that version' }),
        }),
    )
    await versionInput.fill(OUT_OF_RANGE_VERSION)
    await expect(page.getByText(/falls outside every configured range/i)).toBeVisible({ timeout: 10_000 })
    await expect(codeBlock).toHaveCount(0)

    // Back to Full, then Copy → success toast.
    await page.getByRole('tab', { name: /^full$/i }).click()
    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    // .first(): the toast title is also echoed in the toast's live region.
    await expect(page.getByText(/copied to clipboard/i).first()).toBeVisible({ timeout: 5_000 })
  })
})
