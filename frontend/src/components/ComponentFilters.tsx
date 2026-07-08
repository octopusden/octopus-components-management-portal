import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { FilterBar } from './ui/filter-bar'
import { Label } from './ui/label'
import type { ComponentFilter } from '../lib/types'
import { cn } from '../lib/utils'
import { useOwners } from '../hooks/useOwners'
import { useLabels } from '../hooks/useLabels'
import { useClientCodes } from '../hooks/useClientCodes'
import { useJiraProjectKeys } from '../hooks/useJiraProjectKeys'
import { useParentComponentNames } from '../hooks/useParentComponentNames'
import { useGroupKeys } from '../hooks/useGroupKeys'
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
  /**
   * "Only with problems" mode (Validation Problems facility). This is NOT a CRS
   * query param — problems are computed in Portal — so it is tracked separately
   * from `ComponentFilter` and lifted to the page, which swaps the displayed
   * list to the validation report's problem-bearing set when on. The toggle UI
   * itself moved to the preset bar (spec §1.1/1.3); this prop only drives the
   * "filters don't apply" dimming + hint while problems-only is active.
   */
  problemsOnly?: boolean
  /**
   * Number of components with validation problems, shown beside the
   * problems-only hint (mirrors how a normal search shows its result count).
   * `undefined` while the report is still loading — the hint then renders
   * without a count.
   */
  problemsCount?: number
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

