import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClassificationSection } from './ClassificationSection'
import { TooltipProvider } from '../ui/tooltip'

// FieldLabelText resolves labels through field-config; the fallback text is
// enough for this presentational component's contract.
vi.mock('../../hooks/useFieldConfig', () => ({
  useFieldConfigEntry: () => ({ entry: { visibility: 'editable', required: false }, isLoading: false, isError: false }),
  useFieldLabel: (_path: string, fallback: string) => fallback,
}))

function renderSection(props: Partial<React.ComponentProps<typeof ClassificationSection>> = {}) {
  const onExplicitChange = vi.fn()
  const onExternalChange = vi.fn()
  render(
    <TooltipProvider>
      <ClassificationSection
        explicit={false}
        external={false}
        onExplicitChange={onExplicitChange}
        onExternalChange={onExternalChange}
        {...props}
      />
    </TooltipProvider>,
  )
  return { onExplicitChange, onExternalChange }
}

describe('ClassificationSection', () => {
  it('renders both toggles reflecting the passed state', () => {
    renderSection({ explicit: true, external: false })
    expect(screen.getByRole('switch', { name: /explicit/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: /external/i })).toHaveAttribute('aria-checked', 'false')
  })

  it('invokes the matching setter when a toggle is clicked', async () => {
    const { onExplicitChange, onExternalChange } = renderSection()
    await userEvent.click(screen.getByRole('switch', { name: /external/i }))
    expect(onExternalChange).toHaveBeenCalledWith(true)
    expect(onExplicitChange).not.toHaveBeenCalled()
  })

  it('exposes the moved FieldInfo paths', () => {
    renderSection()
    expect(document.querySelectorAll('[data-field-path="component.distributionExplicit"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-field-path="component.distributionExternal"]')).toHaveLength(1)
  })
})
