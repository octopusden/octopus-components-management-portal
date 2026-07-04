import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Version Preview applies per-range overrides LIVE — real-CRS journey,
// chromium-admin (picked up by the `editor-[^/]+` testMatch).
//
// This is the cross-repo behaviour gate for the live preview: it creates a
// component whose BASE release format is `$major.$minor.$service-$fix` with a
// per-range override on `(,1.0.107)` → `$major.$minor.$service`, opens the Jira
// tab, types a version INSIDE that range, and asserts the preview's Release row
// renders the OVERRIDE format (`1.0.3`), not the base (`1.0.3-0`).
//
// It caught the shipped bug that unit tests missed (the client ladder ignored
// per-range overrides entirely): here the whole chain runs — Portal builds the
// request, CRS resolves the override + renders, Portal maps it back.
//
// Setup self-skips only on the INFRA preconditions (a CRS image without the
// fieldOverrides-on-PATCH contract or without the POST /rest/api/4/versions/preview
// endpoint). Once both are present the UI assertion is UNCONDITIONAL, so a Portal
// build that renders the preview client-side (ignoring overrides) fails here.
//
// Serial: the UI test reuses the component created in setup.
// ---------------------------------------------------------------------------

const SUFFIX = Date.now().toString(36)
const COMPONENT = `e2e-vpo-${SUFFIX}`
const BASE_RELEASE = '$major.$minor.$service-$fix'
const OVERRIDE_RELEASE = '$major.$minor.$service'
const RANGE = '(,1.0.107)'
// 1.0.3 is inside (,1.0.107): base → "1.0.3-0" (with -$fix), override → "1.0.3".
const INPUT_VERSION = '1.0.3'
const EXPECTED_RELEASE = '1.0.3'
const BASE_RENDERED = '1.0.3-0'

async function mutationHeaders(page: Page): Promise<Record<string, string>> {
  await page.request.get('/rest/api/4/components?page=0&size=1')
  const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
  }
}

test.describe.serial('Version Preview applies per-range overrides (admin, real CRS)', () => {
  let id: string | undefined
  let supported = false

  test('setup: create a component with a release-format override on a range', async ({ page }) => {
    const api = page.request
    const headers = await mutationHeaders(page)

    // Infra probe 1: the live preview endpoint must exist on the CRS image.
    const preview = await api.post('/rest/api/4/versions/preview', {
      headers,
      data: { version: '1.0.0', base: { minorVersionFormat: '$major', releaseVersionFormat: '$major.$minor' } },
    })
    if (preview.status() === 404) {
      test.skip(true, 'CRS image predates POST /rest/api/4/versions/preview — skipping')
      return
    }
    expect(preview.ok(), `preview endpoint errored (HTTP ${preview.status()})`).toBeTruthy()

    const create = await api.post('/rest/api/4/components', {
      headers,
      data: {
        name: COMPONENT,
        componentOwner: 'e2e-admin',
        baseConfiguration: {
          build: { buildSystem: 'MAVEN' },
          jira: { lineVersionFormat: '$major.$minor', releaseVersionFormat: BASE_RELEASE },
        },
      },
    })
    expect(create.ok(), `cannot create ${COMPONENT} (HTTP ${create.status()})`).toBeTruthy()
    id = ((await create.json()) as { id: string }).id

    // Add the per-range release-format override via the fieldOverrides-on-PATCH
    // contract (#385); skip the UI journey if the image predates it.
    const detail = (await (await api.get(`/rest/api/4/components/${id}`)).json()) as { version: number }
    const patch = await api.patch(`/rest/api/4/components/${id}`, {
      headers,
      data: {
        version: detail.version,
        clearGroup: false,
        fieldOverrides: [{ overriddenAttribute: 'jira.releaseVersionFormat', versionRange: RANGE, value: OVERRIDE_RELEASE }],
      },
    })
    if (patch.ok()) {
      const list = (await (await api.get(`/rest/api/4/components/${id}/field-overrides`)).json()) as Array<{
        overriddenAttribute: string
        versionRange: string
      }>
      supported = list.some((o) => o.overriddenAttribute === 'jira.releaseVersionFormat' && o.versionRange === RANGE)
    }
    test.skip(!supported, 'CRS image predates the fieldOverrides-on-PATCH contract (#385) — skipping UI journey')
  })

  test('typing a version inside the override range renders the override format in the preview', async ({ page }) => {
    test.skip(!id || !supported, 'setup did not create the component or a precondition is unsupported')

    await page.goto(`/components/${id}`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /jira/i }).click()

    const preview = page.getByTestId('jira-version-preview')
    await expect(preview).toBeVisible()

    // Type a version inside (,1.0.107).
    const versionInput = preview.getByLabel('version', { exact: true })
    await versionInput.fill(INPUT_VERSION)

    // The Release row must render the OVERRIDE format (1.0.3), not the base
    // (1.0.3-0). Playwright auto-retries past the debounce + fetch.
    const releaseValue = preview.getByTestId('ladder-row-release').getByTestId('ladder-value')
    await expect(releaseValue).toHaveText(EXPECTED_RELEASE, { timeout: 10_000 })
    await expect(releaseValue).not.toHaveText(BASE_RENDERED)
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
