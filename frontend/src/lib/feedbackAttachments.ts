import type { FeedbackAttachmentPayload } from './types'

// Client-side mirror of the CRS caps (authoritatively re-enforced server-side by
// magic-byte + size + count checks). Kept in sync with FeedbackProperties defaults.
export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const

/** A screenshot picked/pasted in the form, with a preview URL for the thumbnail. */
export interface PendingAttachment {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  dataBase64: string
  previewUrl: string
}

export function isAcceptedImage(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)
}

/**
 * Read a File into a PendingAttachment (base64 without the `data:...;base64,` prefix),
 * or throw a user-facing Error if it is the wrong type / too large. The full data URL
 * is kept as the preview src.
 */
export function readFileAsAttachment(file: File): Promise<PendingAttachment> {
  if (!isAcceptedImage(file.type)) {
    return Promise.reject(new Error(`${file.name || 'file'} is not a PNG or JPEG image`))
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Promise.reject(new Error(`${file.name || 'file'} is larger than 2 MB`))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name || 'file'}`))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const comma = dataUrl.indexOf('base64,')
      const dataBase64 = comma >= 0 ? dataUrl.slice(comma + 'base64,'.length) : dataUrl
      resolve({
        // Stable-enough client id for list keys without Math.random; index disambiguates.
        id: `${file.name}-${file.size}-${file.lastModified}`,
        filename: file.name || 'screenshot.png',
        contentType: file.type,
        sizeBytes: file.size,
        dataBase64,
        previewUrl: dataUrl,
      })
    }
    reader.readAsDataURL(file)
  })
}

export function toPayload(a: PendingAttachment): FeedbackAttachmentPayload {
  return { filename: a.filename, contentType: a.contentType, dataBase64: a.dataBase64 }
}
