import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
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
import {
  useFieldConfigEntry,
  searchabilityFor,
  type Searchable,
  type FieldConfigEntry,
} from '../hooks/useFieldConfig'
import { MultiSelectFilter } from './ui/MultiSelectFilter'

interface ComponentFiltersProps {
  filter: ComponentFilter
  onFilterChange: (filter: ComponentFilter) => void
}

// Debounced free-text filter. Mirrors the main search box's 300ms debounce so
// typing in an extended text filter doesn't fire a request per keystroke.
function TextFilter({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => setLocal(value), [value])
  // Cancel a pending debounce if the control unmounts (e.g. the panel closes
  // or an admin flips the field to searchable: None) so the timer can't fire
  // onCommit against a stale closure after unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        className="h-9 w-44"
        value={local}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => {
          const next = e.target.value
          setLocal(next)
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => onCommit(next), 300)
        }}
      />
    </div>
  )
}

// Tri-state boolean filter (Any / Yes / No) → undefined / true / false.
function TriStateFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | undefined
  onChange: (v: boolean | undefined) => void
}) {
  const str = value === undefined ? '' : value ? 'true' : 'false'
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        aria-label={label}
        className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        value={str}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? undefined : v === 'true')
        }}
      >
        <option value="">Any</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>
  )
}

