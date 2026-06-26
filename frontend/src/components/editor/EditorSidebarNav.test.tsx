import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Tabs, TabsContent } from '../ui/tabs'
import { EditorSidebarNav, type EditorNavSection } from './EditorSidebarNav'

// The sidebar is a presentational nav over Radix Tabs: it renders the grouped
// TabsList (left) while the page owns <Tabs value/onValueChange> + the panels.
// These tests drive it through a minimal <Tabs> harness so the controlled
// value + roving-focus + selection semantics are the real Radix ones.

const SECTIONS: EditorNavSection[] = [
  { label: 'Overview', items: [{ value: 'general', label: 'General' }] },
  {
    label: 'Build & Release',
    items: [
      { value: 'build', label: 'Build', count: 1 },
      { value: 'vcs', label: 'VCS', count: 2 },
      { value: 'jira', label: 'Jira' },
      { value: 'escrow', label: 'Escrow' },
    ],
  },
  { label: 'Distribution', items: [{ value: 'distribution', label: 'Distribution', count: 3 }] },
  {
    label: 'Metadata',
    items: [
      { value: 'misc', label: 'Misc' },
      { value: 'configurations', label: 'Configurations' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { value: 'as-code', label: 'As Code' },
      { value: 'overrides', label: 'Overrides' },
      { value: 'history', label: 'History' },
    ],
  },
]

function Harness({
  value,
  onValueChange,
  problems,
}: {
  value: string
  onValueChange?: (v: string) => void
  problems?: { count: number } | null
}) {
  const [v, setV] = React.useState(value)
  return (
    <Tabs
      value={v}
      onValueChange={(next) => {
        setV(next)
        onValueChange?.(next)
      }}
      variant="underline"
    >
      <EditorSidebarNav
        sections={SECTIONS}
        activeValue={v}
        problems={
          problems
            ? { value: 'validation-problems', label: 'Validation Problems', count: problems.count }
            : null
        }
      />
      <TabsContent value="general">general-body</TabsContent>
      <TabsContent value="vcs">vcs-body</TabsContent>
      <TabsContent value="validation-problems">problems-body</TabsContent>
    </Tabs>
  )
}

describe('EditorSidebarNav', () => {
  it('renders every group heading and item, with counts where supplied', () => {
    render(<Harness value="general" />)

    // Group headings are rendered as non-tab text. ("Distribution" is also an
    // item label, hence getAllByText for that one.)
    for (const heading of ['Overview', 'Build & Release', 'Metadata', 'Tools']) {
      expect(screen.getByText(heading)).toBeDefined()
    }
    expect(screen.getAllByText('Distribution').length).toBeGreaterThanOrEqual(2)
    // All 11 base items are present as tabs.
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    expect(tabs.map((t) => (t.textContent ?? '').replace(/\d+$/, ''))).toEqual([
      'General',
      'Build',
      'VCS',
      'Jira',
      'Escrow',
      'Distribution',
      'Misc',
      'Configurations',
      'As Code',
      'Overrides',
      'History',
    ])
    // Counts moved into the sidebar items.
    expect(within(screen.getByRole('tab', { name: /^Build/ })).getByText('1')).toBeDefined()
    expect(within(screen.getByRole('tab', { name: /^VCS/ })).getByText('2')).toBeDefined()
    expect(within(screen.getByRole('tab', { name: /^Distribution/ })).getByText('3')).toBeDefined()
  })

  it('marks the active item selected and exposes aria-current', () => {
    render(<Harness value="general" />)
    const general = screen.getByRole('tab', { name: 'General' })
    expect(general).toHaveAttribute('aria-selected', 'true')
    expect(general).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('tab', { name: /^VCS/ })).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking an item selects it and shows the matching body', async () => {
    const onValueChange = vi.fn()
    render(<Harness value="general" onValueChange={onValueChange} />)
    expect(screen.getByText('general-body')).toBeDefined()

    await userEvent.setup().click(screen.getByRole('tab', { name: /^VCS/ }))
    expect(onValueChange).toHaveBeenCalledWith('vcs')
    expect(screen.getByText('vcs-body')).toBeDefined()
  })

  it('omits the Validation Problems item when problems is null', () => {
    render(<Harness value="general" problems={null} />)
    expect(screen.queryByRole('tab', { name: /validation problems/i })).toBeNull()
  })

  it('pins a destructive Validation Problems item at the TOP with its count when present', async () => {
    render(<Harness value="general" problems={{ count: 7 }} />)
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    // Pinned first, before the General item.
    expect((tabs[0]!.textContent ?? '')).toMatch(/validation problems/i)
    const vp = screen.getByRole('tab', { name: /validation problems/i })
    expect(vp.className).toContain('text-destructive')
    expect(within(vp).getByText('7')).toBeDefined()

    await userEvent.setup().click(vp)
    expect(screen.getByText('problems-body')).toBeDefined()
  })
})
