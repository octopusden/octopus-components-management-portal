import { describe, expect, it } from 'vitest'
import { parseServerFieldErrors } from './serverErrors'

// Confirmed CRS 400 format from ControllerExceptionHandler.kt:56-69:
//   { "errorMessage": "Validation failed: field: msg, ..." }  (MethodArgumentNotValidException)
//   { "errorMessage": "name must not be blank" }              (IllegalArgumentException)
// Both are wrapped in ErrorResponse.errorMessage (ErrorResponse.kt:7).

describe('parseServerFieldErrors — MethodArgumentNotValidException format', () => {
  it('extracts a single field error from "Validation failed: field: msg"', () => {
    const body = JSON.stringify({ errorMessage: 'Validation failed: componentOwner: must not be blank' })
    const result = parseServerFieldErrors(body)
    expect(result.get('componentOwner')).toBe('must not be blank')
    expect(result.size).toBe(1)
  })

  it('extracts multiple field errors separated by ", "', () => {
    const body = JSON.stringify({
      errorMessage: 'Validation failed: componentOwner: must not be blank, system: must not be null',
    })
    const result = parseServerFieldErrors(body)
    expect(result.get('componentOwner')).toBe('must not be blank')
    expect(result.get('system')).toBe('must not be null')
    expect(result.size).toBe(2)
  })
})

describe('parseServerFieldErrors — IllegalArgumentException format', () => {
  it('extracts field and message from "name must not be blank" (plain space-separated)', () => {
    const body = JSON.stringify({ errorMessage: 'name must not be blank' })
    const result = parseServerFieldErrors(body)
    expect(result.get('name')).toBe('must not be blank')
  })

  it.each(['componentOwner', 'releaseManager', 'securityChampion', 'clientCode', 'copyright'])(
    'maps field-prefixed validation for %s',
    (field) => {
      const result = parseServerFieldErrors(
        JSON.stringify({ errorMessage: `${field} is invalid` }),
      )
      expect(result.get(field)).toBe('is invalid')
    },
  )

  it('plain-message heuristic captures the first word as candidate field (filtered by caller via GENERAL_TAB_FIELDS)', () => {
    const body = JSON.stringify({ errorMessage: 'Something went wrong internally' })
    const result = parseServerFieldErrors(body)
    // "Something" matches the identifier pattern → key="Something", value="went wrong internally".
    // The caller filters by GENERAL_TAB_FIELDS, so a phantom "Something" key is harmlessly
    // ignored and the toast path surfaces the original message.
    expect(result.get('Something')).toBe('went wrong internally')
  })

  it('returns empty map for an unparseable (non-JSON) message', () => {
    const result = parseServerFieldErrors('not json at all')
    expect(result.size).toBe(0)
  })

  it('returns empty map when called with an already-extracted errorMessage string (callers must pass rawBody, not ApiError.message)', () => {
    // After api.ts extracts errorMessage into ApiError.message for display, the
    // display string is no longer JSON — parseServerFieldErrors must receive
    // ApiError.rawBody (the original JSON envelope) from the call site.
    // This test documents that contract: passing the extracted string yields no fields.
    const extractedDisplayString = 'Validation failed: name: must not be blank'
    const result = parseServerFieldErrors(extractedDisplayString)
    expect(result.size).toBe(0)
  })

  it('returns empty map when errorMessage field is absent', () => {
    const result = parseServerFieldErrors(JSON.stringify({ status: 400, detail: 'oops' }))
    expect(result.size).toBe(0)
  })
})

describe('parseServerFieldErrors — non-GeneralTab fields parse but rely on caller filtering', () => {
  it('a field outside GeneralTab scope (e.g. buildSystem) is parsed but filtered by caller', () => {
    // parseServerFieldErrors itself parses any field — scope filtering happens in ComponentDetailPage.
    const body = JSON.stringify({ errorMessage: 'Validation failed: buildSystem: must not be blank' })
    const result = parseServerFieldErrors(body)
    expect(result.get('buildSystem')).toBe('must not be blank')
  })
})
