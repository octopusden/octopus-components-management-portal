import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from './tooltip'
import { FieldInfo } from './FieldInfo'
import { useFieldConfig } from '../../hooks/useAdminConfig'

// Mock the registry so the test is independent of real description content
vi.mock('../../lib/fieldDescriptions', () => ({
  fieldDescriptions: {
    'component.name': 'Unique technical key of the component.',
    'component.blank': '   ',
  },
}))

// Mock the field-config query (FieldInfo consults it for description
// overrides) so no QueryClientProvider / network is involved.
vi.mock('../../hooks/useAdminConfig', () => ({
  useFieldConfig: vi.fn(),
}))
const mockUseFieldConfig = vi.mocked(useFieldConfig)

function setFieldConfig(data: unknown) {
  mockUseFieldConfig.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useFieldConfig>)
}

beforeEach(() => setFieldConfig(undefined))

function renderFieldInfo(path: string, label: string) {
  // delayDuration={0}: hover-intent delay is timer-gated in Radix; zero it so
  // the hover test is deterministic in jsdom (focus opens with no delay anyway).
  return render(
    <TooltipProvider delayDuration={0}>
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

  it('renders nothing when the registry entry is whitespace-only', () => {
    const { container } = renderFieldInfo('component.blank', 'Blank Field')

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the description in a tooltip on keyboard focus', async () => {
    const user = userEvent.setup()
    renderFieldInfo('component.name', 'Component Key')

    await user.tab()

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Unique technical key of the component.')
  })

  it('shows the description in a tooltip on mouse hover', async () => {
    const user = userEvent.setup()
    renderFieldInfo('component.name', 'Component Key')

    await user.hover(screen.getByRole('button', { name: 'Description for Component Key' }))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Unique technical key of the component.')
  })

  it('is a non-submitting button (type="button")', () => {
    renderFieldInfo('component.name', 'Component Key')

    expect(screen.getByRole('button', { name: 'Description for Component Key' }))
      .toHaveAttribute('type', 'button')
  })
})

describe('FieldInfo — field-config description overrides', () => {
  it('prefers the field-config description over the registry entry', async () => {
    setFieldConfig({ component: { name: { description: 'Config-provided description.' } } })
    const user = userEvent.setup()
    renderFieldInfo('component.name', 'Component Key')

    await user.tab()

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Config-provided description.')
  })

  it('renders for a path that only the field-config describes', async () => {
    setFieldConfig({ build: { projectVersion: { description: 'Config-only description.' } } })
    const user = userEvent.setup()
    renderFieldInfo('build.projectVersion', 'Project Version')

    await user.tab()

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Config-only description.')
  })

  it('falls back to the registry when the config description is blank', async () => {
    setFieldConfig({ component: { name: { description: '   ' } } })
    const user = userEvent.setup()
    renderFieldInfo('component.name', 'Component Key')

    await user.tab()

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Unique technical key of the component.')
  })

  it('uses the config label override in the accessible name', () => {
    setFieldConfig({ component: { name: { label: 'Example Label' } } })
    renderFieldInfo('component.name', 'Component Key')

    expect(
      screen.getByRole('button', { name: 'Description for Example Label' }),
    ).toBeInTheDocument()
  })
})
