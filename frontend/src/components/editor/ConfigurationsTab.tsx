import { useMemo } from 'react'
import { Badge } from '../ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { compareVersionRanges, rangesOverlap, formatVersionRange } from '../../lib/versionRange'
import type { ComponentDetail, ComponentConfiguration } from '../../lib/types'

interface ConfigurationsTabProps {
  component: ComponentDetail
}

// Maps a MARKER overriddenAttribute to the corresponding child collection key
// and a human-readable unit label for the summary column.
const MARKER_COLLECTION_MAP: Record<
  string,
  { key: keyof ComponentConfiguration; unit: string }
> = {
  'vcs.settings': { key: 'vcsEntries', unit: 'entries' },
  'distribution.maven': { key: 'mavenArtifacts', unit: 'entries' },
  'distribution.fileUrl': { key: 'fileUrlArtifacts', unit: 'entries' },
  'distribution.docker': { key: 'dockerImages', unit: 'entries' },
  'distribution.packages': { key: 'packages', unit: 'entries' },
  'build.requiredTools': { key: 'requiredTools', unit: 'tools' },
}

function baseRowSummary(row: ComponentConfiguration): string {
  const aspects: string[] = []
  if (row.build) aspects.push('build')
  if (row.escrow) aspects.push('escrow')
  if (row.jira) aspects.push('jira')

  const collections: string[] = []
  if (row.vcsEntries.length > 0) collections.push(`vcsEntries: ${row.vcsEntries.length}`)
  if (row.mavenArtifacts.length > 0) collections.push(`maven: ${row.mavenArtifacts.length}`)
  if (row.fileUrlArtifacts.length > 0) collections.push(`fileUrl: ${row.fileUrlArtifacts.length}`)
  if (row.dockerImages.length > 0) collections.push(`docker: ${row.dockerImages.length}`)
  if (row.packages.length > 0) collections.push(`packages: ${row.packages.length}`)
  if (row.requiredTools.length > 0) collections.push(`requiredTools: ${row.requiredTools.length}`)

  const parts: string[] = []
  if (aspects.length > 0) parts.push(aspects.join(', '))
  if (collections.length > 0) parts.push(collections.join(' • '))

  return parts.join(' • ') || '—'
}

function scalarOverrideSummary(row: ComponentConfiguration): string {
  const attr = row.overriddenAttribute
  if (!attr) return '—'

  const dotIdx = attr.indexOf('.')
  if (dotIdx === -1) return '—'

  const aspectKey = attr.slice(0, dotIdx) as 'build' | 'escrow' | 'jira'
  const fieldKey = attr.slice(dotIdx + 1)

  const aspect = row[aspectKey] as Record<string, unknown> | null | undefined
  // Distinguish "field absent" (undefined) from "field present, explicitly
  // nulled" (null) so debugging a schema mismatch doesn't see misleading
  // `= null` on a path the row doesn't even carry.
  if (aspect === undefined || aspect === null || !(fieldKey in aspect)) return '—'
  const value = aspect[fieldKey]
  if (value === null) return '= null'
  return `= ${String(value)}`
}

function markerSummary(row: ComponentConfiguration): string {
  const attr = row.overriddenAttribute
  if (!attr) return '—'

  const mapping = MARKER_COLLECTION_MAP[attr]
  if (!mapping) return '—'

  const collection = row[mapping.key]
  const count = Array.isArray(collection) ? collection.length : 0
  return `${count} ${mapping.unit}`
}

function rowSummary(row: ComponentConfiguration): string {
  if (row.rowType === 'BASE') return baseRowSummary(row)
  if (row.rowType === 'SCALAR_OVERRIDE') return scalarOverrideSummary(row)
  return markerSummary(row)
}

// Override rows (SCALAR_OVERRIDE / MARKER) on the same attribute must be
// disjoint; any pair that overlaps, contains, or equals is a conflict. Returns
// the ids of every row involved in at least one such conflict so the table can
// flag them. 'unknown' (composite / qualifier) pairs are left to the server.
function conflictingRowIds(rows: ComponentConfiguration[]): Set<string> {
  const overrides = rows.filter(
    (r) => r.rowType === 'SCALAR_OVERRIDE' || r.rowType === 'MARKER',
  )
  const ids = new Set<string>()
  for (let i = 0; i < overrides.length; i++) {
    for (let j = i + 1; j < overrides.length; j++) {
      const a = overrides[i]!
      const b = overrides[j]!
      if (!a.overriddenAttribute || a.overriddenAttribute !== b.overriddenAttribute) continue
      if (rangesOverlap(a.versionRange, b.versionRange) === true) {
        ids.add(a.id)
        ids.add(b.id)
      }
    }
  }
  return ids
}

function rowTypeBadgeVariant(rowType: string): 'default' | 'secondary' | 'outline' {
  if (rowType === 'BASE') return 'default'
  if (rowType === 'SCALAR_OVERRIDE') return 'secondary'
  return 'outline'
}

function sortedConfigurations(rows: ComponentConfiguration[]): ComponentConfiguration[] {
  const base = rows.filter((r) => r.rowType === 'BASE')
  // invariant: there should be exactly one BASE row per component
  // Within an attribute, order by version range numerically (compareVersionRanges
  // handles `[10.0,)` vs `[2.0,)`) rather than lexically.
  const byAttrThenRange = (a: ComponentConfiguration, b: ComponentConfiguration) => {
    const attrCmp = (a.overriddenAttribute ?? '').localeCompare(b.overriddenAttribute ?? '')
    if (attrCmp !== 0) return attrCmp
    return compareVersionRanges(a.versionRange, b.versionRange)
  }
  const scalar = rows
    .filter((r) => r.rowType === 'SCALAR_OVERRIDE')
    .sort(byAttrThenRange)
  const marker = rows
    .filter((r) => r.rowType === 'MARKER')
    .sort(byAttrThenRange)
  return [...base, ...scalar, ...marker]
}

export function ConfigurationsTab({ component }: ConfigurationsTabProps) {
  const configurations = component.configurations
  // Memoize the sort before any early-return branch so the hook is called
  // unconditionally on every render (React rules of hooks).
  const sorted = useMemo(
    () => sortedConfigurations(configurations ?? []),
    [configurations],
  )
  const conflicts = useMemo(
    () => conflictingRowIds(configurations ?? []),
    [configurations],
  )

  if (!configurations || configurations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No configuration rows</p>
    )
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Version Range</TableHead>
            <TableHead>Overridden Attribute</TableHead>
            <TableHead>Payload Summary</TableHead>
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Badge variant={rowTypeBadgeVariant(row.rowType)}>
                  {row.rowType}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{formatVersionRange(row.versionRange)}</TableCell>
              <TableCell className="font-mono text-xs">
                {row.overriddenAttribute ?? '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                {rowSummary(row)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {row.isSyntheticBase && (
                    <Badge variant="warning" className="text-xs">
                      synthetic
                    </Badge>
                  )}
                  {conflicts.has(row.id) && (
                    <Badge
                      variant="destructive"
                      className="text-xs"
                      title="Overlaps another override on the same attribute — ranges must be disjoint"
                    >
                      overlaps
                    </Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
