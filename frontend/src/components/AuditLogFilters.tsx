import { useEffect, useRef, useState } from 'react'
import { Input } from './ui/input'
import { Label } from './ui/label'
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
      onChange({ ...filter, changedBy: value || undefined })
    }, 300)
  }

  const handleJiraTaskKey = (value: string) => {
    setJiraTaskKeyLocal(value)
    if (jiraDebounceRef.current) clearTimeout(jiraDebounceRef.current)
    jiraDebounceRef.current = setTimeout(() => {
      onChange({ ...filter, jiraTaskKey: value.trim() || undefined })
    }, 300)
  }

  const handleChangeComment = (value: string) => {
    setChangeCommentLocal(value)
    if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current)
    commentDebounceRef.current = setTimeout(() => {
      onChange({ ...filter, changeComment: value.trim() || undefined })
    }, 300)
  }

  const handleEntityType = (value: string) => {
    onChange({ ...filter, entityType: value === ALL_VALUE ? undefined : value })
  }

  const handleSource = (value: string) => {
    onChange({ ...filter, source: value === ALL_VALUE ? undefined : value })
  }

  const handleAction = (value: string) => {
    onChange({ ...filter, action: value === ALL_VALUE ? undefined : value })
  }

  const handleFrom = (value: string) => {
    onChange({ ...filter, from: localToInstant(value) })
  }

  const handleTo = (value: string) => {
    onChange({ ...filter, to: localToInstant(value) })
  }

  const handleIncludeMigrated = (checked: boolean) => {
    onChange({ ...filter, includeMigrated: checked || undefined })
  }

  const handleClear = () => {
    setChangedByLocal('')
    setJiraTaskKeyLocal('')
    setChangeCommentLocal('')
    onChange({})
  }

  const hasActiveFilters =
    !!filter.entityType ||
    !!filter.changedBy ||
    !!filter.source ||
    !!filter.action ||
    !!filter.from ||
    !!filter.to ||
    !!filter.includeMigrated ||
    !!filter.jiraTaskKey ||
    !!filter.changeComment

  return (
    <FilterBar withLabels>
      <div className="space-y-1.5">
        <Label htmlFor="audit-filter-entityType">Entity Type</Label>
        <Select value={filter.entityType ?? ALL_VALUE} onValueChange={handleEntityType}>
          <SelectTrigger id="audit-filter-entityType" aria-label="Entity Type" className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All types</SelectItem>
            {ENTITY_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-filter-changedBy">Changed by</Label>
        <Input
          id="audit-filter-changedBy"
          placeholder="username"
          value={changedByLocal}
          onChange={(e) => handleChangedBy(e.target.value)}
          className="w-[180px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-filter-jiraTaskKey">Jira task key</Label>
        <Input
          id="audit-filter-jiraTaskKey"
          placeholder="ABC-123"
          value={jiraTaskKeyLocal}
          onChange={(e) => handleJiraTaskKey(e.target.value)}
          className="w-[160px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-filter-changeComment">Comment</Label>
        <Input
          id="audit-filter-changeComment"
          placeholder="search text"
          value={changeCommentLocal}
          onChange={(e) => handleChangeComment(e.target.value)}
          className="w-[180px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-filter-source">Source</Label>
        <Select value={filter.source ?? ALL_VALUE} onValueChange={handleSource}>
          <SelectTrigger id="audit-filter-source" aria-label="Source" className="w-[160px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All sources</SelectItem>
            {SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-filter-action">Action</Label>
        <Select value={filter.action ?? ALL_VALUE} onValueChange={handleAction}>
          <SelectTrigger id="audit-filter-action" aria-label="Action" className="w-[160px]">
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
      </div>

      {/*
        From/To kept together as a single flex item so the range stays on one
        line (the surrounding FilterBar wraps the pair as a unit, never between
        them). Inputs are widened past the prior 200px so the native picker's
        calendar indicator isn't clipped by the long "dd/mm/yyyy, --:-- --"
        datetime-local mask.
      */}
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="audit-filter-from">From</Label>
          <Input
            id="audit-filter-from"
            type="datetime-local"
            value={instantToLocal(filter.from)}
            onChange={(e) => handleFrom(e.target.value)}
            className="w-[230px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audit-filter-to">To</Label>
          <Input
            id="audit-filter-to"
            type="datetime-local"
            value={instantToLocal(filter.to)}
            onChange={(e) => handleTo(e.target.value)}
            className="w-[230px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="audit-filter-include-migrated">Show migration</Label>
        <div className="flex h-9 items-center">
          <Switch
            id="audit-filter-include-migrated"
            aria-label="Show migration"
            checked={!!filter.includeMigrated}
            onCheckedChange={handleIncludeMigrated}
          />
        </div>
      </div>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Clear filters
        </Button>
      )}
    </FilterBar>
  )
}
