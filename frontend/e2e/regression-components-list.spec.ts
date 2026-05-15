import { test, expect } from '@playwright/test'

// Regression: GET /rest/api/4/components returns 500 from CRS build 2.0.84-3367
// (the schema-v2 stack landed in CRS PR #192 + PR #193). Reported manually on
// the deployed env — the SPA's first-page list call surfaces a "Failed to load
// components" banner with the raw error body. Reproduced here at the HTTP
// layer so the failure is isolated from any UI rendering concerns.
//
// Three probes:
//   1. The exact call the SPA makes on /components page load (page+size+sort).
//   2. A bare call with no query string — to disambiguate whether the failure
//      depends on a specific param (sort=name,asc is a likely suspect — JPA
//      sort by a property that may have been renamed in the schema-v2 entity)
//      or whether the list endpoint is broken outright.
//   3. A probe with sort=componentKey,asc — schema-v2 renamed `components.name`
//      to `components.component_key` in V1__schema.sql; if the JPA property
//      followed the column rename, this is what the SPA should be sending.
//
// Test stays failing until CRS resolves the underlying 500. The portal cannot
// fix the server-side error on its own — once probe #3 passes against
// 2.0.84-3367 we can rebind the SPA's useComponents sort default, which is
// the portal-side half of the fix. Probes #1 + #2 stay as the contract
// expectation against the post-fix CRS build.
//
// Runs under the viewer storageState (ACCESS_COMPONENTS is sufficient).

test.describe('Regression: GET /rest/api/4/components first-page 500', () => {
  test('default SPA query (page=0&size=20&sort=name,asc) returns 200 with a Page body', async ({ page }) => {
    const resp = await page.request.get(
      '/rest/api/4/components?page=0&size=20&sort=name,asc',
    )
    // Reported failure: 500 with Spring's default ErrorResponse body. The
    // assertion failure message below echoes the body verbatim so the CRS
    // team has the exact server-side timestamp + path on first inspection.
    if (resp.status() !== 200) {
      const body = await resp.text().catch(() => '<no body>')
      throw new Error(
        `Expected 200 from GET /rest/api/4/components?page=0&size=20&sort=name,asc, ` +
          `got ${resp.status()}. Body: ${body}`,
      )
    }
    const json = await resp.json()
    // Sanity-check the response shape matches PageComponentSummaryResponse so
    // a "200 OK with wrong body" regression also catches.
    expect(json).toHaveProperty('content')
    expect(Array.isArray(json.content)).toBe(true)
    expect(json).toHaveProperty('totalElements')
  })

  test('bare list call (no query string) returns 200 — isolates the sort=name suspect', async ({ page }) => {
    const resp = await page.request.get('/rest/api/4/components')
    if (resp.status() !== 200) {
      const body = await resp.text().catch(() => '<no body>')
      throw new Error(
        `Expected 200 from GET /rest/api/4/components (no params), ` +
          `got ${resp.status()}. Body: ${body}`,
      )
    }
    const json = await resp.json()
    expect(json).toHaveProperty('content')
  })

  test('list call with sort by componentKey (schema-v2 column rename) returns 200', async ({ page }) => {
    // Hypothesis probe: schema-v2 V1__schema.sql renamed components.name to
    // components.component_key (CRS PR #192). If the JPA property followed
    // the column rename, the SPA's `sort=name,asc` would throw inside JPA
    // and bubble up as a 500. If THIS probe passes and probe #1 fails,
    // the portal-side patch is to default useComponents sort to
    // `componentKey,asc`.
    const resp = await page.request.get(
      '/rest/api/4/components?page=0&size=20&sort=componentKey,asc',
    )
    if (resp.status() !== 200) {
      const body = await resp.text().catch(() => '<no body>')
      throw new Error(
        `Expected 200 from GET /rest/api/4/components?sort=componentKey,asc, ` +
          `got ${resp.status()}. Body: ${body}`,
      )
    }
    // Page-shape sanity: same gate the other two probes use. Catches a
    // future "200 OK with the wrong body" regression where CRS returns
    // an empty / placeholder response without throwing.
    const json = await resp.json()
    expect(json).toHaveProperty('content')
    expect(Array.isArray(json.content)).toBe(true)
  })
})
