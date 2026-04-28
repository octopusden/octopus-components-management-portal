/**
 * Shared cookie helpers. The portal stores its CSRF token in a non-HttpOnly cookie
 * (XSRF-TOKEN) so the SPA can echo it on state-changing requests and on the /logout
 * form post. Both api.ts and auth.ts need to read it; this module is the single
 * source of truth so the parsing logic doesn't drift.
 */
export function readCookie(name: string): string | null {
  const needle = `${name}=`
  const pairs = document.cookie ? document.cookie.split('; ') : []
  for (const pair of pairs) {
    if (pair.startsWith(needle)) return decodeURIComponent(pair.substring(needle.length))
  }
  return null
}
