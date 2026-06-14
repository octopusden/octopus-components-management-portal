import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentValidation } from '../../lib/types'

// Mock the hook so we control loading/error/data and can assert the
// enabled-gating contract (non-admin → hook called with enabled=false).
vi.mock('../../hooks/useValidationProblems', () => ({
  useComponentValidation: vi.fn(),
}))

import { useComponentValidation } from '../../hooks/useValidationProblems'
import { ValidationProblemsSection } from './ValidationProblemsSection'

const mockedHook = vi.mocked(useComponentValidation)

function hookResult(over: Partial<ReturnType<typeof useComponentValidation>>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  } as unknown as ReturnType<typeof useComponentValidation>
}

function clean(): ComponentValidation {
  return { component: 'comp-1', problems: [], checkFailed: false, checkError: null }
}

function withProblems(versions: string[]): ComponentValidation {
  return {
    component: 'comp-1',
    problems: [
      {
        type: 'UNREGISTERED_RELEASED_VERSIONS',
        severity: 'ERROR',
        message: `${versions.length} released version(s) not registered`,
        details: { versions, missingCount: versions.length },
      },
    ],
    checkFailed: false,
    checkError: null,
  }
}

function failedCheck(): ComponentValidation {
  return { component: 'comp-1', problems: [], checkFailed: true, checkError: 'RM returned 500' }
}

beforeEach(() => {
  mockedHook.mockReset()
})

describe('ValidationProblemsSection', () => {
  it('renders nothing and makes NO fetch for a non-admin', () => {
    mockedHook.mockReturnValue(hookResult({}))
    const { container } = render(
      <ValidationProblemsSection componentId="comp-1" isAdmin={false} />,
    )
    expect(container).toBeEmptyDOMElement()
    // The hook is still invoked (rules of hooks) but MUST be disabled.
    expect(mockedHook).toHaveBeenCalledWith('comp-1', false)
  })

  it('renders the full problem list with all versions for an admin', () => {
    const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']
    mockedHook.mockReturnValue(hookResult({ data: withProblems(versions) }))

    render(<ValidationProblemsSection componentId="comp-1" isAdmin />)

    expect(mockedHook).toHaveBeenCalledWith('comp-1', true)
    const section = screen.getByRole('heading', { name: /validation problems/i })
    expect(section).toBeDefined()
    for (const v of versions) {
      expect(screen.getByText(v)).toBeDefined()
    }
    expect(document.body.textContent).not.toContain('No validation problems')
  })

  it('renders a clean empty state when there are no problems', () => {
    mockedHook.mockReturnValue(hookResult({ data: clean() }))
    render(<ValidationProblemsSection componentId="comp-1" isAdmin />)
    expect(screen.getByText(/no validation problems/i)).toBeDefined()
  })

  it('surfaces a failed check honestly (not as clean)', () => {
    mockedHook.mockReturnValue(hookResult({ data: failedCheck() }))
    render(<ValidationProblemsSection componentId="comp-1" isAdmin />)
    expect(screen.getByText(/check failed/i)).toBeDefined()
    expect(screen.getByText('RM returned 500')).toBeDefined()
    expect(document.body.textContent).not.toContain('No validation problems')
  })

  it('renders a loading skeleton while the query is in flight', () => {
    mockedHook.mockReturnValue(hookResult({ isLoading: true }))
    const { container } = render(
      <ValidationProblemsSection componentId="comp-1" isAdmin />,
    )
    // SkeletonBlock renders an animate-pulse element.
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('surfaces a fetch error inline', () => {
    mockedHook.mockReturnValue(
      hookResult({ isError: true, error: new Error('boom') }),
    )
    render(<ValidationProblemsSection componentId="comp-1" isAdmin />)
    expect(screen.getByText(/failed to load validation problems/i)).toBeDefined()
    expect(screen.getByText(/boom/)).toBeDefined()
  })
})
