import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('renders an em-dash for a clean component', () => {
    const { container } = renderBadge(clean())
    expect(container.textContent).toContain('—')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders an em-dash for a component absent from the report', () => {
    const { container } = renderBadge(undefined)
    expect(container.textContent).toContain('—')
  })

  it('renders the missingCount on the badge for problem components', () => {
    renderBadge(withProblems(3, ['v1', 'v2', 'v3']))
    const btn = screen.getByRole('button', { name: /3 validation problems/i })
    expect(btn).toBeDefined()
    expect(btn.textContent).toContain('3')
  })

  it('uses singular wording for a single missing version', () => {
    renderBadge(withProblems(1, ['v1']))
    expect(screen.getByRole('button', { name: /1 validation problem$/i })).toBeDefined()
  })

  it('renders a distinct "check failed" badge when only the check failed', () => {
    renderBadge(failedCheck())
    const btn = screen.getByRole('button', { name: /validation check failed/i })
    expect(btn).toBeDefined()
    expect(btn.textContent?.toLowerCase()).toContain('check failed')
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
