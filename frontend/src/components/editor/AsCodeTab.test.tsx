import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AsCodeTab } from './AsCodeTab'
import type { ComponentDetail } from '../../lib/types'
import { useComponentAsCode } from '../../hooks/useComponentAsCode'
import { copyToClipboard } from '../../lib/clipboard'

const toast = vi.fn()
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('../../hooks/useComponentAsCode', () => ({ useComponentAsCode: vi.fn() }))
vi.mock('../../lib/clipboard', () => ({ copyToClipboard: vi.fn() }))

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
