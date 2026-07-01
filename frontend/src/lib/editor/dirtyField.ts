/**
 * Normalizes react-hook-form's two `dirtyFields[name]` shapes to a single
 * "did this field change" boolean.
 *
 * RHF collapses a dirty field to the boolean `true` for scalars, but stores a
 * per-element boolean (array / nested object mirroring the value) for array and
 * object fields the moment anything subscribes `formState.isDirty` — that read
 * switches dirty tracking from collapsed to structural for the whole form. So
 * `dirtyFields.releaseManager` can be `true` OR `[true]` / `[false, true]`
 * depending on whether some component happened to read `isDirty`. A gate that
 * tests `=== true` then silently misses real edits to array fields.
 *
 * isFieldDirty treats every shape uniformly: dirty iff the scalar flag is true,
 * or any leaf inside the array/object structure is true.
 */
export function isFieldDirty(flag: unknown): boolean {
  if (flag === true) return true
  if (Array.isArray(flag)) return flag.some(isFieldDirty)
  if (flag && typeof flag === 'object') return Object.values(flag).some(isFieldDirty)
  return false
}
