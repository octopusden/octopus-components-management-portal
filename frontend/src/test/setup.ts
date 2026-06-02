import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom does not implement pointer capture or scrollIntoView, but Radix UI's
// Select / Popover / Dropdown use both during open/close transitions. Without
// these stubs the tests crash before the dropdown ever renders, so we cannot
// assert against options inside it. Stubs are no-ops — Radix's behaviour does
// not depend on the return values of capture/release in test contexts. See:
//   https://github.com/radix-ui/primitives/issues/1822
//   https://github.com/jsdom/jsdom/issues/3294
if (typeof window !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn(() => false)
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn()
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }
  // Radix Switch (and other Radix primitives that observe size) calls
  // ResizeObserver during mount; jsdom doesn't ship one. Stub it once
  // here so individual test files don't duplicate the polyfill.
  if (!('ResizeObserver' in window)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}