export function ComponentFilters({
  filter,
  onFilterChange,
  problemsOnly = false,
  problemsCount,
}: ComponentFiltersProps) {
  const [searchValue, setSearchValue] = useState(filter.search ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Extended-search mode (item 5): a toggle that reveals the Extended-placed
  // filter controls. Auto-opens if an extended filter is already active so a
  // shared/bookmarked URL doesn't hide its own active filters.
  const extendedActive =
    !!filter.clientCode?.length ||
    filter.solution !== undefined ||
    !!filter.jiraProjectKey?.length ||
    !!filter.javaVersion?.length ||
    filter.jiraTechnical !== undefined ||
    !!filter.vcsPath ||
    !!filter.productionBranch ||
    !!filter.parentComponentName?.length ||
    filter.canBeParent !== undefined ||
    !!filter.groupKey?.length ||
    filter.distributionExplicit !== undefined ||
    filter.distributionExternal !== undefined
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

  // Multi-value extended filters (SYS-046) — empty selection clears the field.
  const handleClientCodeChange = (next: string[]) => {
    onFilterChange({ ...filter, clientCode: next.length ? next : undefined })
  }

  const handleJiraProjectKeyChange = (next: string[]) => {
    onFilterChange({ ...filter, jiraProjectKey: next.length ? next : undefined })
  }

  const handleJavaVersionChange = (next: string[]) => {
    onFilterChange({ ...filter, javaVersion: next.length ? next : undefined })
  }

  const handleParentComponentNameChange = (next: string[]) => {
    onFilterChange({ ...filter, parentComponentName: next.length ? next : undefined })
  }

  const handleGroupKeyChange = (next: string[]) => {
    onFilterChange({ ...filter, groupKey: next.length ? next : undefined })
  }

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
  // Multi-value extended-filter dropdowns (SYS-046). Each is gated behind first
  // open (lazy) so a CRS that hasn't shipped the /meta/* endpoint yet doesn't
  // log a page-mount 404 (Playwright's console-error listener trips on it).
  const [clientCodesActivated, setClientCodesActivated] = useState(false)
  const { data: clientCodeOptions = [], isLoading: clientCodesLoading } = useClientCodes({
    enabled: clientCodesActivated,
  })
  const [jiraProjectKeysActivated, setJiraProjectKeysActivated] = useState(false)
  const { data: jiraProjectKeyOptions = [], isLoading: jiraProjectKeysLoading } = useJiraProjectKeys({
    enabled: jiraProjectKeysActivated,
  })
  const [javaVersionsActivated, setJavaVersionsActivated] = useState(false)
  const { options: javaVersionOptions, isLoading: javaVersionsLoading } = useFieldOptions(
    'build.javaVersion',
    { enabled: javaVersionsActivated },
  )
  const [parentNamesActivated, setParentNamesActivated] = useState(false)
  const { data: parentComponentNameOptions = [], isLoading: parentNamesLoading } = useParentComponentNames({
    enabled: parentNamesActivated,
  })
  const [groupKeysActivated, setGroupKeysActivated] = useState(false)
  const { data: groupKeyOptions = [], isLoading: groupKeysLoading } = useGroupKeys({
    enabled: groupKeysActivated,
  })

  // Field-config entries for the extended filters — `searchabilityFor` resolves
  // the effective placement (Main / Extended / None) per field, falling back to
  // DEFAULT_SEARCHABILITY when no admin entry exists.
  const { entry: clientCodeEntry } = useFieldConfigEntry('component.clientCode')
  const { entry: solutionEntry } = useFieldConfigEntry('component.solution')
  const { entry: jiraProjectKeyEntry } = useFieldConfigEntry('jira.projectKey')
  const { entry: javaVersionEntry } = useFieldConfigEntry('build.javaVersion')
  const { entry: jiraTechnicalEntry } = useFieldConfigEntry('jira.technical')
  const { entry: vcsPathEntry } = useFieldConfigEntry('vcs.vcsPath')
  const { entry: productionBranchEntry } = useFieldConfigEntry('vcs.branch')
  const { entry: parentEntry } = useFieldConfigEntry('component.parentComponentName')
  const { entry: canBeParentEntry } = useFieldConfigEntry('component.canBeParent')
  const { entry: groupKeyEntry } = useFieldConfigEntry('component.groupKey')
  const { entry: distributionExplicitEntry } = useFieldConfigEntry('component.distributionExplicit')
  const { entry: distributionExternalEntry } = useFieldConfigEntry('component.distributionExternal')
  // The classic multi-select filters are placed by the SAME resolver, so an
  // admin's Searchable setting governs them too (not just system/buildSystem).
  const { entry: labelsFilterEntry } = useFieldConfigEntry('component.labels')
  const { entry: ownerFilterEntry } = useFieldConfigEntry('component.componentOwner')

  // A field's effective search placement; `'None'` hides the control entirely.
  const place = (path: string, entry: FieldConfigEntry): Searchable =>
    searchabilityFor(path, entry)
  const systemPlace = place('component.system', systemEntry)
  const buildSystemPlace = place('buildSystem', buildSystemEntry)
  const labelsPlace = place('component.labels', labelsFilterEntry)
  const ownerPlace = place('component.componentOwner', ownerFilterEntry)

  // Each extended control is defined once and placed by its searchability:
  // 'None' → never rendered; 'Extended' → rendered in the toggle-gated row;
  // 'Main' → rendered in the always-visible top bar (an admin-promoted field
  // surfaces without opening the panel, matching the Main/Extended/None spec).
  const extendedControls: { place: Searchable; node: ReactNode }[] = [
    {
      place: place('component.clientCode', clientCodeEntry),
      node: (
        <div key="clientCode" className="flex flex-col gap-1">
          <Label htmlFor="filter-clientCode" className="text-xs text-muted-foreground">
            Client code
          </Label>
          <MultiSelectFilter
            id="filter-clientCode"
            value={filter.clientCode ?? []}
            onChange={handleClientCodeChange}
            options={clientCodeOptions}
            isLoading={clientCodesLoading}
            placeholder="All client codes"
            unitLabel="client code"
            onOpenChange={(open) => {
              if (open) setClientCodesActivated(true)
            }}
          />
        </div>
      ),
    },
    {
      place: place('jira.projectKey', jiraProjectKeyEntry),
      node: (
        <div key="jiraProjectKey" className="flex flex-col gap-1">
          <Label htmlFor="filter-jiraProjectKey" className="text-xs text-muted-foreground">
            Jira project key
          </Label>
          <MultiSelectFilter
            id="filter-jiraProjectKey"
            value={filter.jiraProjectKey ?? []}
            onChange={handleJiraProjectKeyChange}
            options={jiraProjectKeyOptions}
            isLoading={jiraProjectKeysLoading}
            placeholder="All Jira keys"
            unitLabel="Jira key"
            onOpenChange={(open) => {
              if (open) setJiraProjectKeysActivated(true)
            }}
          />
        </div>
      ),
    },
    {
      place: place('build.javaVersion', javaVersionEntry),
      node: (
        <div key="javaVersion" className="flex flex-col gap-1">
          <Label htmlFor="filter-javaVersion" className="text-xs text-muted-foreground">
            Java version
          </Label>
          <MultiSelectFilter
            id="filter-javaVersion"
            value={filter.javaVersion ?? []}
            onChange={handleJavaVersionChange}
            options={javaVersionOptions}
            isLoading={javaVersionsLoading}
            placeholder="All Java versions"
            unitLabel="Java version"
            onOpenChange={(open) => {
              if (open) setJavaVersionsActivated(true)
            }}
          />
        </div>
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
        <div key="parentComponentName" className="flex flex-col gap-1">
          <Label htmlFor="filter-parentComponentName" className="text-xs text-muted-foreground">
            Parent component
          </Label>
          <MultiSelectFilter
            id="filter-parentComponentName"
            value={filter.parentComponentName ?? []}
            onChange={handleParentComponentNameChange}
            options={parentComponentNameOptions}
            isLoading={parentNamesLoading}
            placeholder="All parents"
            unitLabel="parent"
            onOpenChange={(open) => {
              if (open) setParentNamesActivated(true)
            }}
          />
        </div>
      ),
    },
    {
      place: place('component.groupKey', groupKeyEntry),
      node: (
        <div key="groupKey" className="flex flex-col gap-1">
          <Label htmlFor="filter-groupKey" className="text-xs text-muted-foreground">
            Group key
          </Label>
          <MultiSelectFilter
            id="filter-groupKey"
            value={filter.groupKey ?? []}
            onChange={handleGroupKeyChange}
            options={groupKeyOptions}
            isLoading={groupKeysLoading}
            placeholder="All groups"
            unitLabel="group"
            onOpenChange={(open) => {
              if (open) setGroupKeysActivated(true)
            }}
          />
        </div>
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
    {
      place: place('component.distributionExplicit', distributionExplicitEntry),
      node: (
        <TriStateFilter
          key="distributionExplicit"
          label="Distribution explicit"
          value={filter.distributionExplicit}
          onChange={(v) => onFilterChange({ ...filter, distributionExplicit: v })}
        />
      ),
    },
    {
      place: place('component.distributionExternal', distributionExternalEntry),
      node: (
        <TriStateFilter
          key="distributionExternal"
          label="Distribution external"
          value={filter.distributionExternal}
          onChange={(v) => onFilterChange({ ...filter, distributionExternal: v })}
        />
      ),
    },
  ]

  // The four classic multi-select filters, placed by the same resolver as the
  // extended controls — so an admin can demote one to Extended (moves to the
  // toggle row) or hide it with None, not just system/buildSystem.
  const mainFilterControls: { place: Searchable; node: ReactNode }[] = [
    {
      place: systemPlace,
      node: (
        <MultiSelectFilter
          key="system"
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
      ),
    },
    {
      place: buildSystemPlace,
      node: (
        <MultiSelectFilter
          key="buildSystem"
          value={filter.buildSystem ?? []}
          onChange={handleBuildSystemChange}
          options={buildSystemOptions}
          isLoading={buildSystemLoading}
          placeholder="All build systems"
          unitLabel="build system"
        />
      ),
    },
    {
      place: labelsPlace,
      node: (
        <MultiSelectFilter
          key="labels"
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
      ),
    },
    {
      // The "My Components" shortcut moved to the preset bar (spec §1.1/1.3);
      // the owner picker stays here, placed by the owner field's searchability
      // (Main / Extended / None) so an admin can still demote or hide it.
      place: ownerPlace,
      node: (
        <MultiSelectFilter
          key="owner"
          value={filter.owner ?? []}
          onChange={handleOwnerChange}
          options={owners}
          isLoading={ownersLoading}
          placeholder="All owners"
          unitLabel="owner"
        />
      ),
    },
  ]

  // Unify classic + extended controls and split by placement, so ONE rule drives
  // Main (always-visible top bar) vs Extended (toggle row) vs None (hidden).
  const placeable = [...mainFilterControls, ...extendedControls]
  const mainRow = placeable.filter((c) => c.place === 'Main')
  const rowExtended = placeable.filter((c) => c.place === 'Extended')

  // In "Only with problems" mode the displayed list is driven by the Portal
  // validation report, not a CRS query — so the CRS filter controls have no
  // effect. Visually disable (dim + non-interactive) the whole CRS filter group
  // while the toggle is on, so the inert controls don't read as "active". The
  // "Only with problems" toggle itself stays interactive (rendered outside the
  // disabled group).
  const crsFiltersDisabled = problemsOnly
  const disabledGroupClass = crsFiltersDisabled ? 'opacity-50 pointer-events-none' : undefined

  return (
    <div className="space-y-2">
      <FilterBar>
        {/* CRS filter controls — dimmed + inert in problems-only mode (the
            "With problems" preset, driven from the preset bar; problems are
            Portal-computed, so the CRS filters have no effect while it is on). */}
        <div
          data-testid="crs-filter-controls"
          className={cn('flex flex-wrap items-center gap-2', disabledGroupClass)}
          // Belt-and-braces alongside pointer-events-none: `inert` (React 19)
          // removes the group from the tab order + pointer/AT interaction when
          // disabled, and aria-disabled marks it for assistive tech.
          aria-disabled={crsFiltersDisabled || undefined}
          inert={crsFiltersDisabled}
        >
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search components..."
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Every Main-placed control renders here: the classic multi-selects
              (system / buildSystem / labels / owner), plus any admin-promoted
              extended field. None-placed are dropped; Extended-placed move to the
              toggle row below. Archived is now the "Archived" preset, and "Clear
              all" lives in the active-filter chips row — neither is duplicated here. */}
          {mainRow.map((c) => c.node)}

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
        </div>

        {/* Hint that CRS filters are inert while the "With problems" preset is on. */}
        {crsFiltersDisabled && (
          <span className="text-xs text-muted-foreground">
            {typeof problemsCount === 'number' && (
              <>
                {problemsCount} component{problemsCount === 1 ? '' : 's'} with validation problems.{' '}
              </>
            )}
            Component filters don’t apply in the “With problems” preset.
          </span>
        )}
      </FilterBar>

      {extendedOpen && rowExtended.length > 0 && (
        <FilterBar>
          <div
            className={cn('flex flex-wrap items-center gap-2', disabledGroupClass)}
            aria-disabled={crsFiltersDisabled || undefined}
            inert={crsFiltersDisabled}
          >
            {rowExtended.map((c) => c.node)}
          </div>
        </FilterBar>
      )}
    </div>
  )
}
