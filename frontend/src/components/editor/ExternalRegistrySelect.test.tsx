import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExternalRegistrySelect, NOT_IN_LIST_SUFFIX } from './ExternalRegistrySelect'

vi.mock('../../hooks/useFieldOptions', () => ({
  useFieldOptions: vi.fn(),
}))
import { useFieldOptions } from '../../hooks/useFieldOptions'
const mockUseFieldOptions = vi.mocked(useFieldOptions)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExternalRegistrySelect — dropdown from field-config options', () => {
  it('renders a dropdown showing the current value when it is one of the options', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a', 'reg-b'], isLoading: false })
    render(<ExternalRegistrySelect value="reg-a" onValueChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('reg-a')
  })

  it('reads its options from the DISPLAY path vcs.externalRegistry', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    render(<ExternalRegistrySelect value="reg-a" onValueChange={() => {}} />)
    expect(mockUseFieldOptions).toHaveBeenCalledWith('vcs.externalRegistry')
  })

  it('shows "None" when the value is empty (clearable)', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    render(<ExternalRegistrySelect value="" onValueChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('None')
  })
})

describe('ExternalRegistrySelect — unknown stored value', () => {
  it('keeps a stored value absent from the list, selected, tagged not-in-list', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a', 'reg-b'], isLoading: false })
    render(<ExternalRegistrySelect value="legacy-reg" onValueChange={() => {}} />)
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveTextContent('legacy-reg')
    expect(trigger).toHaveTextContent(NOT_IN_LIST_SUFFIX)
  })
})

describe('ExternalRegistrySelect — empty options (read-only)', () => {
  it('renders the stored value read-only when no options are configured', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })
    render(<ExternalRegistrySelect value="reg-x" onValueChange={() => {}} />)
    // No dropdown at all — read-only input carrying the stored value.
    expect(screen.queryByRole('combobox')).toBeNull()
    const input = screen.getByDisplayValue('reg-x') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('renders a hint when no options are configured and there is no stored value', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: false })
    render(<ExternalRegistrySelect value="" onValueChange={() => {}} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(/no registries configured/i)).toBeDefined()
  })
})

describe('ExternalRegistrySelect — states', () => {
  it('shows a disabled loading placeholder while options load', () => {
    mockUseFieldOptions.mockReturnValue({ options: [], isLoading: true })
    render(<ExternalRegistrySelect value="reg-a" onValueChange={() => {}} />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('disables the dropdown when disabled is set', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    render(<ExternalRegistrySelect value="reg-a" onValueChange={() => {}} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('forwards id to the trigger so an outer Label htmlFor resolves', () => {
    mockUseFieldOptions.mockReturnValue({ options: ['reg-a'], isLoading: false })
    render(<ExternalRegistrySelect id="vcs-externalRegistry" value="reg-a" onValueChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'vcs-externalRegistry')
  })
})
