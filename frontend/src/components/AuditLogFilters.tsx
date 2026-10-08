import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Check, Funnel } from 'lucide-react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { AddFilterMenu, type AddFilterItem } from './ui/AddFilterMenu'
import { FilterChips, type FilterChip } from './ui/FilterChips'
import { cn } from '../lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { FilterBar } from './ui/filter-bar'

/**
 * Filter shape consumed by AuditLogPage. Each field is independently
 * optional; combinations are ANDed server-side per CRS SYS-036.
 *
 * `from` / `to` are ISO-8601 instants (the wire shape CRS expects via
 * `@DateTimeFormat(iso = ISO.DATE_TIME)`); the picker accepts browser
 * `datetime-local` strings and we convert here so callers don't have to
 * worry about the user's timezone.
 */
export interface AuditFilter {
  entityType?: string
  changedBy?: string
  source?: string
  action?: string
  from?: string
  to?: string
  /**
   * Surface git-history baseline rows (`action = MIGRATED`), hidden by CRS by
   * default (SYS-049). Backs the "Show migration" toggle. Omitted unless on.
   */
  includeMigrated?: boolean
  /** Case-insensitive substring match on the change-metadata Jira task key. */
  jiraTaskKey?: string
  /** Case-insensitive substring match on the change-metadata comment. */
  changeComment?: string
}

interface AuditLogFiltersProps {
  filter: AuditFilter
  onChange: (filter: AuditFilter) => void
}

const ALL_VALUE = '__all__'

const ENTITY_TYPE_OPTIONS = ['Component'] as const
const SOURCE_OPTIONS = ['api', 'git-history'] as const
const ACTION_OPTIONS = ['CREATE', 'UPDATE', 'DELETE', 'RENAME', 'MIGRATED'] as const

/**
 * Convert a browser `datetime-local` string ("YYYY-MM-DDTHH:mm") into a
 * UTC ISO instant. The Date constructor parses datetime-local as the
 * user's local time; toISOString then renders UTC with a "Z" suffix —
 * the same shape Spring's @DateTimeFormat(ISO.DATE_TIME) parses.
 */
