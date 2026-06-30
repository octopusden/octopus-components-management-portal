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
    render(<Harness initial={[base({ groups: 'org.bad' })]} supportedGroups={['com.openwaygroup']} />)
    expect(screen.getByText(/must start with a supported prefix/i)).toBeInTheDocument()
  })

  it('shows no prefix error when the group is under a supported prefix', () => {
    render(<Harness initial={[base({ groups: 'com.openwaygroup.svc' })]} supportedGroups={['com.openwaygroup']} />)
    expect(screen.queryByText(/must start with a supported prefix/i)).not.toBeInTheDocument()
  })

  it('renders a base mapping with its group and mode selected', () => {
    render(<Harness initial={[base()]} />)
    expect(screen.getByDisplayValue('com.example.foo')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /All artifacts in these groups/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('switching to "Specific artifacts" reveals the token chip input', async () => {
    render(<Harness initial={[base()]} />)
    expect(screen.queryByLabelText('Artifact IDs')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Specific artifacts/ }))
    expect(screen.getByLabelText('Artifact IDs')).toBeInTheDocument()
    // EXPLICIT with no tokens surfaces the "add at least one" error.
    expect(screen.getByText(/Add at least one artifact/)).toBeInTheDocument()
  })

  it('adds a literal token on Enter and rejects regex metacharacters', async () => {
    render(<Harness initial={[base({ mode: 'EXPLICIT' })]} />)
    const input = screen.getByLabelText('Artifact IDs')
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

  it('"Add artifact coordinates" appends an empty base mapping', async () => {
    render(<Harness initial={[base()]} />)
    await userEvent.click(screen.getByRole('button', { name: /Add artifact coordinates/ }))
    // Two "Artifact coordinates" blocks now.
    expect(screen.getAllByText('Artifact coordinates')).toHaveLength(2)
  })

  it('legacy preview renders the catch-all for an ALL mapping', () => {
    render(<Harness initial={[base()]} />)
    fireEvent.click(screen.getByText('Legacy preview'))
    expect(screen.getByText('[\\w-\\.]+')).toBeInTheDocument()
  })

  it('disabled hides add/remove controls', () => {
    const onChange = vi.fn()
    render(<ArtifactOwnershipEditor value={[base()]} onChange={onChange} configRanges={[]} disabled />)
    expect(screen.queryByRole('button', { name: /Add artifact coordinates/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove mapping/ })).not.toBeInTheDocument()
  })
})
