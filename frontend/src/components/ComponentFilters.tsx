import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from './ui/input'
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

  const handleSystemChange = (next: string[]) => {
    onFilterChange({ ...filter, system: next.length ? next : undefined })
  }

  const handleOwnerChange = (next: string[]) => {
    onFilterChange({ ...filter, owner: next.length ? next : undefined })
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
    !!filter.system?.length ||
    !!filter.owner?.length ||
    !!filter.buildSystem?.length ||
    !!filter.labels?.length ||
    filter.archived === undefined

  // Owner list comes from /components/meta/owners (B7.1.1, SYS-035 backend).
  // Cached for 5 minutes by useOwners; the list is small so we render every
  // value flat — no virtualization, no search-as-you-type. If/when the list
  // grows beyond a few hundred we can switch to a typeahead picker matching
  // PeopleInput's pattern.
  const { data: owners = [], isLoading: ownersLoading } = useOwners()
  // Build system options: admin field-config first, with a fallback to the
  // CRS enum at /components/meta/build-systems so the dropdown is useful
  // out of the box even when admin has not seeded explicit options.
  const { options: buildSystemOptions, isLoading: buildSystemLoading } =
    useFieldOptions('buildSystem')
  // Filterable gate for admin-config-driven filters. visibility is
  // form-level (editable/readonly/hidden); filterable controls list-page
  // filter bar inclusion — admins may want one without the other. Both
  // System and Build System honour filterable (their options come from
  // admin field-config with a CRS meta endpoint fallback); Owner uses
  // /meta/owners which is not admin-configurable so it ignores the signal.
  const { entry: buildSystemEntry } = useFieldConfigEntry('buildSystem')
  // System options share the buildSystem pattern: admin field-config first,
  // CRS /components/meta/systems fallback. The field-config path is
  // `component.system` (sectioned, singular per CRS PR #301) to match
  // GeneralTab.tsx and ComponentDetailPage.tsx — using a different path
  // here would silently diverge from the editor surface when admins edit
  // field-config. The FILTER PARAMETER stays multi-value (?system=A,B
  // OR-semantic) even though each component's `system` is now scalar.
  // Gated on `systemActivated` until first popover open because the meta
  // endpoint may not exist on older CRS images and Playwright's
  // console-error listener trips on the browser's native 404 log.
  const [systemActivated, setSystemActivated] = useState(false)
  const { options: systemOptions, isLoading: systemLoading } = useFieldOptions(
    'component.system',
    { enabled: systemActivated },
  )
  const { entry: systemEntry } = useFieldConfigEntry('component.system')
  // Sticky activation flag for the labels picker — flips true on first
  // open and never back. Drives `enabled` on useLabels so the labels
  // meta request only fires when the user expresses intent (avoids a
  // page-mount 404 against a CRS that may not ship /meta/labels yet).
  const [labelsActivated, setLabelsActivated] = useState(false)
  const { data: labelOptions = [], isLoading: labelsLoading } = useLabels({
    enabled: labelsActivated,
  })
  const { data: currentUser } = useCurrentUser()

  // My Components: when checked, owner is pinned to a single-element array
  // [currentUser.username]. The switch stays mutually exclusive with the
  // owner picker — checked only when the owner array has exactly one entry
  // and it matches the current user.
  const myComponentsChecked =
    !!currentUser &&
    filter.owner?.length === 1 &&
    filter.owner[0] === currentUser.username
  const handleMyComponentsChange = (checked: boolean) => {
    if (checked && currentUser) {
      onFilterChange({ ...filter, owner: [currentUser.username] })
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

      {systemEntry.filterable !== false && (
        <MultiSelectFilter
          value={filter.system ?? []}
          onChange={handleSystemChange}
          options={systemOptions}
          isLoading={systemLoading}
          placeholder="All systems"
          unitLabel="system"
          onOpenChange={(open) => {
            if (open) setSystemActivated(true)
          }}
        />
      )}

      {buildSystemEntry.filterable !== false && (
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

      <MultiSelectFilter
        value={filter.owner ?? []}
        onChange={handleOwnerChange}
        options={owners}
        isLoading={ownersLoading}
        placeholder="All owners"
        unitLabel="owner"
        disabled={myComponentsChecked}
      />

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
