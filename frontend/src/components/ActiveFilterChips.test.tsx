import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveFilterChips } from './ActiveFilterChips'
import { describeFilterChips } from '../lib/filterChips'
import type { ComponentFilter } from '../lib/types'

describe('describeFilterChips — derive chips from filter + preset', () => {
  it('returns no chips for the bare active-only default with no preset', () => {
    expect(describeFilterChips({ archived: false }, null)).toEqual([])
  })

  it('emits one chip per value in a multi-value array filter', () => {
    const chips = describeFilterChips({ archived: false, owner: ['alice', 'bob'] }, null)
    const owner = chips.filter((c) => c.key === 'owner')
    expect(owner.map((c) => c.value)).toEqual(['alice', 'bob'])
    expect(owner[0]!.label).toMatch(/owner: alice/i)
  })

  it('emits a search chip carrying the term', () => {
    const chips = describeFilterChips({ archived: false, search: 'foo' }, null)
    expect(chips).toHaveLength(1)
    expect(chips[0]!.key).toBe('search')
    expect(chips[0]!.label).toMatch(/foo/)
  })

  it('emits a chip for each set tri-state filter (Yes/No)', () => {
    const chips = describeFilterChips(
      { archived: false, canBeParent: true, solution: false },
      null,
    )
    const cbp = chips.find((c) => c.key === 'canBeParent')
    const sol = chips.find((c) => c.key === 'solution')
    expect(cbp!.label).toMatch(/can be parent: yes/i)
    expect(sol!.label).toMatch(/solution: no/i)
  })

  it('emits an archived chip only when archived=true (active-only default is not a chip)', () => {
    expect(describeFilterChips({ archived: true }, null).map((c) => c.key)).toContain('archived')
    expect(describeFilterChips({ archived: false }, null).map((c) => c.key)).not.toContain(
      'archived',
    )
  })

  it('emits a preset chip when a preset is active', () => {
    const chips = describeFilterChips({ archived: false, owner: ['alice'] }, 'mine')
    const presetChip = chips.find((c) => c.key === 'preset')
    expect(presetChip).toBeDefined()
    expect(presetChip!.label).toMatch(/My Components/i)
  })

  it('does NOT emit a preset chip for the default "all" preset', () => {
    // "All" is the default state, not an active filter.
    expect(describeFilterChips({ archived: false }, 'all')).toEqual([])
  })

  it('emits chips for scalar string extended filters (vcsPath / productionBranch)', () => {
    const chips = describeFilterChips(
      { archived: false, vcsPath: 'p/r', productionBranch: 'main' },
      null,
    )
    expect(chips.find((c) => c.key === 'vcsPath')!.label).toMatch(/p\/r/)
    expect(chips.find((c) => c.key === 'productionBranch')!.label).toMatch(/main/)
  })
})

describe('ActiveFilterChips component', () => {
  const onRemove = vi.fn()
  const onClearAll = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderChips(filter: ComponentFilter, preset: Parameters<typeof describeFilterChips>[1] = null) {
    return render(
      <ActiveFilterChips
        filter={filter}
        preset={preset}
        onRemove={onRemove}
        onClearAll={onClearAll}
      />,
    )
  }

  it('renders nothing when there are no active filters', () => {
    const { container } = renderChips({ archived: false }, null)
    expect(container.firstChild).toBeNull()
  })

  it('renders one removable chip per active filter value', () => {
    renderChips({ archived: false, owner: ['alice', 'bob'], search: 'foo' }, null)
    expect(screen.getByText(/owner: alice/i)).toBeDefined()
    expect(screen.getByText(/owner: bob/i)).toBeDefined()
    expect(screen.getByText(/foo/)).toBeDefined()
  })

  it('clicking a chip × calls onRemove with that filter key + value', async () => {
    renderChips({ archived: false, owner: ['alice', 'bob'] }, null)
    await userEvent.click(screen.getByRole('button', { name: /remove owner: alice/i }))
    expect(onRemove).toHaveBeenCalledWith('owner', 'alice')
  })

  it('clicking the × on a scalar (search) chip omits the value (whole field removed)', async () => {
    renderChips({ archived: false, search: 'foo' }, null)
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalledWith('search', undefined)
  })

  it('renders a "Clear all" control that calls onClearAll', async () => {
    renderChips({ archived: false, owner: ['alice'] }, null)
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(onClearAll).toHaveBeenCalled()
  })

  it('removing the preset chip calls onRemove with the preset key', async () => {
    renderChips({ archived: false, owner: ['alice'] }, 'mine')
    await userEvent.click(screen.getByRole('button', { name: /remove preset/i }))
    expect(onRemove).toHaveBeenCalledWith('preset', undefined)
  })
})
