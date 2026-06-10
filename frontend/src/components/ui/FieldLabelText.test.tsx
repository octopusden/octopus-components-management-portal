import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FieldLabelText } from './FieldLabelText'
import { useFieldConfig } from '../../hooks/useAdminConfig'

// Mock the field-config query so no QueryClientProvider / network is involved;
// the real labelFor/resolveFieldEntry logic still runs on the mocked data.
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

describe('FieldLabelText', () => {
  it('renders the field-config label override when set', () => {
    setFieldConfig({ build: { projectVersion: { label: 'Example Label' } } })
    render(<FieldLabelText path="build.projectVersion" fallback="Project Version" />)

    expect(screen.getByText('Example Label')).toBeInTheDocument()
    expect(screen.queryByText('Project Version')).toBeNull()
  })

  it('renders the fallback when the field has no config label', () => {
    setFieldConfig({ build: { projectVersion: { visibility: 'editable' } } })
    render(<FieldLabelText path="build.projectVersion" fallback="Project Version" />)

    expect(screen.getByText('Project Version')).toBeInTheDocument()
  })

  it('renders the fallback when no field-config is loaded', () => {
    render(<FieldLabelText path="build.projectVersion" fallback="Project Version" />)

    expect(screen.getByText('Project Version')).toBeInTheDocument()
  })
})
