/**
 * Field-config editability payload-gating for combined-Save section slices.
 *
 * A section hook builds its PATCH fragment (e.g. `baseConfiguration.jira = {…}`).
 * Fields the current user may not edit must be OMITTED from that fragment —
 * client-side omission is the primary correctness mechanism; the server's
 * change-based 422 is defense-in-depth (plan §P-1). This helper drops the
 * non-editable keys from a flat payload object given a key→field-path map and
 * an editability predicate.
 *
 * Keys with no mapped path are always kept — they are not field-config-gated
 * (e.g. a required scalar the section always owns). Falsy values (0, '', false,
 * null) are preserved for editable keys; only omission is decided here, never
 * the wire value (a cleared aspect scalar still sends '' — see the section
 * hooks). Pure; the section hooks compose `isEditable` from `isFieldEditableFor`
 * + the current user (wired in P-2a / P-3, not here).
 */
export type FieldEditablePredicate = (fieldPath: string) => boolean

export function omitNonEditable<T extends Record<string, unknown>>(
  payload: T,
  fieldPaths: Partial<Record<keyof T, string>>,
  isEditable: FieldEditablePredicate,
): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(payload) as (keyof T)[]) {
    const path = fieldPaths[key]
    if (path !== undefined && !isEditable(path)) continue
    out[key] = payload[key]
  }
  return out
}
