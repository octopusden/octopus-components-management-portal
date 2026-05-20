import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Button } from './ui/button'
import { FilterBar } from './ui/filter-bar'
import { Switch } from './ui/switch'
import { Label } from './ui/label'
import type { ComponentFilter } from '../lib/types'
import { useOwners } from '../hooks/useOwners'
import { useLabels } from '../hooks/useLabels'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useFieldOptions } from '../hooks/useFieldOptions'
import { useFieldConfigEntry } from '../hooks/useFieldConfig'
import { MultiSelectFilter } from './ui/MultiSelectFilter'

interface ComponentFiltersProps {
  filter: ComponentFilter
  onFilterChange: (filter: ComponentFilter) => void
}

// Hardcoded system enum — can be extended later from API.
const SYSTEM_OPTIONS = [
  'ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO',
]

const ALL_VALUE = '__all__'

export function ComponentFilters({ filter, onFilterChange }: ComponentFiltersProps) {
  const [searchValue, setSearchValue] = useState(filter.search ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external filter.search into local state when it changes from outside
  useEffect(() => {
    setSearchValue(filter.search ?? '')
  }, [filter.search])

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFilterChange({ ...filter, search: value || undefined })
    }, 300)
  }

  const handleSystemChange = (value: string) => {
    onFilterChange({ ...filter, system: value === ALL_VALUE ? undefined : value })
  }

  const handleOwnerChange = (value: string) => {
    onFilterChange({ ...filter, owner: value === ALL_VALUE ? undefined : value })
  }

  const handleBuildSystemChange = (next: string[]) => {
    onFilterChange({ ...filter, buildSystem: next.length ? next : undefined })
  }

  const handleLabelsChange = (next: string[]) => {
    onFilterChange({ ...filter, labels: next.length ? next : undefined })
  }

  // Archived filter: 2-state cycle — false (active only, default) ↔ undefined (all)
  const handleArchivedToggle = () => {
    if (filter.archived === false) {
      onFilterChange({ ...filter, archived: undefined })
    } else {
      onFilterChange({ ...filter, archived: false })
    }
  }

  const handleClearAll = () => {
    setSearchValue('')
    // Reset to default: archived: false (active only)
    onFilterChange({ archived: false })
  }

  // archived: false is the default — does not count as an active filter
  const hasActiveFilters =
    !!filter.search ||
    !!filter.system ||
    !!filter.owner ||
    !!filter.buildSystem?.length ||
    !!filter.labels?.length ||
    filter.archived === undefined

  // Owner list comes from /components/meta/owners (B7.1.1, SYS-035 backend).
  // Cached for 5 minutes by useOwners; the list is small so we render every
  // value flat — no virtualization, no search-as-you-type. If/when the list
  // grows beyond a few hundred we can switch to a typeahead picker matching
  // PeopleInput's pattern.
  const { data: owners = [] } = useOwners()
  // Build system options: admin field-config first, with a fallback to the
  // CRS enum at /components/meta/build-systems so the dropdown is useful
  // out of the box even when admin has not seeded explicit options.
  const { options: buildSystemOptions, isLoading: buildSystemLoading } =
    useFieldOptions('buildSystem')
  // Visibility gate for admin-config-driven filters. We only honour
  // visibility on filters whose options come from admin field-config
  // (currently buildSystem); System / Owner use a hardcoded enum and
  // /meta/owners respectively, so they ignore this signal.
  const { entry: buildSystemEntry } = useFieldConfigEntry('buildSystem')
  // Sticky activation flags for the two multi-select pickers — flip
  // true on first open and never back. Drive `enabled` on useLabels so
  // the labels meta request only fires when the user expresses intent
  // (avoids a page-mount 404 against a CRS that may not ship /meta/labels
  // yet). useFieldOptions is cheap + cached, so we don't gate it.
  const [labelsActivated, setLabelsActivated] = useState(false)
  const { data: labelOptions = [], isLoading: labelsLoading } = useLabels({
    enabled: labelsActivated,
  })
  const { data: currentUser } = useCurrentUser()

  // My Components: when checked, owner is pinned to the current user
  const myComponentsChecked = !!currentUser && filter.owner === currentUser.username
  const handleMyComponentsChange = (checked: boolean) => {
    if (checked && currentUser) {
      onFilterChange({ ...filter, owner: currentUser.username })
    } else {
      onFilterChange({ ...filter, owner: undefined })
    }
  }

  const archivedLabel =
    filter.archived === false
      ? 'Show archived components'
      : 'Hide archived components'

  return (
    <FilterBar>
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search components..."
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={filter.system ?? ALL_VALUE} onValueChange={handleSystemChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All systems" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All systems</SelectItem>
          {SYSTEM_OPTIONS.map((sys) => (
            <SelectItem key={sys} value={sys}>
              {sys}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {buildSystemEntry.visibility !== 'hidden' && (
        <MultiSelectFilter
          value={filter.buildSystem ?? []}
          onChange={handleBuildSystemChange}
          options={buildSystemOptions}
          isLoading={buildSystemLoading}
          placeholder="All build systems"
          unitLabel="build system"
        />
      )}

      <MultiSelectFilter
        value={filter.labels ?? []}
        onChange={handleLabelsChange}
        options={labelOptions}
        isLoading={labelsLoading}
        placeholder="All labels"
        unitLabel="label"
        onOpenChange={(open) => {
          if (open) setLabelsActivated(true)
        }}
      />

      <Select
        value={filter.owner ?? ALL_VALUE}
        onValueChange={handleOwnerChange}
        disabled={myComponentsChecked}
      >
        <SelectTrigger className="w-[180px]" aria-label="Owner">
          <SelectValue placeholder="All owners" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All owners</SelectItem>
          {owners.map((owner) => (
            <SelectItem key={owner} value={owner}>
              {owner}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Switch
          id="my-components"
          checked={myComponentsChecked}
          onCheckedChange={handleMyComponentsChange}
          disabled={!currentUser}
          aria-label="My Components"
        />
        <Label htmlFor="my-components" className="cursor-pointer text-sm">
          My Components
        </Label>
      </div>

      <Button variant="outline" size="sm" onClick={handleArchivedToggle}>
        {archivedLabel}
      </Button>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearAll}>
          Clear filters
        </Button>
      )}
    </FilterBar>
  )
}
