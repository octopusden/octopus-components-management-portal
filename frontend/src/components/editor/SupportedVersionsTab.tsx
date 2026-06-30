import { useState } from 'react'
import { Plus, X, AlertTriangle, Infinity as InfinityIcon } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useSupportedVersions, useUpdateSupportedVersions } from '../../hooks/useComponent'
import { isValidVersionRange, isAllowedOverrideRange, formatVersionRange, compareVersionRanges } from '../../lib/versionRange'

interface SupportedVersionsTabProps {
  componentId: string
  // Read-only when the user can't edit the component — the list still renders.
  canEdit: boolean
}

/**
 * Supported-versions (coverage) editor — ADR-018 layer 1. Coverage is independent of per-attribute
 * overrides: a version outside `supported` resolves to 404. `all = true` means every version is
 * covered (no bounded rows); otherwise coverage is the union of the listed ranges.
 *
 * The API is declarative — every edit PUTs the full desired set, which the server stores MERGED
 * (overlapping / contiguous ranges collapse; a set tiling all-versions becomes `all`). Coverage is
 * decoupled from overrides — it never reshapes them; the v2/v3 range VIEWS are derived at read time.
 * The response surfaces V1/V5 warnings (an override left entirely outside supported).
 */
export function SupportedVersionsTab({ componentId, canEdit }: SupportedVersionsTabProps) {
  const { data, isLoading } = useSupportedVersions(componentId)
  const updateMutation = useUpdateSupportedVersions(componentId)

  const [newRange, setNewRange] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading supported versions…</p>
  }

  const ranges = [...data.ranges].sort(compareVersionRanges)
  const warnings = data.warnings ?? []

  // Live validation of the add input so the button can pre-disable (consistent with the field-override
  // editors) and the error shows as you type, not only after a click.
  const trimmedNew = newRange.trim()
  const addRangeError =
    trimmedNew === ''
      ? null
      : !isValidVersionRange(trimmedNew)
        ? 'Invalid version range syntax'
        : !isAllowedOverrideRange(trimmedNew)
          ? 'That is the all-versions default — use “Set to all versions”, or enter a bounded / open-upper range'
          : null

  function put(next: { all?: boolean; ranges?: string[] }, onSuccess?: () => void) {
    setError(null)
    updateMutation.mutate(next, {
      onSuccess: () => onSuccess?.(),
      onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to update supported versions'),
    })
  }

  function handleAdd() {
    if (trimmedNew === '' || addRangeError !== null) return
    // Clear the input only after the PUT succeeds, so a server rejection leaves the value to fix.
    put({ ranges: [...ranges, trimmedNew] }, () => setNewRange(''))
  }

  function handleRemove(range: string) {
    put({ ranges: ranges.filter((r) => r !== range) })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The versions this component is defined for. A version outside the supported set resolves to “no
        configuration” (404). Per-attribute overrides are edited separately under <strong>Overrides</strong>.
      </p>

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          <div className="flex items-center gap-1 font-medium">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Warnings
          </div>
          <ul className="ml-5 list-disc">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {data.all ? (
        <div className="flex items-center gap-2 text-sm">
          <InfinityIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>
            Supported: <strong>All versions</strong>
          </span>
        </div>
      ) : (
        <ul className="space-y-1" aria-label="Supported version ranges">
          {ranges.map((range) => (
            <li key={range} className="flex items-center gap-2">
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{formatVersionRange(range)}</code>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Remove supported range ${range}`}
                  disabled={updateMutation.isPending}
                  onClick={() => handleRemove(range)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              aria-label="New supported version range"
              placeholder="[1.0,2.0) or [2.0,)"
              className="font-mono max-w-xs"
              value={newRange}
              onChange={(e) => {
                setNewRange(e.target.value)
                setError(null)
              }}
            />
            <Button
              size="sm"
              disabled={trimmedNew === '' || addRangeError !== null || updateMutation.isPending}
              onClick={handleAdd}
            >
              <Plus className="mr-1 h-3 w-3" /> Add range
            </Button>
            {!data.all && (
              <Button
                size="sm"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() => put({ all: true })}
              >
                Set to all versions
              </Button>
            )}
          </div>
          {(addRangeError ?? error) && <p className="text-xs text-destructive">{addRangeError ?? error}</p>}
        </div>
      )}
    </div>
  )
}
