export function formatVersionRange(range: string): string {
  if (range === '(,)') return 'All versions'
  return range
}

export function isValidVersionRange(range: string): boolean {
  if (!range) return false
  // Basic validation: must start with ( or [ and end with ) or ]
  const trimmed = range.trim()
  if (trimmed.length < 3) return false
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first !== '(' && first !== '[') || (last !== ')' && last !== ']')) return false
  // Must contain a comma
  if (!trimmed.includes(',')) return false
  return true
}

/**
 * Returns true when `range` is allowed as a field-override range under D5:
 * syntactically valid AND not open-upward in its trailing segment. Universal
 * forms (`(,)`, `(,0),[0,)`) and simple open-upward (`[X,)` / `(X,)`) end
 * with `,)` and are rejected — they belong to BASE, not overrides.
 *
 * Allowed: closed (`[X,Y)`, `[X,Y]`, `(X,Y)`, `(X,Y]`) and
 * historical-left-unbounded (`(,X)`, `(,X]`), plus composites whose trailing
 * segment satisfies the same rule.
 *
 * Known limitation: composites with open-upward in a non-terminal segment
 * (e.g. `[1.0,),[2.0,3.0]`) slip past this check because the string ends in
 * `]`. CRS-side validation (D5 enforcement on POST/PATCH, PR-A step 5) is
 * the authoritative backstop; a parser-backed Portal check is tracked as
 * P-Releng (R2) in the plan.
 */
export function isClosedVersionRange(range: string): boolean {
  if (!isValidVersionRange(range)) return false
  return !range.trim().endsWith(',)')
}
