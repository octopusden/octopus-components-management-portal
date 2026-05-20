import { test, expect } from '@playwright/test'
import componentsFixture from './fixtures/components-with-archived.json' with { type: 'json' }
import { mockComponentList, mockLabels } from './_helpers'

// Sanity smoke for the visual-acceptance harness landed in PR-1:
// confirms (a) the visual project's testMatch picks up specs under
// e2e/visual/, (b) admin storageState loads, (c) the new semantic
// tokens from index.css resolve to the expected hex values from the
// prototype theme.js. Fail-fast guard for PR-2/3/4 — if this turns red,
// downstream visual specs will too.

test.describe('Visual harness smoke', () => {
  test('semantic badge tokens resolve to prototype theme.js light values', async ({ page }) => {
    await mockComponentList(page, componentsFixture)
    await mockLabels(page, [])
    await page.goto('/components')

    // Read computed values of the new --color-badge-* custom properties on
    // the document root. We resolve via getComputedStyle rather than
    // reading the CSS source so we exercise Tailwind v4's @theme handling.
    const tokens = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement)
      const get = (name: string) => styles.getPropertyValue(name).trim()
      return {
        greenBg: get('--color-badge-green-bg'),
        greenFg: get('--color-badge-green-fg'),
        blueBg: get('--color-badge-blue-bg'),
        blueFg: get('--color-badge-blue-fg'),
        yellowBg: get('--color-badge-yellow-bg'),
        yellowFg: get('--color-badge-yellow-fg'),
        redBg: get('--color-badge-red-bg'),
        redFg: get('--color-badge-red-fg'),
        editableFg: get('--color-visibility-editable-fg'),
        readonlyFg: get('--color-visibility-readonly-fg'),
      }
    })

    expect(tokens.greenBg).toBe('#dcfce7')
    expect(tokens.greenFg).toBe('#166534')
    expect(tokens.blueBg).toBe('#dbeafe')
    expect(tokens.blueFg).toBe('#1e40af')
    expect(tokens.yellowBg).toBe('#fef9c3')
    expect(tokens.yellowFg).toBe('#854d0e')
    expect(tokens.redBg).toBe('#fee2e2')
    expect(tokens.redFg).toBe('#991b1b')
    expect(tokens.editableFg).toBe('#16a34a')
    expect(tokens.readonlyFg).toBe('#ca8a04')
  })

  test('dormant dark palette activates only when data-theme="dark" is set', async ({ page }) => {
    await mockComponentList(page, componentsFixture)
    await mockLabels(page, [])
    await page.goto('/components')

    // Tailwind v4 `@theme` normalises `hsl(...)` source values to hex on
    // ingest, so we don't compare the literal CSS string. The contract is
    // weaker but sufficient: light != dark, and toggling data-theme="dark"
    // flips the resolved colour. (Light hex is `#020817` for our current
    // foreground token; dark is `#fafafa`.)
    const fgOf = (page2: typeof page) =>
      page2.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-foreground').trim(),
      )

    const lightFg = await fgOf(page)
    expect(lightFg).not.toBe('')

    // Toggle dormant dark — tokens must flip.
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    const darkFg = await fgOf(page)
    expect(darkFg).not.toBe('')
    expect(darkFg).not.toBe(lightFg)

    // Reset for downstream tests in the same page context.
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  })
})
