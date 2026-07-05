import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArtifactOwnershipEditor } from './ArtifactOwnershipEditor'
import type { OwnershipMappingValue } from '../../lib/artifactOwnership'

function Harness({
  initial,
  configRanges = ['[1.0,2.0)'],
  supportedGroups,
}: {
  initial: OwnershipMappingValue[]
  configRanges?: string[]
  supportedGroups?: readonly string[]
}) {
  const [value, setValue] = useState(initial)
  return (
    <ArtifactOwnershipEditor
      value={value}
      onChange={setValue}
      configRanges={configRanges}
      supportedGroups={supportedGroups}
    />
  )
}

const base = (over: Partial<OwnershipMappingValue> = {}): OwnershipMappingValue => ({
  id: over.id ?? 'm1',
  base: true,
  range: null,
  groups: over.groups ?? 'com.example.foo',
  mode: over.mode ?? 'ALL',
  tokens: over.tokens ?? [],
})

describe('ArtifactOwnershipEditor', () => {
  it('flags a group that lacks a supported prefix', () => {
    render(<Harness initial={[base({ groups: 'org.bad' })]} supportedGroups={['com.acme']} />)
    expect(screen.getByText(/must start with a supported prefix/i)).toBeInTheDocument()
  })

  it('shows no prefix error when the group is under a supported prefix', () => {
    render(<Harness initial={[base({ groups: 'com.acme.svc' })]} supportedGroups={['com.acme']} />)
    expect(screen.queryByText(/must start with a supported prefix/i)).not.toBeInTheDocument()
  })

  it('renders a base mapping with its group and mode selected', () => {
    render(<Harness initial={[base()]} />)
    expect(screen.getByDisplayValue('com.example.foo')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /All under the group ID/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('switching to "Specific artifacts" reveals the token chip input', async () => {
    render(<Harness initial={[base()]} />)
    expect(screen.queryByLabelText('Specific artifacts')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Specific artifacts/ }))
    expect(screen.getByLabelText('Specific artifacts')).toBeInTheDocument()
    // EXPLICIT with no tokens surfaces the "add at least one" error.
    expect(screen.getByText(/Add at least one artifact/)).toBeInTheDocument()
  })

  it('adds a literal token on Enter and rejects regex metacharacters', async () => {
    render(<Harness initial={[base({ mode: 'EXPLICIT' })]} />)
    const input = screen.getByLabelText('Specific artifacts')
    await userEvent.type(input, 'foo-svc{Enter}')
    expect(screen.getByText('foo-svc')).toBeInTheDocument()
    // A metachar token is not committed (left as a flagged draft).
    await userEvent.type(input, 'bad*')
    expect(screen.getByText(/contains a forbidden character/)).toBeInTheDocument()
  })

  it('shows the conflict banner for two ALL mappings on the same group', () => {
    render(<Harness initial={[base({ id: 'a' }), base({ id: 'b' })]} />)
    expect(screen.getByText('Ownership conflict')).toBeInTheDocument()
  })

  it('"Add one more groupId" appends an empty base mapping (one Group ID per row)', async () => {
    render(<Harness initial={[base()]} />)
    await userEvent.click(screen.getByRole('button', { name: /Add one more groupId/ }))
    // Two Group ID rows now — each row is a single Group ID.
    expect(screen.getAllByLabelText('Group ID')).toHaveLength(2)
  })

  it('auto-splits a comma group-list into one row per groupId on blur (one groupId per row)', async () => {
    render(<Harness initial={[base({ groups: 'com.example.a' })]} />)
    const input = screen.getByLabelText('Group ID')
    // Type a comma-separated list, then blur — the row must fan out to one row per groupId.
    await userEvent.clear(input)
    await userEvent.type(input, 'com.example.a,com.example.b')
    fireEvent.blur(input)
    const groupInputs = screen.getAllByLabelText('Group ID') as HTMLInputElement[]
    expect(groupInputs).toHaveLength(2)
    expect(groupInputs.map((i) => i.value)).toEqual(['com.example.a', 'com.example.b'])
  })

  it('auto-splits a pasted comma list into one row per groupId', async () => {
    render(<Harness initial={[base({ groups: '' })]} />)
    const input = screen.getByLabelText('Group ID')
    input.focus()
    fireEvent.paste(input, { clipboardData: { getData: () => 'com.example.a, com.example.b, com.example.c' } })
    const groupInputs = screen.getAllByLabelText('Group ID') as HTMLInputElement[]
    expect(groupInputs).toHaveLength(3)
    expect(groupInputs.map((i) => i.value)).toEqual(['com.example.a', 'com.example.b', 'com.example.c'])
  })

  it('does NOT split a grandfathered comma row on a no-op focus/blur (no spurious change)', () => {
    const onChange = vi.fn()
    render(
      <ArtifactOwnershipEditor
        value={[base({ groups: 'com.example.a,com.example.b' })]}
        onChange={onChange}
        configRanges={[]}
      />,
    )
    const input = screen.getByLabelText('Group ID') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('com.example.a,com.example.b')
  })

  it('drops the pre-split server legacy pattern so a split ALL_EXCEPT row recomputes its preview', () => {
    const stale = '(?!(?:stale-sibling)$)[\\w-\\.]+'
    render(
      <Harness
        initial={[
          {
            id: 'm1',
            base: true,
            range: null,
            groups: '',
            mode: 'ALL_EXCEPT_CLAIMED',
            tokens: [],
            legacyArtifactIdPattern: stale,
          },
        ]}
      />,
    )
    const input = screen.getByLabelText('Group ID')
    input.focus()
    fireEvent.paste(input, { clipboardData: { getData: () => 'com.example.a,com.example.b' } })
    expect(screen.getAllByLabelText('Group ID')).toHaveLength(2)
    // The stale server pattern (computed for the pre-split group set) must not survive on the split rows.
    fireEvent.click(screen.getAllByText('Legacy preview')[0]!)
    expect(screen.queryByText(stale)).not.toBeInTheDocument()
  })

  it('clears the stale server legacy pattern when the Group ID is edited without splitting', async () => {
    const stale = '(?!(?:stale-sibling)$)[\\w-\\.]+'
    render(
      <Harness
        initial={[
          {
            id: 'm1',
            base: true,
            range: null,
            groups: 'com.example.a',
            mode: 'ALL_EXCEPT_CLAIMED',
            tokens: [],
            legacyArtifactIdPattern: stale,
          },
        ]}
      />,
    )
    await userEvent.type(screen.getByLabelText('Group ID'), 'x')
    fireEvent.click(screen.getByText('Legacy preview'))
    expect(screen.queryByText(stale)).not.toBeInTheDocument()
  })

  it('legacy preview renders the catch-all for an ALL mapping', () => {
    render(<Harness initial={[base()]} />)
    fireEvent.click(screen.getByText('Legacy preview'))
    expect(screen.getByText('[\\w-\\.]+')).toBeInTheDocument()
  })

  it('disabled hides add/remove controls', () => {
    const onChange = vi.fn()
    render(<ArtifactOwnershipEditor value={[base()]} onChange={onChange} configRanges={[]} disabled />)
    expect(screen.queryByRole('button', { name: /Add one more groupId/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove mapping/ })).not.toBeInTheDocument()
  })
})
