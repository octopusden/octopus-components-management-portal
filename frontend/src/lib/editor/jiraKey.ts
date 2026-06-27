/**
 * Shared validation/normalization for the optional change-metadata Jira task key
 * captured when saving a component (edit + create). Mirrors the server-side
 * `@field:Pattern` in CRS (`JIRA_TASK_KEY_PATTERN`): a project key of 2+ chars
 * starting with a letter, a dash, then digits (e.g. `ABC-123`).
 *
 * A blank/whitespace value is a valid "no key" — it is never an error and is
 * normalized away (omitted) before submission, so the server never receives a
 * stray empty string.
 */
export const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/

export const JIRA_KEY_ERROR = 'Enter a Jira task key like ABC-123, or leave it blank.'

/**
 * Returns an error message for a non-blank, malformed key, or `null` when the
 * value is acceptable (blank/whitespace counts as acceptable "no key"). The
 * trimmed value is validated — leading/trailing whitespace is tolerated because
 * `normalizeJiraKey` strips it before submission.
 */
export function validateJiraKey(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return null
  return JIRA_KEY_REGEX.test(trimmed) ? null : JIRA_KEY_ERROR
}

/**
 * Normalize a raw input for submission: the trimmed value, or `undefined` when
 * blank. Keeps the wire payload free of empty strings (the server accepts blank
 * but normalizes it to null anyway).
 */
export function normalizeJiraKey(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** Normalize a free-text comment for submission: trimmed value, or `undefined` when blank. */
export function normalizeChangeComment(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
