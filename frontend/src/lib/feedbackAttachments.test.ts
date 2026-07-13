import { describe, it, expect } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  isAcceptedImage,
  readFileAsAttachment,
  toPayload,
} from './feedbackAttachments'

describe('isAcceptedImage', () => {
  it('accepts png and jpeg only', () => {
    expect(isAcceptedImage('image/png')).toBe(true)
    expect(isAcceptedImage('image/jpeg')).toBe(true)
    expect(isAcceptedImage('image/gif')).toBe(false)
    expect(isAcceptedImage('text/plain')).toBe(false)
  })
})

describe('readFileAsAttachment', () => {
  it('reads a small png into base64 without the data-url prefix', async () => {
    const file = new File([Uint8Array.of(1, 2, 3)], 'shot.png', { type: 'image/png' })
    const att = await readFileAsAttachment(file)
    expect(att.contentType).toBe('image/png')
    expect(att.filename).toBe('shot.png')
    expect(att.dataBase64).toBe('AQID') // base64 of bytes 1,2,3
    expect(att.previewUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(toPayload(att)).toEqual({ filename: 'shot.png', contentType: 'image/png', dataBase64: 'AQID' })
  })

  it('rejects a non-image file', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    await expect(readFileAsAttachment(file)).rejects.toThrow(/PNG or JPEG/)
  })

  it('rejects an oversized image', async () => {
    const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.png', { type: 'image/png' })
    await expect(readFileAsAttachment(big)).rejects.toThrow(/larger than 2 MB/)
  })
})
