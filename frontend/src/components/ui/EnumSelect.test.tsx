import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnumSelect } from './EnumSelect'

// Mock the hook so tests don't need a real API
vi.mock('../../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn(),
}))

import { useFieldOptions } from '../../hooks/useFieldOptions'
const mockUseFieldOptions = vi.mocked(useFieldOptions)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EnumSelect — value display', () => {
  it('shows the current value when no field config options are configured', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })

    render(
      <EnumSelect fieldPath="buildSystem" value="MAVEN" onValueChange={() => {}} />,
    )

    // The trigger button should display the current value
    expect(screen.getByRole('combobox')).toHaveTextContent('MAVEN')
  })

  it('shows the current value when it is not included in field config options', () => {
    mockUseFieldOptions.mockReturnValue({
      options: ['GRADLE', 'BS2_0'],
      isLoading: false,
    })

    render(
      <EnumSelect fieldPath="buildSystem" value="MAVEN" onValueChange={() => {}} />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('MAVEN')
  })

  it('shows the current value when it is included in field config options', () => {
    mockUseFieldOptions.mockReturnValue({
      options: ['MAVEN', 'GRADLE'],
      isLoading: false,
    })

    render(
      <EnumSelect fieldPath="buildSystem" value="MAVEN" onValueChange={() => {}} />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('MAVEN')
  })

  it('shows "None" when value is empty', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })

    render(
      <EnumSelect
        fieldPath="buildSystem"
        value=""
        onValueChange={() => {}}
        placeholder="Select build system"
      />,
    )

    // Empty value maps to '__none__' sentinel, which renders as "None"
    expect(screen.getByRole('combobox')).toHaveTextContent('None')
  })

  it('shows loading state while field config is loading', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: true })

    render(
      <EnumSelect fieldPath="buildSystem" value="MAVEN" onValueChange={() => {}} />,
    )

    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})

describe('EnumSelect — accessibility props forwarded to the trigger', () => {
  it('forwards `id` to the trigger so an outer <Label htmlFor> resolves', () => {
    mockUseFieldOptions.mockReturnValue({
      options: ['MAVEN', 'GRADLE'],
      isLoading: false,
    })

    render(
      <EnumSelect
        id="buildSystem"
        fieldPath="buildSystem"
        value="MAVEN"
        onValueChange={() => {}}
      />,
    )

    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'buildSystem')
  })

  it('forwards aria-required to the trigger', () => {
    mockUseFieldOptions.mockReturnValue({
      options: ['MAVEN', 'GRADLE'],
      isLoading: false,
    })

    render(
      <EnumSelect
        fieldPath="buildSystem"
        value="MAVEN"
        onValueChange={() => {}}
        aria-required
      />,
    )

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-required', 'true')
  })

  it('forwards aria-invalid to the trigger', () => {
    mockUseFieldOptions.mockReturnValue({
      options: ['MAVEN', 'GRADLE'],
      isLoading: false,
    })

    render(
      <EnumSelect
        fieldPath="buildSystem"
        value=""
        onValueChange={() => {}}
        aria-invalid
      />,
    )

    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('forwards aria-describedby to the trigger so inline errors associate', () => {
    mockUseFieldOptions.mockReturnValue({
      options: ['MAVEN', 'GRADLE'],
      isLoading: false,
    })

    render(
      <EnumSelect
        fieldPath="buildSystem"
        value="MAVEN"
        onValueChange={() => {}}
        aria-describedby="buildSystem-error"
      />,
    )

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-describedby',
      'buildSystem-error',
    )
  })

  it('forwards id while in the loading branch (Label htmlFor must work before options arrive)', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: true })

    render(
      <EnumSelect
        id="buildSystem"
        fieldPath="buildSystem"
        value="MAVEN"
        onValueChange={() => {}}
        aria-required
      />,
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveAttribute('id', 'buildSystem')
    expect(trigger).toHaveAttribute('aria-required', 'true')
  })

  it('forwards id when options are empty and we render the placeholder branch', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })

    render(
      <EnumSelect
        id="buildSystem"
        fieldPath="buildSystem"
        value=""
        onValueChange={() => {}}
        aria-invalid
      />,
    )

    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveAttribute('id', 'buildSystem')
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
  })

  it('forwards id to the free-text Input when options are empty and allowFreeText is true', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })

    render(
      <EnumSelect
        id="buildSystem"
        fieldPath="buildSystem"
        value=""
        onValueChange={() => {}}
        allowFreeText
        aria-required
      />,
    )

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('id', 'buildSystem')
    expect(input).toHaveAttribute('aria-required', 'true')
  })
})