function localToInstant(local: string): string | undefined {
  if (!local) return undefined
  const date = new Date(local)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

/**
 * Convert an ISO instant back to the local datetime-local input shape so
 * the picker reflects an externally-controlled filter value (e.g. from
 * URL state, on next iterations).
 */
function instantToLocal(instant: string | undefined): string {
  if (!instant) return ''
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return ''
  // datetime-local wants YYYY-MM-DDTHH:mm in local time; trim seconds.
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

export function AuditLogFilters({ filter, onChange }: AuditLogFiltersProps) {
  const [changedByLocal, setChangedByLocal] = useState(filter.changedBy ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [jiraTaskKeyLocal, setJiraTaskKeyLocal] = useState(filter.jiraTaskKey ?? '')
  const jiraDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [changeCommentLocal, setChangeCommentLocal] = useState(filter.changeComment ?? '')
  const commentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced handlers fire ~300ms later, by which point the user may have
  // changed another filter (Action/Source/…). Merge against the LATEST filter
  // via this ref, not the value closed over at keystroke time, so a delayed
  // text update can't clobber a newer selection.
  const filterRef = useRef(filter)
  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  // Cancel any pending text debounces on unmount so a late timer can't call
  // onChange into an unmounted parent.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current)
      if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current)
    },
    [],
  )

  useEffect(() => {
    setChangedByLocal(filter.changedBy ?? '')
  }, [filter.changedBy])

  useEffect(() => {
    setJiraTaskKeyLocal(filter.jiraTaskKey ?? '')
  }, [filter.jiraTaskKey])

  useEffect(() => {
    setChangeCommentLocal(filter.changeComment ?? '')
  }, [filter.changeComment])

  const handleChangedBy = (value: string) => {
    setChangedByLocal(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ ...filterRef.current, changedBy: value || undefined })
    }, 300)
  }

  const handleJiraTaskKey = (value: string) => {
    setJiraTaskKeyLocal(value)
    if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current)
    jiraDebounceRef.current = setTimeout(() => {
      onChange({ ...filterRef.current, jiraTaskKey: value.trim() || undefined })
    }, 300)
  }

  const handleChangeComment = (value: string) => {
    setChangeCommentLocal(value)
    if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current)
    commentDebounceRef.current = setTimeout(() => {
      onChange({ ...filterRef.current, changeComment: value.trim() || undefined })
    }, 300)
  }

  const cancelTextDebounces = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current)
    if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current)
  }

  const patch = (next: Partial<AuditFilter>) => onChange({ ...filter, ...next })

  const handleClear = () => {
    // Cancel pending text debounces first — otherwise a timer queued just before
    // Clear would fire afterwards and resurrect the stale value over the cleared filter.
    cancelTextDebounces()
    setChangedByLocal('')
    setJiraTaskKeyLocal('')
    setChangeCommentLocal('')
    onChange({})
  }

  const chips = describeAuditChips(filter)
  const removeChip = (chip: AuditChip) => {
    // A text chip may still have its debounce pending; drop it so the value can't come back.
    if (chip.id === 'changedBy') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setChangedByLocal('')
    }
    if (chip.id === 'jiraTaskKey') {
      if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current)
      setJiraTaskKeyLocal('')
    }
    if (chip.id === 'changeComment') {
      if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current)
      setChangeCommentLocal('')
    }
    onChange({ ...filter, ...chip.cleared })
  }

  // Secondary dimensions live in "+ Filter"; their editors are rendered here so the text state
  // and its debounce outlive the panel (which unmounts its content on close).
  const extraItems: AddFilterItem[] = [
    {
      id: 'source',
      label: 'Source',
      group: 'Change',
      summary: filter.source,
      editor: (
        <OptionList
          label="Source"
          allLabel="All sources"
          options={SOURCE_OPTIONS}
          value={filter.source}
          onChange={(source) => patch({ source })}
        />
      ),
    },
    {
      id: 'entityType',
      label: 'Entity type',
      group: 'Change',
      summary: filter.entityType,
      editor: (
        <OptionList
          label="Entity Type"
          allLabel="All types"
          options={ENTITY_TYPE_OPTIONS}
          value={filter.entityType}
          onChange={(entityType) => patch({ entityType })}
        />
      ),
    },
    {
      id: 'jiraTaskKey',
      label: 'Jira task key',
      group: 'Change metadata',
      summary: filter.jiraTaskKey,
      editor: (
        <Input
          aria-label="Jira task key"
          placeholder="ABC-123"
          autoFocus
          value={jiraTaskKeyLocal}
          onChange={(e) => handleJiraTaskKey(e.target.value)}
          className="w-56"
        />
      ),
    },
    {
      id: 'changeComment',
      label: 'Comment',
      group: 'Change metadata',
      summary: filter.changeComment,
      editor: (
        <Input
          aria-label="Comment"
          placeholder="Text in the change comment"
          autoFocus
          value={changeCommentLocal}
          onChange={(e) => handleChangeComment(e.target.value)}
          className="w-56"
        />
      ),
    },
  ]

  return (
    <div className="space-y-2">
      <FilterBar>
        <div className="relative w-56">
          <Funnel aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Changed by"
            placeholder="Changed by…"
            value={changedByLocal}
            onChange={(e) => handleChangedBy(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filter.action ?? ALL_VALUE} onValueChange={(v) => patch({ action: v === ALL_VALUE ? undefined : v })}>
          <SelectTrigger aria-label="Action" className="w-auto min-w-32 gap-2">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All actions</SelectItem>
            {ACTION_OPTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <PeriodFilter filter={filter} onChange={patch} />

        <AddFilterMenu items={extraItems} groups={EXTRA_GROUPS} activeCount={extraItems.filter((d) => d.summary).length} />

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Switch
            aria-label="Show migration"
            checked={!!filter.includeMigrated}
            onCheckedChange={(checked) => patch({ includeMigrated: checked || undefined })}
          />
          Show migration
        </label>
      </FilterBar>
      <FilterChips chips={chips} onRemove={removeChip} onClearAll={handleClear} />
    </div>
  )
}

const EXTRA_GROUPS = ['Change', 'Change metadata'] as const

interface AuditChip extends FilterChip {
  /** Filter patch that removes this chip's filter. */
  cleared: Partial<AuditFilter>
}

/** Active-filter chips. "Show migration" has none: its switch stays visible in the bar. */
function describeAuditChips(filter: AuditFilter): AuditChip[] {
  const chips: AuditChip[] = []
  if (filter.changedBy) chips.push({ id: 'changedBy', label: `Changed by: ${filter.changedBy}`, cleared: { changedBy: undefined } })
  if (filter.action) chips.push({ id: 'action', label: `Action: ${filter.action}`, cleared: { action: undefined } })
  const period = periodLabel(filter)
  if (period) chips.push({ id: 'period', label: period, cleared: { from: undefined, to: undefined } })
  if (filter.source) chips.push({ id: 'source', label: `Source: ${filter.source}`, cleared: { source: undefined } })
  if (filter.entityType) chips.push({ id: 'entityType', label: `Entity: ${filter.entityType}`, cleared: { entityType: undefined } })
  if (filter.jiraTaskKey) chips.push({ id: 'jiraTaskKey', label: `Jira: ${filter.jiraTaskKey}`, cleared: { jiraTaskKey: undefined } })
  if (filter.changeComment)
    chips.push({ id: 'changeComment', label: `Comment: \u201c${filter.changeComment}\u201d`, cleared: { changeComment: undefined } })
  return chips
}

function formatInstant(instant: string | undefined): string | undefined {
  if (!instant) return undefined
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "Since …" / "Until …" / "… – …"; undefined when no (valid) bound is set. */
function periodLabel(filter: AuditFilter): string | undefined {
  const from = formatInstant(filter.from)
  const to = formatInstant(filter.to)
  if (from && to) return `${from} \u2013 ${to}`
  if (from) return `Since ${from}`
  if (to) return `Until ${to}`
  return undefined
}

const PERIOD_PRESETS = [
  { label: 'Last 24 hours', ms: 24 * 3600_000 },
  { label: 'Last 7 days', ms: 7 * 24 * 3600_000 },
  { label: 'Last 30 days', ms: 30 * 24 * 3600_000 },
] as const

/**
 * One "When" control instead of two always-visible datetime pickers: a trigger naming the
 * current period, opening quick presets plus the From / To inputs.
 */
function PeriodFilter({ filter, onChange }: { filter: AuditFilter; onChange: (next: Partial<AuditFilter>) => void }) {
  const label = periodLabel(filter)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Period" className={cn('h-9 gap-2 font-normal', !label && 'text-muted-foreground')}>
          <CalendarClock className="h-4 w-4" />
          {label ?? 'Any time'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto space-y-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange({ from: new Date(Date.now() - p.ms).toISOString(), to: undefined })}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2">
          <Label htmlFor="audit-filter-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="audit-filter-from"
            type="datetime-local"
            value={instantToLocal(filter.from)}
            onChange={(e) => onChange({ from: localToInstant(e.target.value) })}
            className="w-[230px]"
          />
          <Label htmlFor="audit-filter-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="audit-filter-to"
            type="datetime-local"
            value={instantToLocal(filter.to)}
            onChange={(e) => onChange({ to: localToInstant(e.target.value) })}
            className="w-[230px]"
          />
        </div>
        {label && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange({ from: undefined, to: undefined })}>
            Any time
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Single-choice list for the "+ Filter" panel (no nested Select popover inside the panel). */
function OptionList({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string
  allLabel: string
  options: readonly string[]
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const items: { key: string; text: string; v: string | undefined }[] = [
    { key: ALL_VALUE, text: allLabel, v: undefined },
    ...options.map((o) => ({ key: o, text: o, v: o })),
  ]
  return (
    <div role="radiogroup" aria-label={label} className="min-w-48">
      {items.map((it) => {
        const checked = value === it.v
        return (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(it.v)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Check className={cn('h-3.5 w-3.5', !checked && 'invisible')} />
            {it.text}
          </button>
        )
      })}
    </div>
  )
}
