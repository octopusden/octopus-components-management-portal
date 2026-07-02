import { useState } from 'react'
import { ChevronRight, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArtifactTokensInput } from '@/components/ui/ArtifactTokensInput'
import { ModeRadioGroup } from '@/components/ui/ModeRadioGroup'
import {
  detectIntraComponentConflicts,
  groupError,
  groupTokens,
  hasOverlappingOverrides,
  isExplicitEmpty,
  legacyArtifactPattern,
  newMappingId,
  type OwnershipMappingValue,
} from '@/lib/artifactOwnership'
import { cn } from '@/lib/utils'

interface ArtifactOwnershipEditorProps {
  value: OwnershipMappingValue[]
  onChange: (next: OwnershipMappingValue[]) => void
  /** The component's existing configuration ranges (override mapping ranges must equal one). */
  configRanges: string[]
  /** Supported groupId prefixes (CRS rule #10); empty ⇒ the prefix check is skipped. */
  supportedGroups?: readonly string[]
  disabled?: boolean
}

export function ArtifactOwnershipEditor({ value, onChange, configRanges, supportedGroups = [], disabled }: ArtifactOwnershipEditorProps) {
  const conflictById = detectIntraComponentConflicts(value)
  const overlap = hasOverlappingOverrides(value)
  const baseMappings = value.filter((m) => m.base)
  const overrideMappings = value.filter((m) => !m.base)

  const patch = (id: string, next: Partial<OwnershipMappingValue>) =>
    onChange(value.map((m) => (m.id === id ? { ...m, ...next } : m)))
  const remove = (id: string) => onChange(value.filter((m) => m.id !== id))

  const addBase = () =>
    onChange([...value, { id: newMappingId(), base: true, range: null, groups: '', mode: 'ALL', tokens: [] }])
  const addOverride = () => {
    const used = new Set(overrideMappings.map((m) => m.range))
    const free = configRanges.find((r) => !used.has(r)) ?? configRanges[0] ?? ''
    onChange([
      ...value,
      {
        id: newMappingId(),
        base: false,
        range: free,
        groups: groupTokens(baseMappings[0]?.groups ?? '').join(','),
        mode: 'EXPLICIT',
        tokens: [],
      },
    ])
  }

  const conflictCount = Object.keys(conflictById).length

  return (
    <div className="flex flex-col gap-4" data-testid="ownership-editor">
      {(conflictCount > 0 || overlap) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-destructive">Ownership conflict</span>
            <span className="text-[13px] text-destructive/90">
              {conflictCount > 0
                ? (Object.values(conflictById)[0] as string)
                : 'Version-range overrides overlap — per-range ownership ranges must be disjoint.'}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-normal text-muted-foreground">Applies to all versions</h4>
        {baseMappings.map((m) => (
          <MappingCard
            key={m.id}
            mapping={m}
            allMappings={value}
            conflict={conflictById[m.id]}
            supportedGroups={supportedGroups}
            disabled={disabled}
            onPatch={(next) => patch(m.id, next)}
            onRemove={() => remove(m.id)}
          />
        ))}
        {!disabled && (
          <Button type="button" variant="outline" size="sm" className="w-max border-dashed" onClick={addBase}>
            <Plus className="h-4 w-4" />
            Add artifact coordinates
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <h4 className="text-xs font-semibold">
          Version-range overrides <span className="font-normal text-muted-foreground">· replace base ownership for a range</span>
        </h4>
        {overrideMappings.length > 0 && <CoverageTimeline overrides={overrideMappings} overlap={overlap} />}
        {overrideMappings.map((m) => (
          <MappingCard
            key={m.id}
            mapping={m}
            allMappings={value}
            conflict={conflictById[m.id]}
            configRanges={configRanges}
            supportedGroups={supportedGroups}
            disabled={disabled}
            onPatch={(next) => patch(m.id, next)}
            onRemove={() => remove(m.id)}
          />
        ))}
        {!disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-max border-dashed"
            disabled={configRanges.length === 0}
            title={configRanges.length === 0 ? 'Add a version-range configuration first' : undefined}
            onClick={addOverride}
          >
            <Plus className="h-4 w-4" />
            Add version-range override
          </Button>
        )}
      </div>
    </div>
  )
}

interface MappingCardProps {
  mapping: OwnershipMappingValue
  allMappings: OwnershipMappingValue[]
  conflict?: string
  configRanges?: string[]
  supportedGroups?: readonly string[]
  disabled?: boolean
  onPatch: (next: Partial<OwnershipMappingValue>) => void
  onRemove: () => void
}

function MappingCard({ mapping, allMappings, conflict, configRanges, supportedGroups = [], disabled, onPatch, onRemove }: MappingCardProps) {
  const [legacyOpen, setLegacyOpen] = useState(false)
  const gErr = groupError(mapping, supportedGroups)
  const explicitEmpty = isExplicitEmpty(mapping)

  return (
    <div className={cn('flex flex-col gap-3.5 rounded-lg border p-3.5', conflict ? 'border-destructive/40' : 'border-input')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          {mapping.base ? 'Artifact coordinates' : `Override · ${mapping.range ?? ''}`}
        </span>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive"
            aria-label="Remove mapping"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {!mapping.base && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Version range</span>
          <select
            className="h-9 w-[220px] rounded-md border border-input bg-background px-3 font-mono text-sm"
            aria-label="Override version range"
            value={mapping.range ?? ''}
            disabled={disabled}
            onChange={(e) => onPatch({ range: e.target.value })}
          >
            {(configRanges ?? []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Group ID</span>
        <Input
          className={cn('font-mono', gErr && 'border-destructive')}
          placeholder="com.example.foo"
          aria-label="Group ID"
          value={mapping.groups}
          disabled={disabled}
          onChange={(e) => onPatch({ groups: e.target.value })}
        />
        {gErr && <span className="text-xs text-destructive">{gErr}</span>}
      </label>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Owns</span>
        <ModeRadioGroup
          value={mapping.mode}
          disabled={disabled}
          idPrefix={`mode-${mapping.id}`}
          onChange={(mode) => onPatch({ mode })}
        />
      </div>

      {mapping.mode === 'EXPLICIT' && (
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Artifacts</span>
          <ArtifactTokensInput
            tokens={mapping.tokens}
            disabled={disabled}
            ariaLabel="Artifact IDs"
            onChange={(tokens) => onPatch({ tokens })}
          />
          {explicitEmpty && (
            <span className="text-xs text-destructive">Add at least one artifact, or switch to a catch-all mode.</span>
          )}
          <span className="text-xs text-muted-foreground">
            Literal artifact IDs, one per chip. Paste a comma / pipe / space list to split. Specific artifacts override
            unclaimed catch-all mappings during resolution.
          </span>
        </div>
      )}

      {conflict && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/[0.06] p-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span className="text-xs text-destructive/90">{conflict}</span>
        </div>
      )}

      <div className="border-t border-border/60 pt-2.5">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          onClick={() => setLegacyOpen((v) => !v)}
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform', legacyOpen && 'rotate-90')} />
          Legacy preview
        </button>
        {legacyOpen && (
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
            <span className="text-muted-foreground">groupIdPattern</span>
            <span className="break-all">{mapping.groups.split(',').map((g) => g.trim()).filter(Boolean).join(',')}</span>
            <span className="text-muted-foreground">artifactIdPattern</span>
            <span className="break-all">{legacyArtifactPattern(mapping, allMappings)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function CoverageTimeline({ overrides, overlap }: { overrides: OwnershipMappingValue[]; overlap: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coverage</span>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">base · All versions</span>
        {overrides.map((m) => (
          <span
            key={m.id}
            className={cn(
              'rounded px-2 py-0.5 font-mono text-[11px]',
              overlap ? 'bg-destructive/15 text-destructive' : 'bg-primary/10 text-primary',
            )}
          >
            {m.range}
          </span>
        ))}
      </div>
      {overlap && (
        <span className="text-xs text-destructive">Override ranges overlap — per-range ownership ranges must be disjoint.</span>
      )}
    </div>
  )
}
