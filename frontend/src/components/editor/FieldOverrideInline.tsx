import { useState } from 'react'
import { Plus, X, Pencil, Check } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'
import { useFieldOverrides, useCreateFieldOverride, useUpdateFieldOverride, useDeleteFieldOverride } from '../../hooks/useComponent'
import { formatVersionRange, isValidVersionRange, isClosedVersionRange, rangesOverlap } from '../../lib/versionRange'
import type { FieldOverride } from '../../lib/types'

// Scalar override paths whose column type is boolean (from CRS
// ConfigurationRowAccessors.kt). For these the inline editor must dispatch
// to a Switch and parse the value to a JSON boolean before sending, otherwise
// the server stores "true"/"false" as strings (the Kotlin column accessor
// uses requireBoolean which would 400 on a string value, OR for the typed
// fields receive the string and fail at the JPA level).
const BOOLEAN_OVERRIDE_PATHS = new Set([
  'build.deprecated',
  'build.requiredProject',
  'escrow.reusable',
  'escrow.gradleIncludeTestConfigurations',
  'jira.technical',
])

interface FieldOverrideInlineProps {
  componentId: string
  overriddenAttribute: string
}

export function FieldOverrideInline({ componentId, overriddenAttribute }: FieldOverrideInlineProps) {
  const { data: allOverrides = [] } = useFieldOverrides(componentId)
  const createMutation = useCreateFieldOverride(componentId)
  const updateMutation = useUpdateFieldOverride(componentId)
  const deleteMutation = useDeleteFieldOverride(componentId)

  const overrides = allOverrides.filter((o) => o.overriddenAttribute === overriddenAttribute)
  const isBoolean = BOOLEAN_OVERRIDE_PATHS.has(overriddenAttribute)

  const [adding, setAdding] = useState(false)
  // D5: field-override ranges must be closed; no universal default. User
  // enters an explicit closed range like `[1.0,2.0)` or historical-left-
  // unbounded `(,1.0)`. Open-upward / universal forms belong to BASE.
  const [newRange, setNewRange] = useState('')
  const [newValue, setNewValue] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRange, setEditRange] = useState('')
  const [editValue, setEditValue] = useState('')

  // Inline error for the add form. Three states:
  //   - empty             → "required" (button disabled silently for empty is
  //                          confusing; show the requirement explicitly only
  //                          if the user has tried to interact — for now we
  //                          gate by tracking whether the form has been
  //                          touched in any way).
  //   - syntactically broken → invalid-syntax error
  //   - open-upward      → "edit BASE instead" error
  // Button is disabled in all three cases.
  function findOverlapping(range: string, excludeId: string | null): string | null {
    if (!isClosedVersionRange(range)) return null
    for (const o of overrides) {
      if (o.id === excludeId) continue
      if (rangesOverlap(range, o.versionRange) === true) return o.versionRange
    }
    return null
  }
  // Compute once per render and feed both the visible error message and the
  // disabled-state — avoids walking the overrides list twice (and avoids the
  // cargo-cult risk of the next reader splitting the cases by accident).
  const newOverlap = findOverlapping(newRange, null)
  const editOverlap = findOverlapping(editRange, editingId)
  function rangeError(range: string, valueTouched: boolean, overlap: string | null): string | null {
    const trimmed = range.trim()
    if (trimmed === '') {
      return valueTouched ? 'Version range is required' : null
    }
    if (!isValidVersionRange(range)) return 'Invalid version range syntax'
    if (!isClosedVersionRange(range)) {
      return 'Open-upward range — edit the BASE field above instead'
    }
    if (overlap !== null) {
      return `Overlaps with existing override ${overlap}`
    }
    return null
  }
  const newRangeError = rangeError(newRange, newValue.trim() !== '', newOverlap)
  const editRangeError = rangeError(editRange, true, editOverlap)
  // Disabled state — separate from the visible error so the empty-untouched
  // case still blocks submit (no false visual nag for an unmodified blank
  // form).
  const newRangeBlocks = !isClosedVersionRange(newRange) || newOverlap !== null
  const editRangeBlocks = !isClosedVersionRange(editRange) || editOverlap !== null

  function handleAdd() {
    if (newRangeBlocks) return
    // Boolean paths: send the JSON primitive `true` / `false`; the local string
    // state is `"true"` / `"false"` driven by the Switch. String paths: trim
    // and reject empty (preserves the prior validation).
    let wireValue: unknown
    if (isBoolean) {
      wireValue = newValue === 'true'
    } else {
      if (!newValue.trim()) return
      wireValue = newValue
    }
    createMutation.mutate(
      { overriddenAttribute, versionRange: newRange, value: wireValue },
      {
        onSuccess: () => {
          setAdding(false)
          setNewRange('')
          setNewValue('')
        },
      },
    )
  }

  function startEdit(override: FieldOverride) {
    setEditingId(override.id)
    setEditRange(override.versionRange)
    // Boolean paths: convert the JSON boolean back to the canonical
    // "true" / "false" string state used by the Switch.
    if (isBoolean) {
      setEditValue(override.value === true ? 'true' : 'false')
    } else {
      setEditValue(String(override.value ?? ''))
    }
  }

  function handleUpdate() {
    if (!editingId || editRangeBlocks) return
    const wireValue: unknown = isBoolean ? editValue === 'true' : editValue
    updateMutation.mutate(
      { overrideId: editingId, versionRange: editRange, value: wireValue },
      { onSuccess: () => setEditingId(null) },
    )
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id)
  }

  if (overrides.length === 0 && !adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
      >
        <Plus className="h-3 w-3" />
        Add override
      </button>
    )
  }

  return (
    <div className="mt-1 space-y-1">
      {overrides.map((override) => (
        <div key={override.id}>
          {editingId === override.id ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Input
                  value={editRange}
                  onChange={(e) => setEditRange(e.target.value)}
                  className="h-6 w-24 text-xs font-mono px-1"
                  placeholder="[1.0,2.0)"
                  aria-label={`Override version range for ${overriddenAttribute}`}
                  aria-invalid={editRangeError !== null}
                />
                {isBoolean ? (
                  <Switch
                    checked={editValue === 'true'}
                    onCheckedChange={(c) => setEditValue(c ? 'true' : 'false')}
                    aria-label={`Override value for ${overriddenAttribute}`}
                  />
                ) : (
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="h-6 flex-1 text-xs px-1"
                    aria-label={`Override value for ${overriddenAttribute}`}
                  />
                )}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleUpdate} disabled={updateMutation.isPending || editRangeBlocks}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {editRangeError && (
                <p className="text-xs text-destructive">{editRangeError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <Badge variant="outline" className="text-xs font-mono h-5 px-1.5">
                {formatVersionRange(override.versionRange)}
              </Badge>
              <span className="text-xs text-muted-foreground">&rarr;</span>
              <span className="text-xs">{String(override.value)}</span>
              <button
                type="button"
                onClick={() => startEdit(override)}
                className="hidden group-hover:inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(override.id)}
                className="hidden group-hover:inline-flex h-4 w-4 items-center justify-center text-destructive hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Input
              value={newRange}
              onChange={(e) => setNewRange(e.target.value)}
              className="h-6 w-24 text-xs font-mono px-1"
              placeholder="[1.0,2.0)"
              autoFocus
              aria-label={`New override version range for ${overriddenAttribute}`}
              aria-invalid={newRangeError !== null}
            />
            {isBoolean ? (
              <Switch
                checked={newValue === 'true'}
                onCheckedChange={(c) => setNewValue(c ? 'true' : 'false')}
                aria-label={`New override value for ${overriddenAttribute}`}
              />
            ) : (
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-6 flex-1 text-xs px-1"
                placeholder="Override value"
                aria-label={`New override value for ${overriddenAttribute}`}
              />
            )}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleAdd} disabled={createMutation.isPending || newRangeBlocks}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setAdding(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {newRangeError && (
            <p className="text-xs text-destructive">{newRangeError}</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add override
        </button>
      )}
    </div>
  )
}
