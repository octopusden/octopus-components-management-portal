import { Fragment, useMemo, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import type { AuditLogEntry } from '../lib/types'
import { cn } from '../lib/utils'

interface AuditDiffViewerProps {
  entry: AuditLogEntry
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

interface DiffRow {
  key: string
  oldText: string
  newText: string
  changed: boolean
}

// A run of consecutive rows shown as one block; `gap` runs are unchanged fields
// hidden behind an expander (Bitbucket-style "show more context"). Zero context
// rows are kept around a change — the diff shows only what changed until the
// user asks for the surrounding fields.
type Segment =
  | { type: 'rows'; rows: DiffRow[] }
  | { type: 'gap'; id: string; rows: DiffRow[] }

function buildRows(entry: AuditLogEntry): DiffRow[] {
  const { oldValue, newValue } = entry
  if (!oldValue && !newValue) return []
  // Union of keys, new-value order first (that's the post-change shape) then any
  // keys only the old snapshot had (e.g. a field removed by the change).
  const keys: string[] = []
  const seen = new Set<string>()
  for (const k of Object.keys(newValue ?? {})) if (!seen.has(k)) { seen.add(k); keys.push(k) }
  for (const k of Object.keys(oldValue ?? {})) if (!seen.has(k)) { seen.add(k); keys.push(k) }

  const changedKeys = new Set<string>(entry.changeDiff ? Object.keys(entry.changeDiff) : [])
  // CREATE (no old) / DELETE (no new): every field is part of the change.
  const wholeRecordChanged = !oldValue || !newValue

  return keys.map((key) => {
    const oldText = formatValue(oldValue?.[key])
    const newText = formatValue(newValue?.[key])
    const changed = wholeRecordChanged
      ? true
      : changedKeys.size > 0
        ? changedKeys.has(key)
        : oldText !== newText
    return { key, oldText, newText, changed }
  })
}

// Split rows into visible blocks and collapsible gaps: any maximal run of
// unchanged rows becomes a gap. Changed rows always render.
function buildSegments(rows: DiffRow[]): Segment[] {
  const segments: Segment[] = []
  let i = 0
  while (i < rows.length) {
    if (rows[i]!.changed) {
      const start = i
      while (i < rows.length && rows[i]!.changed) i++
      segments.push({ type: 'rows', rows: rows.slice(start, i) })
    } else {
      const start = i
      while (i < rows.length && !rows[i]!.changed) i++
      segments.push({ type: 'gap', id: `gap-${start}`, rows: rows.slice(start, i) })
    }
  }
  return segments
}

function ValueCell({ text, tone }: { text: string; tone?: 'old' | 'new' | null }) {
  return (
    <td
      className={cn(
        'px-3 py-1.5 font-mono text-xs break-all align-top w-2/5',
        tone === 'old' && 'bg-red-50 dark:bg-red-950/30',
        tone === 'new' && 'bg-green-50 dark:bg-green-950/30',
      )}
    >
      {text}
    </td>
  )
}

export function AuditDiffViewer({ entry }: AuditDiffViewerProps) {
  const rows = useMemo(() => buildRows(entry), [entry])
  const segments = useMemo(() => buildSegments(rows), [rows])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (rows.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground italic">
        No value data recorded for this entry.
      </div>
    )
  }

  const created = !entry.oldValue
  const deleted = !entry.newValue
  const changedCount = rows.filter((r) => r.changed).length

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {created
            ? 'Record created'
            : deleted
              ? 'Record deleted'
              : `${changedCount} changed field${changedCount === 1 ? '' : 's'}`}
        </span>
      </div>
      {/* One shared scroll container so the old/new columns stay aligned and
          scroll together (no independent left/right scrolling). */}
      <div className="rounded-md border overflow-auto max-h-96">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Field
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Old Value
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                New Value
              </th>
            </tr>
          </thead>
          <tbody>
            {segments.map((seg) => {
              if (seg.type === 'rows') {
                return seg.rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-xs font-medium text-muted-foreground align-top break-all">
                      {r.key}
                    </td>
                    <ValueCell text={r.oldText} tone={r.changed ? 'old' : null} />
                    <ValueCell text={r.newText} tone={r.changed ? 'new' : null} />
                  </tr>
                ))
              }
              const isOpen = expanded.has(seg.id)
              return (
                <Fragment key={seg.id}>
                  <tr className="border-b last:border-b-0 bg-muted/20">
                    <td colSpan={3} className="p-0">
                      <button
                        type="button"
                        onClick={() => toggle(seg.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      >
                        <ChevronsUpDown className="h-3 w-3" aria-hidden="true" />
                        {isOpen
                          ? `Hide ${seg.rows.length} unchanged field${seg.rows.length === 1 ? '' : 's'}`
                          : `Show ${seg.rows.length} unchanged field${seg.rows.length === 1 ? '' : 's'}`}
                      </button>
                    </td>
                  </tr>
                  {isOpen &&
                    seg.rows.map((r) => (
                      <tr key={r.key} className="border-b last:border-b-0">
                        <td className="px-3 py-1.5 font-mono text-xs font-medium text-muted-foreground align-top break-all">
                          {r.key}
                        </td>
                        <ValueCell text={r.oldText} tone={null} />
                        <ValueCell text={r.newText} tone={null} />
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
