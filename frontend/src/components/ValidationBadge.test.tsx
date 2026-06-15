import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from './ui/tooltip'
import { ValidationBadge } from './ValidationBadge'
import type { ComponentValidation } from '../lib/types'

function clean(): ComponentValidation {
  return { component: 'c', problems: [], checkFailed: false, checkError: null }
}

function withProblems(missingCount: number, versions: string[]): ComponentValidation {
  return {
    component: 'c',
    problems: [
      {
        type: 'UNREGISTERED_RELEASED_VERSIONS',
        severity: 'ERROR',
        message: `${missingCount} released version(s) not registered in components-registry`,
        details: { versions, missingCount, releasedCount: missingCount + 2 },
      },
    ],
    checkFailed: false,
    checkError: null,
  }
}

function failedCheck(): ComponentValidation {
  return { component: 'c', problems: [], checkFailed: true, checkError: 'RM returned 500' }
}

function renderBadge(validation: ComponentValidation | undefined) {
  // delayDuration={0}: Radix gates hover-open behind a timer; zero it so the
  // tooltip content asserts are deterministic in jsdom (focus opens with no
  // delay anyway). Mirrors FieldInfo.test.tsx.
  return render(
    <TooltipProvider delayDuration={0}>
      <ValidationBadge validation={validation} />
    </TooltipProvider>,
  )
}

describe('ValidationBadge rendering', () => {
  it('renders nothing (no triangle) for a clean component', () => {
    const { container } = renderBadge(clean())
    expect(container.textContent).not.toContain('—')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing for a component absent from the report', () => {
    const { container } = renderBadge(undefined)
    expect(container.textContent?.trim()).toBe('')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders an icon-only triangle (no count pill text) for problem components', () => {
    renderBadge(withProblems(3, ['v1', 'v2', 'v3']))
    // The accessible name still carries the count for AT/assertions, but the
    // visible trigger is a bare red triangle — no rendered count text.
    const btn = screen.getByRole('button', { name: /3 validation problems/i })
    expect(btn).toBeDefined()
    expect(btn.textContent).toBe('')
    // The red AlertTriangle is an svg child of the trigger.
    expect(btn.querySelector('svg')).not.toBeNull()
  })

  it('uses singular wording for a single missing version', () => {
    renderBadge(withProblems(1, ['v1']))
    expect(screen.getByRole('button', { name: /1 validation problem$/i })).toBeDefined()
  })

  it('renders the same icon-only triangle (no "check failed" text) when only the check failed', () => {
    renderBadge(failedCheck())
    const btn = screen.getByRole('button', { name: /validation check failed/i })
    expect(btn).toBeDefined()
    // No visible "check failed" label text on the trigger anymore — it is a bare
    // triangle; the wording lives in the aria-label, tooltip and dialog only.
    expect(btn.textContent).toBe('')
  })

  it('sums missingCount across multiple problems for the badge number', () => {
    const cv: ComponentValidation = {
      component: 'c',
      problems: [
        {
          type: 'UNREGISTERED_RELEASED_VERSIONS',
          severity: 'ERROR',
          message: 'a',
          details: { versions: ['x'], missingCount: 2 },
        },
        {
          type: 'OTHER',
          severity: 'ERROR',
          message: 'b',
          details: { missingCount: 4 },
        },
      ],
      checkFailed: false,
      checkError: null,
    }
    renderBadge(cv)
    expect(screen.getByRole('button', { name: /6 validation problems/i })).toBeDefined()
  })

  it('falls back to the issue count when no missingCount is present', () => {
    const cv: ComponentValidation = {
      component: 'c',
      problems: [
        { type: 'OTHER', severity: 'WARNING', message: 'no count here', details: {} },
      ],
      checkFailed: false,
      checkError: null,
    }
    renderBadge(cv)
    expect(screen.getByRole('button', { name: /1 validation problem$/i })).toBeDefined()
  })

  it('truncates the example version list with a "+N more" line in the tooltip', async () => {
    const user = userEvent.setup()
    // 6 versions > MAX_EXAMPLE_VERSIONS (5) → first 5 shown + "+1 more".
    const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']
    renderBadge(withProblems(6, versions))

    await user.hover(screen.getByRole('button', { name: /6 validation problems/i }))

    const tooltip = await screen.findByRole('tooltip')
    // First five render verbatim; the sixth is collapsed into the overflow line.
    expect(tooltip).toHaveTextContent('v5')
    expect(tooltip).toHaveTextContent('+1 more')
    // The 6th version is not listed individually.
    expect(tooltip.textContent).not.toContain('v6')
  })
})

describe('ValidationBadge full-list dialog', () => {
  it('opens a dialog with the COMPLETE version list (no "+N more") on click', async () => {
    const user = userEvent.setup()
    // 7 versions > MAX_EXAMPLE_VERSIONS (5): the dialog must show every one,
    // including v6/v7 which the tooltip would truncate.
    const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']
    renderBadge(withProblems(7, versions))

    await user.click(screen.getByRole('button', { name: /7 validation problems/i }))

    const dialog = await screen.findByRole('dialog')
    // Every version is present individually — including beyond the tooltip cap.
    for (const v of versions) {
      expect(dialog).toHaveTextContent(v)
    }
    // The dialog never truncates with the tooltip's overflow line.
    expect(dialog.textContent).not.toContain('+1 more')
    expect(dialog.textContent).not.toContain('more')
    // The Copy affordance is present.
    expect(screen.getByRole('button', { name: /copy versions/i })).toBeDefined()
  })

  it('opens the dialog with the keyboard (Enter) and closes with Escape', async () => {
    const user = userEvent.setup()
    renderBadge(withProblems(2, ['a1', 'a2']))

    screen.getByRole('button', { name: /2 validation problems/i }).focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog')).toBeDefined()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('surfaces a failed check in the dialog rather than rendering it clean', async () => {
    const user = userEvent.setup()
    renderBadge(failedCheck())

    await user.click(screen.getByRole('button', { name: /validation check failed/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/check failed/i)
    expect(dialog).toHaveTextContent('RM returned 500')
  })

  it('copies the full newline-joined version list to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const versions = ['x1', 'x2', 'x3']
    renderBadge(withProblems(3, versions))

    await user.click(screen.getByRole('button', { name: /3 validation problems/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /copy versions/i }))

    expect(writeText).toHaveBeenCalledWith('x1\nx2\nx3')
    vi.unstubAllGlobals()
  })
})
