import { expect, type Locator, type Page } from '@playwright/test'

// Geometry assertions for catching "formatting is completely broken" bugs that
// jsdom unit tests cannot see (jsdom has no layout engine, so overflow / overlap
// / non-working `truncate` all render "fine" there). Underscore-prefixed so the
// playwright.config `visual/(?!_)` testMatch does NOT treat this as a spec.

/** Assert `locator`'s content does not overflow its own box horizontally
 *  (i.e. any `truncate`/`overflow` actually clips instead of spilling out). */
export async function expectNoHorizontalOverflow(locator: Locator, tolerancePx = 1): Promise<void> {
  const { scrollWidth, clientWidth } = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(
    scrollWidth,
    `horizontal overflow: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + tolerancePx)
}

/** Assert the page itself has no horizontal scrollbar (nothing spills past the viewport). */
export async function expectNoPageOverflow(page: Page, tolerancePx = 1): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(
    scrollWidth,
    `page overflows horizontally: documentElement.scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`,
  ).toBeLessThanOrEqual(innerWidth + tolerancePx)
}

/** Assert two elements' bounding boxes do not intersect (e.g. a control rendered
 *  on top of overflowing text). */
export async function expectNoOverlap(a: Locator, b: Locator, tolerancePx = 1): Promise<void> {
  const [ba, bb] = await Promise.all([a.boundingBox(), b.boundingBox()])
  expect(ba, 'first locator has no bounding box').not.toBeNull()
  expect(bb, 'second locator has no bounding box').not.toBeNull()
  const disjoint =
    ba!.x + ba!.width <= bb!.x + tolerancePx ||
    bb!.x + bb!.width <= ba!.x + tolerancePx ||
    ba!.y + ba!.height <= bb!.y + tolerancePx ||
    bb!.y + bb!.height <= ba!.y + tolerancePx
  expect(
    disjoint,
    `elements overlap:\n  a=${JSON.stringify(ba)}\n  b=${JSON.stringify(bb)}`,
  ).toBeTruthy()
}
