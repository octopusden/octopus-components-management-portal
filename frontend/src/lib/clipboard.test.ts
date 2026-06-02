import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyToClipboard } from './clipboard'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('copyToClipboard', () => {
  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await copyToClipboard('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when clipboard API is absent', async () => {
    vi.stubGlobal('navigator', {})
    const exec = vi.fn().mockReturnValue(true)
    // jsdom does not implement execCommand
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec
    await copyToClipboard('fallback')
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('rejects when the fallback copy command fails', async () => {
    vi.stubGlobal('navigator', {})
    ;(document as unknown as { execCommand: () => boolean }).execCommand = () => false
    await expect(copyToClipboard('nope')).rejects.toThrow()
  })

  it('propagates a rejection from the async clipboard API', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyToClipboard('x')).rejects.toThrow('denied')
  })
})
