import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from './tooltip'
import { FieldInfo } from './FieldInfo'

// Mock the registry so the test is independent of real description content
vi.mock('../../lib/fieldDescriptions', () => ({
  fieldDescriptions: {
    'component.name': 'Unique technical key of the component.',
  },
}))

function renderFieldInfo(path: string, label: string) {
  return render(
    <TooltipProvider>
      <FieldInfo path={path} label={label} />
    </TooltipProvider>,
  )
}

describe('FieldInfo', () => {
  it('renders an info trigger when the registry has an entry for the path', () => {
    renderFieldInfo('component.name', 'Component Key')

    const trigger = screen.getByRole('button', { name: 'Description for Component Key' })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveAttribute('data-field-path', 'component.name')
    // The icon itself is decorative — accessible name comes from the button
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders nothing when the path has no registry entry', () => {
    const { container } = renderFieldInfo('component.unknown', 'Unknown Field')

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the description in a tooltip on keyboard focus', async () => {
    const user = userEvent.setup()
    renderFieldInfo('component.name', 'Component Key')

    await user.tab()

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Unique technical key of the component.')
  })

  it('is a non-submitting button (type="button")', () => {
    renderFieldInfo('component.name', 'Component Key')

    expect(screen.getByRole('button', { name: 'Description for Component Key' }))
      .toHaveAttribute('type', 'button')
  })
})
