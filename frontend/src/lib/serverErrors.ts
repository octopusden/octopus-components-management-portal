/**
 * CRS 400 body shape: `{ "errorMessage": "..." }`.
 *
 * Two variants of the embedded message:
 *  - MethodArgumentNotValidException → "Validation failed: field: msg, field2: msg2"
 *  - IllegalArgumentException (the common component update path) → plain string,
 *    no field prefix; e.g. "name must not be blank"
 *
 * Returns a map of field→message. The caller is responsible for filtering to
 * only the fields it owns (e.g. GeneralTab fields via GENERAL_TAB_FIELDS).
 *
 * Confirmed format: ControllerExceptionHandler.kt:56-69 (CRS v4).
 */
export function parseServerFieldErrors(apiErrorMessage: string): Map<string, string> {
  const result = new Map<string, string>()
  let errorMessage: string
  try {
    const parsed = JSON.parse(apiErrorMessage) as { errorMessage?: unknown }
    if (typeof parsed.errorMessage !== 'string') return result
    errorMessage = parsed.errorMessage
  } catch {
    return result
  }

  // "Validation failed: fieldA: msg1, fieldB: msg2"
  const validationPrefix = 'Validation failed: '
  if (errorMessage.startsWith(validationPrefix)) {
    const violations = errorMessage.slice(validationPrefix.length)
    // Each violation is "<field>: <message>"; split on ", " between violations.
    // A field message itself may contain ", " so we must parse field-by-field.
    // CRS field names are camelCase identifiers with no spaces, which lets us
    // split on the pattern ", <word>: " to separate successive violations.
    const entries = violations.split(/, (?=[a-zA-Z][a-zA-Z0-9]*: )/)
    for (const entry of entries) {
      const colonIdx = entry.indexOf(': ')
      if (colonIdx === -1) continue
      const field = entry.slice(0, colonIdx).trim()
      const msg = entry.slice(colonIdx + 2).trim()
      if (field) result.set(field, msg)
    }
    return result
  }

  // Plain message — try to extract a leading "fieldName " pattern.
  // e.g. "name must not be blank" → field="name", msg="must not be blank"
  const plainMatch = /^([a-zA-Z][a-zA-Z0-9]*)(\s.+)$/.exec(errorMessage)
  if (plainMatch) {
    result.set(plainMatch[1]!, plainMatch[2]!.trim())
  }

  return result
}
