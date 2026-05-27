/**
 * Suggest a Maven-style groupId for a component, given its component key
 * (a.k.a. component name) and a configured parent prefix.
 *
 * The Maven groupId convention we adopt:
 *   - lowercase
 *   - dots as segment separators
 *   - non-`[a-z0-9.]` runs collapse to a single dot
 *   - leading / trailing dots trimmed
 *
 * The parent is passed through unchanged so admins can configure case if they
 * want; consumers of this helper that validate the result against an allowed
 * prefix list do a case-insensitive comparison.
 *
 * Examples:
 *   suggestGroupId('widget-svc', 'com.example')   → 'com.example.widget.svc'
 *   suggestGroupId('my_lib-v2', 'com.example')    → 'com.example.my.lib.v2'
 *   suggestGroupId('widget',    '')               → ''   (no parent → no suggestion)
 *   suggestGroupId('---',       'com.example')    → 'com.example'  (suffix collapses)
 */
export function suggestGroupId(componentKey: string, parent: string): string {
  if (!parent.trim()) return ''
  const suffix = componentKey
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
  return suffix ? `${parent}.${suffix}` : parent
}
