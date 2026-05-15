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
