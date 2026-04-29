import { test, expect } from '@playwright/test'

// Anonymous-only assertions. No storageState — the project deliberately
// runs without cookies so we exercise the gateway's permitAll set and the
// 302 → OIDC redirect for protected routes.
test.describe('Components Management Portal – anonymous smoke', () => {
  test('portal/info is reachable anonymously', async ({ page }) => {
    const resp = await page.request.get('/portal/info')
    expect(resp.ok()).toBeTruthy()
  })

  test('protected routes redirect to OIDC entry point', async ({ page }) => {
    // Don't follow redirects in the assertion itself — Playwright's `page.goto`
    // follows them by default, so we end up at the Keycloak login URL. That URL
    // is what we want to verify.
    const response = await page.goto('/components')
    expect(response).not.toBeNull()
    const finalUrl = page.url()
    // Either the portal-side OIDC entry point or the Keycloak login page is
    // a valid landing — what we want is "not the SPA shell".
    expect(finalUrl).toMatch(/\/(realms\/portal\/protocol\/openid-connect\/auth|oauth2\/authorization\/keycloak)/)
  })
})
