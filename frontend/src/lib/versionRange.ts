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
 * syntactically valid AND not open-upward (`[X,)` / `(X,)`) anywhere in its
 * last segment. Open-upward and universal forms (`(,)`, `(,0),[0,)`) all end
 * with `,)` and belong to BASE, not overrides.
 *
 * Allowed: closed (`[X,Y)`, `[X,Y]`, `(X,Y)`, `(X,Y]`) and
 * historical-left-unbounded (`(,X)`, `(,X]`), plus composites whose last
 * segment satisfies the same rule.
 */
export function isClosedVersionRange(range: string): boolean {
  if (!isValidVersionRange(range)) return false
  return !range.trim().endsWith(',)')
}
