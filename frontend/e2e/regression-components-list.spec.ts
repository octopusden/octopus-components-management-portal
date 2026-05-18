import { test, expect } from '@playwright/test'

// Contract guard: GET /rest/api/4/components must return 200 with a Page
// envelope when the SPA's canonical default sort is in flight. The SPA's
// useComponents hook sorts by `componentKey,asc` — the schema-v2 entity
// property (CRS PR #192's V1__schema.sql renamed `components.name` →
// `components.component_key`; the JPA property followed the column).
// Spring Data binds `sort=` to the entity property directly; the v4
// design deliberately does NOT carry a backward-compat alias for the
// old `sort=name`, so the portal owns the property name on the wire.
//
// Pinning this end-to-end here guards two regressions:
//   1. A future SPA change that flips the default back to `sort=name`
//      would 500 against CRS — this test would fail immediately on
//      every list-page load.
//   2. A CRS-side entity / mapper rename that renames `componentKey`
//      to something else would also trip here, surfacing as a
//      portal-blocking contract change in the e2e gate rather than as
//      a "Failed to load components" toast in prod.
//
// History: the original probes asserted that `sort=name` should work as
// a backward-compat alias; that contract was dropped in v4 (decision:
// no backward-compat — clients use the canonical property name).
//
// Runs under the viewer storageState (ACCESS_COMPONENTS is sufficient).

test.describe('Contract: GET /rest/api/4/components list endpoint', () => {
  test('default SPA query (sort=componentKey,asc) returns 200 with a Page body', async ({ page }) => {
    const resp = await page.request.get(
      '/rest/api/4/components?page=0&size=20&sort=componentKey,asc',
    )
    if (resp.status() !== 200) {
      const body = await resp.text().catch(() => '<no body>')
      throw new Error(
        `Expected 200 from GET /rest/api/4/components?page=0&size=20&sort=componentKey,asc, ` +
          `got ${resp.status()}. Body: ${body}`,
      )
    }
    const json = await resp.json()
    // Sanity-check the response shape matches PageComponentSummaryResponse
    // — a "200 OK with the wrong body" regression also trips here.
    expect(json).toHaveProperty('content')
    expect(Array.isArray(json.content)).toBe(true)
    expect(json).toHaveProperty('totalElements')
  })

  test('bare list call (no query string) returns 200', async ({ page }) => {
    // Pageable parameters are optional on the controller; the endpoint
    // defaults to page=0 / size=20 / unsorted. Asserts the endpoint
    // itself is reachable independently of the sort param.
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
})