export function ComponentFilters({ filter, onFilterChange }: ComponentFiltersProps) {
  const [searchValue, setSearchValue] = useState(filter.search ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Extended-search mode (item 5): a toggle that reveals the Extended-placed
  // filter controls. Auto-opens if an extended filter is already active so a
  // shared/bookmarked URL doesn't hide its own active filters.
  const extendedActive =
    !!filter.clientCode ||
    filter.solution !== undefined ||
    !!filter.jiraProjectKey ||
    filter.jiraTechnical !== undefined ||
    !!filter.vcsPath ||
    !!filter.productionBranch ||
    !!filter.parentComponentName ||
    filter.canBeParent !== undefined ||
    !!filter.groupKey
  const [extendedOpen, setExtendedOpen] = useState(extendedActive)

  // Sync external filter.search into local state when it changes from outside
  useEffect(() => {
    setSearchValue(filter.search ?? '')
  }, [filter.search])

  // Open the panel (one-way) whenever an extended filter becomes active from
  // outside — e.g. a future URL-synced filter prop arriving after mount. Never
  // auto-closes, so it won't fight the user's explicit toggle.
  useEffect(() => {
    if (extendedActive) setExtendedOpen(true)
  }, [extendedActive])

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
    // Reset to default: archived: false (active only). Extended filters cleared too.
    onFilterChange({ archived: false })
  }

  // archived: false is the default — does not count as an active filter
  const hasActiveFilters =
    !!filter.search ||
    !!filter.system?.length ||
    !!filter.owner?.length ||
    !!filter.buildSystem?.length ||
    !!filter.labels?.length ||
    filter.archived === undefined ||
    extendedActive

  const { data: owners = [], isLoading: ownersLoading } = useOwners()
  const { options: buildSystemOptions, isLoading: buildSystemLoading } =
    useFieldOptions('buildSystem')
  const { entry: buildSystemEntry } = useFieldConfigEntry('buildSystem')
  const [systemActivated, setSystemActivated] = useState(false)
  const { options: systemOptions, isLoading: systemLoading } = useFieldOptions(
    'component.system',
    { enabled: systemActivated },
  )
  const { entry: systemEntry } = useFieldConfigEntry('component.system')
  const [labelsActivated, setLabelsActivated] = useState(false)
  const { data: labelOptions = [], isLoading: labelsLoading } = useLabels({
    enabled: labelsActivated,
  })
  const { data: currentUser } = useCurrentUser()

  // Field-config entries for the extended filters — `searchabilityFor` resolves
  // the effective placement (Main / Extended / None) per field, falling back to
  // DEFAULT_SEARCHABILITY when no admin entry exists.
  const { entry: clientCodeEntry } = useFieldConfigEntry('component.clientCode')
  const { entry: solutionEntry } = useFieldConfigEntry('component.solution')
  const { entry: jiraProjectKeyEntry } = useFieldConfigEntry('jira.projectKey')
  const { entry: jiraTechnicalEntry } = useFieldConfigEntry('jira.technical')
  const { entry: vcsPathEntry } = useFieldConfigEntry('vcs.vcsPath')
  const { entry: productionBranchEntry } = useFieldConfigEntry('vcs.branch')
  const { entry: parentEntry } = useFieldConfigEntry('component.parentComponentName')
  const { entry: canBeParentEntry } = useFieldConfigEntry('component.canBeParent')
  const { entry: groupKeyEntry } = useFieldConfigEntry('component.groupKey')

  // A field's effective search placement; `'None'` hides the control entirely.
  const place = (path: string, entry: FieldConfigEntry): Searchable =>
    searchabilityFor(path, entry)
  const systemPlace = place('component.system', systemEntry)
  const buildSystemPlace = place('buildSystem', buildSystemEntry)

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
    filter.archived === false ? 'Show archived components' : 'Hide archived components'

  // Each extended control is defined once and placed by its searchability:
  // 'None' → never rendered; 'Extended' → rendered in the toggle-gated row;
  // 'Main' → rendered in the always-visible top bar (an admin-promoted field
  // surfaces without opening the panel, matching the Main/Extended/None spec).
  const extendedControls: { place: Searchable; node: ReactNode }[] = [
    {
      place: place('component.clientCode', clientCodeEntry),
      node: (
        <TextFilter
          key="clientCode"
          label="Client code"
          value={filter.clientCode ?? ''}
          onCommit={(v) => onFilterChange({ ...filter, clientCode: v || undefined })}
        />
      ),
    },
    {
      place: place('jira.projectKey', jiraProjectKeyEntry),
      node: (
        <TextFilter
          key="jiraProjectKey"
          label="Jira project key"
          value={filter.jiraProjectKey ?? ''}
          onCommit={(v) => onFilterChange({ ...filter, jiraProjectKey: v || undefined })}
        />
      ),
    },
    {
      place: place('vcs.vcsPath', vcsPathEntry),
      node: (
        <TextFilter
          key="vcsPath"
          label="VCS path"
          value={filter.vcsPath ?? ''}
          onCommit={(v) => onFilterChange({ ...filter, vcsPath: v || undefined })}
        />
      ),
    },
    {
      place: place('vcs.branch', productionBranchEntry),
      node: (
        <TextFilter
          key="productionBranch"
          label="Production branch"
          value={filter.productionBranch ?? ''}
          onCommit={(v) => onFilterChange({ ...filter, productionBranch: v || undefined })}
        />
      ),
    },
    {
      place: place('component.parentComponentName', parentEntry),
      node: (
        <TextFilter
          key="parentComponentName"
          label="Parent component"
          value={filter.parentComponentName ?? ''}
          onCommit={(v) => onFilterChange({ ...filter, parentComponentName: v || undefined })}
        />
      ),
    },
    {
      place: place('component.groupKey', groupKeyEntry),
      node: (
        <TextFilter
          key="groupKey"
          label="Group key"
          value={filter.groupKey ?? ''}
          onCommit={(v) => onFilterChange({ ...filter, groupKey: v || undefined })}
        />
      ),
    },
    {
      place: place('component.solution', solutionEntry),
      node: (
        <TriStateFilter
          key="solution"
          label="Solution"
          value={filter.solution}
          onChange={(v) => onFilterChange({ ...filter, solution: v })}
        />
      ),
    },
    {
      place: place('jira.technical', jiraTechnicalEntry),
      node: (
        <TriStateFilter
          key="jiraTechnical"
          label="Jira technical"
          value={filter.jiraTechnical}
          onChange={(v) => onFilterChange({ ...filter, jiraTechnical: v })}
        />
      ),
    },
    {
      place: place('component.canBeParent', canBeParentEntry),
      node: (
        <TriStateFilter
          key="canBeParent"
          label="Can be parent"
          value={filter.canBeParent}
          onChange={(v) => onFilterChange({ ...filter, canBeParent: v })}
        />
      ),
    },
  ]
  // Main-placed controls live in the always-visible top bar; Extended-placed
  // controls live in the toggle-gated row. 'None' is dropped entirely.
  const mainExtended = extendedControls.filter((c) => c.place === 'Main')
  const rowExtended = extendedControls.filter((c) => c.place === 'Extended')

  return (
    <div className="space-y-2">
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

        {systemPlace !== 'None' && (
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

        {buildSystemPlace !== 'None' && (
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

        {/* Admin-promoted (searchable: Main) extended filters — always visible. */}
        {mainExtended.map((c) => c.node)}

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

        {rowExtended.length > 0 && (
          <Button
            variant={extendedOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setExtendedOpen((o) => !o)}
            aria-expanded={extendedOpen}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Extended search
          </Button>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearAll}>
            Clear filters
          </Button>
        )}
      </FilterBar>

      {extendedOpen && rowExtended.length > 0 && (
        <FilterBar>
          {rowExtended.map((c) => c.node)}
        </FilterBar>
      )}
    </div>
  )
}
