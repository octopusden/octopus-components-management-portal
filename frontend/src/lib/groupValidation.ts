// Client-side mirror of the CRS supported-groupId rule (ComponentManagement
// ServiceImpl#validateGroupIdPrefixes, rule #10): a groupId is valid when it
// starts with one of the env-configured `supportedGroupIds` prefixes. The
// supported list is fetched from CRS `GET /rest/api/2/common/supported-groups`.
// This is a friendly pre-flight check; CRS remains authoritative (it 400s a bad
// groupId regardless).

// CRS splits a groupPattern on comma OR pipe (GROUP_ID_SPLIT = /[,|]/), trims,
// and drops blanks. Mirror that exactly so the Portal flags the same tokens.
export function splitGroupIds(input: string): string[] {
  return (input ?? '')
    .split(/[,|]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

// CRS uses a plain `startsWith` (no dot-boundary), so mirror it verbatim to
// avoid rejecting a value the server would accept.
export function hasSupportedPrefix(groupId: string, supported: readonly string[]): boolean {
  return supported.some((p) => groupId.startsWith(p))
}

/**
 * Returns the first token in `input` that does NOT start with a supported
 * prefix, or undefined when all tokens are supported. When `supported` is empty
 * (list not loaded yet, or a mis-configured env) the check is SKIPPED — returns
 * undefined — mirroring CRS, which logs a WARN and skips rather than rejecting
 * every write.
 */
export function findUnsupportedGroupId(
  input: string,
  supported: readonly string[],
): string | undefined {
  if (supported.length === 0) return undefined
  return splitGroupIds(input).find((token) => !hasSupportedPrefix(token, supported))
}
