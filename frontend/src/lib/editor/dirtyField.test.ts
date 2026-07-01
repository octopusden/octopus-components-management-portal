import { describe, it, expect } from 'vitest'
import { isFieldDirty } from './dirtyField'

// Regression guard for the SYS-039 multi-list Save-bar bug (PR #135 fallout):
// react-hook-form stores a field's dirty flag as a collapsed boolean `true` for
// scalars, BUT as a per-element boolean array for ARRAY fields once anything
// subscribes `formState.isDirty` (that read flips dirty tracking from collapsed
// to structural). The editor's array gates (labels / releaseManager /
// securityChampion) used `=== true`, so an added/reordered person produced
// `[true]` / `[false, true]`, the gate read false, and "Save changes" never
// armed. isFieldDirty treats both shapes uniformly.
describe('isFieldDirty', () => {
  it('scalar dirty flag (true) is dirty', () => {
    expect(isFieldDirty(true)).toBe(true)
  })

  it('false / undefined are clean', () => {
    expect(isFieldDirty(false)).toBe(false)
    expect(isFieldDirty(undefined)).toBe(false)
  })

  it('per-element array with any true is dirty (the regression case)', () => {
    expect(isFieldDirty([true])).toBe(true) // appended one person to []
    expect(isFieldDirty([false, true])).toBe(true) // added to a non-empty list
    expect(isFieldDirty([true, true])).toBe(true) // reordered two people
  })

  it('per-element array that is all-false is clean', () => {
    expect(isFieldDirty([false, false])).toBe(false)
    expect(isFieldDirty([])).toBe(false)
  })

  it('array of objects (docs/artifactIds shape) is dirty when any leaf is', () => {
    expect(isFieldDirty([{ docComponentKey: true, majorVersion: false }])).toBe(true)
    expect(isFieldDirty([{ docComponentKey: false, majorVersion: false }])).toBe(false)
  })
})
