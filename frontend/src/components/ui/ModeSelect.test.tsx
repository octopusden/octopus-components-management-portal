import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ModeSelect } from './ModeSelect'
import type { ArtifactIdMode } from '@/lib/types'

// Controlled harness: the select is value-driven, so re-render on selection is
// what updates the shown help text.
function Harness({ initial = 'ALL' as ArtifactIdMode, allowed }: { initial?: ArtifactIdMode; allowed?: ArtifactIdMode[] }) {
  const [value, setValue] = useState<ArtifactIdMode>(initial)
  return <ModeSelect value={value} allowed={allowed} onChange={setValue} id="mode-test" />
}

describe('ModeSelect', () => {
  it('renders a labelled select offering every ownership mode', () => {
    render(<Harness />)
    const select = screen.getByLabelText('artifactId matching mode') as HTMLSelectElement
    expect(select.value).toBe('ALL')
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual([
      'All under the group ID',
      'All except artifacts assigned elsewhere',
      'Specific artifacts only',
    ])
  })

  it('shows the helper text for the selected mode and updates on change', async () => {
    render(<Harness />)
    expect(screen.getByText(/Owns every artifact under this group ID/i)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('artifactId matching mode'), 'EXPLICIT')
    expect(screen.getByText(/Owns exactly the listed artifact IDs/i)).toBeInTheDocument()
  })

  it('restricts the offered modes when `allowed` is given', () => {
    render(<Harness allowed={['ALL', 'ALL_EXCEPT_CLAIMED']} />)
    const select = screen.getByLabelText('artifactId matching mode') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['ALL', 'ALL_EXCEPT_CLAIMED'])
  })
})
