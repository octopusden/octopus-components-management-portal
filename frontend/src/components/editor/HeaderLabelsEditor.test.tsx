import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeaderLabelsEditor } from './HeaderLabelsEditor'
import { TooltipProvider } from '../ui/tooltip'

vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable' }, isLoading: false, isError: false }),
}))

const OPTIONS = ['backend', 'internal', 'frontend']
const wrapper = TooltipProvider

describe('HeaderLabelsEditor', () => {
  it('renders nothing when visibility is hidden', () => {
    const { container } = render(
      <HeaderLabelsEditor value={['backend']} onChange={() => {}} options={OPTIONS} visibility="hidden" />,
      { wrapper },
    )
    expect(container.querySelector('[data-testid="header-labels"]')).toBeNull()
  })

  it('readonly → shows badges but no editor trigger', () => {
    render(
      <HeaderLabelsEditor value={['backend', 'internal']} onChange={() => {}} options={OPTIONS} visibility="readonly" />,
      { wrapper },
    )
    expect(screen.getByText('backend')).toBeDefined()
    expect(screen.getByText('internal')).toBeDefined()
    expect(screen.queryByRole('button', { name: /edit labels/i })).toBeNull()
  })

  it('a read-only viewer (canEdit=false) gets no editor even when visibility is editable', () => {
    render(
      <HeaderLabelsEditor value={['backend']} onChange={() => {}} options={OPTIONS} visibility="editable" canEdit={false} />,
      { wrapper },
    )
    expect(screen.queryByRole('button', { name: /edit labels/i })).toBeNull()
  })

  it('editable → picking a label in the popover appends via onChange', async () => {
    const onChange = vi.fn()
    render(<HeaderLabelsEditor value={['backend']} onChange={onChange} options={OPTIONS} visibility="editable" />, { wrapper })

    await userEvent.click(screen.getByRole('button', { name: /edit labels/i }))
    await userEvent.selectOptions(screen.getByLabelText(/^add label$/i), 'frontend')

    expect(onChange).toHaveBeenCalledWith(['backend', 'frontend'])
  })

  it('editable → removing a chip in the popover emits the shorter array', async () => {
    const onChange = vi.fn()
    render(
      <HeaderLabelsEditor value={['backend', 'internal']} onChange={onChange} options={OPTIONS} visibility="editable" />,
      { wrapper },
    )

    await userEvent.click(screen.getByRole('button', { name: /edit labels/i }))
    await userEvent.click(screen.getByRole('button', { name: /^remove backend$/i }))

    expect(onChange).toHaveBeenCalledWith(['internal'])
  })
})
