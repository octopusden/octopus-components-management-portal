import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AsCodeTab } from './AsCodeTab'
import type { ComponentDetail } from '../../lib/types'
import { useComponentAsCode } from '../../hooks/useComponentAsCode'
import { copyToClipboard } from '../../lib/clipboard'
import { ApiError } from '../../lib/api'

const toast = vi.fn()
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('../../hooks/useComponentAsCode', () => ({ useComponentAsCode: vi.fn() }))
vi.mock('../../lib/clipboard', () => ({ copyToClipboard: vi.fn() }))
// Identity debounce so the version box value propagates synchronously in tests.
vi.mock('../../hooks/useDebouncedValue', () => ({ useDebouncedValue: (v: string) => v }))

const mockHook = vi.mocked(useComponentAsCode)
const mockCopy = vi.mocked(copyToClipboard)
const component = { id: 'c1', name: 'bcomponent' } as ComponentDetail

beforeEach(() => {
  vi.clearAllMocks()
  mockHook.mockReturnValue({
    data: 'bcomponent {\n}\n',
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useComponentAsCode>)
})

describe('AsCodeTab', () => {
  it('renders the code in full mode with no version input', () => {
    render(<AsCodeTab component={component} />)
    expect(screen.getByText('bcomponent')).toBeTruthy() // header token
    expect(screen.queryByLabelText('Version')).toBeNull()
  })

  it('exposes both Full and Resolved toggles', () => {
    render(<AsCodeTab component={component} />)
    expect(screen.getByRole('tab', { name: /full/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /resolved/i })).toBeTruthy()
  })

  it('copies the current code and toasts on success', async () => {
    mockCopy.mockResolvedValue(undefined)
    render(<AsCodeTab component={component} />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    await waitFor(() => expect(mockCopy).toHaveBeenCalledWith('bcomponent {\n}\n'))
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Copied to clipboard' }))
  })
})

function rangedComponent(): ComponentDetail {
  return {
    id: 'c1',
    name: 'widget',
    configurations: [
      { versionRange: '(,0),[0,)', rowType: 'BASE' },
      { versionRange: '[1.5.0,1.5.1400)', rowType: 'SCALAR_OVERRIDE' },
      { versionRange: '[1.5.1400,)', rowType: 'SCALAR_OVERRIDE' },
    ],
    artifactIds: [{ versionRange: null }],
  } as unknown as ComponentDetail
}

describe('AsCodeTab — default version', () => {
  it('prefills the resolve box with the highest configured version', async () => {
    const user = userEvent.setup()
    render(<AsCodeTab component={rangedComponent()} />)
    // Even before switching tabs, the hook receives the seeded default version.
    expect(mockHook).toHaveBeenCalledWith('c1', expect.objectContaining({ version: '1.5.1400' }))

    await user.click(screen.getByRole('tab', { name: /resolved/i }))
    expect((screen.getByLabelText('Version') as HTMLInputElement).value).toBe('1.5.1400')
  })
})

describe('AsCodeTab — out-of-range resolve', () => {
  it('shows a friendly hint with the suggested version instead of a bare error', async () => {
    const user = userEvent.setup()
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, 'No configuration resolves'),
    } as ReturnType<typeof useComponentAsCode>)
    render(<AsCodeTab component={rangedComponent()} />)
    await user.click(screen.getByRole('tab', { name: /resolved/i }))
    const input = screen.getByLabelText('Version')
    await user.clear(input)
    await user.type(input, '0.5')

    expect(screen.getByText(/outside every configured range/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Resolve 1\.5\.1400/ }))
    expect((input as HTMLInputElement).value).toBe('1.5.1400')
  })
})
