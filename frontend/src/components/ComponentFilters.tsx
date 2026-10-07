import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Funnel, Plus, X } from 'lucide-react'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { FilterBar } from './ui/filter-bar'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
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
  id,
  label,
  value,
  placeholder,
  onCommit,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  const [local, setLocal] = useState(value)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => setLocal(value), [value])
  // Cancel a pending debounce if the control unmounts (e.g. the filter is removed
  // or an admin flips the field to searchable: None) so the timer can't fire
  // onCommit against a stale closure after unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])
  return (
    <Input
      id={id}
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
  )
}

const TRI_STATE_OPTIONS: { text: string; value: boolean | undefined }[] = [
  { text: 'Any', value: undefined },
  { text: 'Yes', value: true },
  { text: 'No', value: false },
]

// Tri-state boolean filter (Any / Yes / No → undefined / true / false) as a compact
// segmented control, matching the app's other pill toggles.
function TriStateFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | undefined
  onChange: (v: boolean | undefined) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 items-center rounded-md border border-input p-0.5">
      {TRI_STATE_OPTIONS.map((o) => {
        const checked = value === o.value
        return (
          <button
            key={o.text}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 rounded px-2.5 text-xs font-medium transition-colors',
              checked ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.text}
          </button>
        )
      })}
    </div>
  )
}

// Topic groups for the "+ Filter" menu, in display order.
const FILTER_GROUPS = ['Classification', 'Ownership', 'Build & VCS', 'Jira', 'Distribution', 'Structure'] as const
type FilterGroup = (typeof FILTER_GROUPS)[number]

/** One filter dimension: where it is placed, whether it holds a value, and how to render / clear it. */
interface FilterDef {
  id: string
  label: string
  group: FilterGroup
  place: Searchable
  active: boolean
  /** Filter patch that clears this dimension. */
  cleared: Partial<ComponentFilter>
  /** The control. */
  control: ReactNode
  /** Id of a labellable control for `<Label htmlFor>`; omitted when the control names itself. */
  controlId?: string
  /** Main-placed classic pickers render bare — their placeholder ("All owners") is the label. */
  bare?: boolean
}

/** A filter shown in the bar with its name in front and, when removable, a × after it. */
function LabelledFilter({ def, onRemove }: { def: FilterDef; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-1.5" data-testid={`filter-${def.id}`}>
      {def.controlId ? (
        <Label htmlFor={def.controlId} className="whitespace-nowrap text-xs text-muted-foreground">
          {def.label}
        </Label>
      ) : (
        <span aria-hidden className="whitespace-nowrap text-xs text-muted-foreground">
          {def.label}
        </span>
      )}
      {def.control}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          aria-label={`Remove ${def.label} filter`}
          title="Remove filter"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

/** The "+ Filter" picker: the Extended-placed dimensions not yet in the bar, grouped by topic. */
function AddFilterMenu({ defs, onAdd }: { defs: FilterDef[]; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-label="Add filter">
          <Plus className="h-4 w-4" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        {FILTER_GROUPS.map((group) => {
          const items = defs.filter((d) => d.group === group)
          if (!items.length) return null
          return (
            <div key={group} role="group" aria-label={group} className="py-1">
              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group}</div>
              {items.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onAdd(d.id)
                    setOpen(false)
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )
        })}
      </PopoverContent>
    </Popover>
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
  // Extended dimensions the user added via "+ Filter" that hold no value yet. A dimension
  // with a value is always shown (so a shared/bookmarked URL never hides its own filters).
  const [added, setAdded] = useState<string[]>([])

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

  // Multi-value pickers share one shape: an empty selection clears the field.
  const setList = (key: keyof ComponentFilter) => (next: string[]) =>
    onFilterChange({ ...filter, [key]: next.length ? next : undefined })

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

  const multi = (
    key: 'system' | 'buildSystem' | 'labels' | 'owner' | 'clientCode' | 'jiraProjectKey' | 'javaVersion' | 'parentComponentName' | 'groupKey',
    props: {
      options: string[]
      isLoading: boolean
      placeholder: string
      unitLabel: string
      onFirstOpen?: () => void
    },
  ) => (
    <MultiSelectFilter
      key={key}
      id={`filter-${key}`}
      value={filter[key] ?? []}
      onChange={setList(key)}
      options={props.options}
      isLoading={props.isLoading}
      placeholder={props.placeholder}
      unitLabel={props.unitLabel}
      onOpenChange={
        props.onFirstOpen
          ? (open) => {
              if (open) props.onFirstOpen?.()
            }
          : undefined
      }
    />
  )

  const tri = (key: 'solution' | 'jiraTechnical' | 'canBeParent' | 'distributionExplicit' | 'distributionExternal', label: string) => (
    <TriStateFilter label={label} value={filter[key]} onChange={(v) => onFilterChange({ ...filter, [key]: v })} />
  )

  const text = (key: 'vcsPath' | 'productionBranch', label: string, placeholder: string) => (
    <TextFilter
      id={`filter-${key}`}
      label={label}
      placeholder={placeholder}
      value={filter[key] ?? ''}
      onCommit={(v) => onFilterChange({ ...filter, [key]: v || undefined })}
    />
  )

  // Every filter dimension, placed by the admin field-config searchability (Main / Extended /
  // None — `searchabilityFor`). Main: always in the bar. Extended: offered by "+ Filter" and
  // shown in the bar once added or holding a value. None: never rendered.
  const defs: FilterDef[] = [
    {
      id: 'system', label: 'System', group: 'Classification', place: systemPlace,
      active: !!filter.system?.length, cleared: { system: undefined }, controlId: 'filter-system', bare: true,
      control: multi('system', { options: systemOptions, isLoading: systemLoading, placeholder: 'All systems', unitLabel: 'system', onFirstOpen: () => setSystemActivated(true) }),
    },
    {
      id: 'buildSystem', label: 'Build system', group: 'Build & VCS', place: buildSystemPlace,
      active: !!filter.buildSystem?.length, cleared: { buildSystem: undefined }, controlId: 'filter-buildSystem', bare: true,
      control: multi('buildSystem', { options: buildSystemOptions, isLoading: buildSystemLoading, placeholder: 'All build systems', unitLabel: 'build system' }),
    },
    {
      id: 'labels', label: 'Labels', group: 'Classification', place: labelsPlace,
      active: !!filter.labels?.length, cleared: { labels: undefined }, controlId: 'filter-labels', bare: true,
      control: multi('labels', { options: labelOptions, isLoading: labelsLoading, placeholder: 'All labels', unitLabel: 'label', onFirstOpen: () => setLabelsActivated(true) }),
    },
    {
      // The "My Components" shortcut lives in the preset bar; the owner picker is placed by the
      // owner field's searchability so an admin can still demote or hide it.
      id: 'owner', label: 'Owner', group: 'Ownership', place: ownerPlace,
      active: !!filter.owner?.length, cleared: { owner: undefined }, controlId: 'filter-owner', bare: true,
      control: multi('owner', { options: owners, isLoading: ownersLoading, placeholder: 'All owners', unitLabel: 'owner' }),
    },
    {
      id: 'clientCode', label: 'Client code', group: 'Ownership', place: place('component.clientCode', clientCodeEntry),
      active: !!filter.clientCode?.length, cleared: { clientCode: undefined }, controlId: 'filter-clientCode',
      control: multi('clientCode', { options: clientCodeOptions, isLoading: clientCodesLoading, placeholder: 'All client codes', unitLabel: 'client code', onFirstOpen: () => setClientCodesActivated(true) }),
    },
    {
      id: 'groupKey', label: 'Group key', group: 'Ownership', place: place('component.groupKey', groupKeyEntry),
      active: !!filter.groupKey?.length, cleared: { groupKey: undefined }, controlId: 'filter-groupKey',
      control: multi('groupKey', { options: groupKeyOptions, isLoading: groupKeysLoading, placeholder: 'All groups', unitLabel: 'group', onFirstOpen: () => setGroupKeysActivated(true) }),
    },
    {
      id: 'parentComponentName', label: 'Parent component', group: 'Structure', place: place('component.parentComponentName', parentEntry),
      active: !!filter.parentComponentName?.length, cleared: { parentComponentName: undefined }, controlId: 'filter-parentComponentName',
      control: multi('parentComponentName', { options: parentComponentNameOptions, isLoading: parentNamesLoading, placeholder: 'All parents', unitLabel: 'parent', onFirstOpen: () => setParentNamesActivated(true) }),
    },
    {
      id: 'canBeParent', label: 'Can be parent', group: 'Structure', place: place('component.canBeParent', canBeParentEntry),
      active: filter.canBeParent !== undefined, cleared: { canBeParent: undefined },
      control: tri('canBeParent', 'Can be parent'),
    },
    {
      id: 'solution', label: 'Solution', group: 'Structure', place: place('component.solution', solutionEntry),
      active: filter.solution !== undefined, cleared: { solution: undefined },
      control: tri('solution', 'Solution'),
    },
    {
      id: 'javaVersion', label: 'Java version', group: 'Build & VCS', place: place('build.javaVersion', javaVersionEntry),
      active: !!filter.javaVersion?.length, cleared: { javaVersion: undefined }, controlId: 'filter-javaVersion',
      control: multi('javaVersion', { options: javaVersionOptions, isLoading: javaVersionsLoading, placeholder: 'All Java versions', unitLabel: 'Java version', onFirstOpen: () => setJavaVersionsActivated(true) }),
    },
    {
      id: 'vcsPath', label: 'VCS path', group: 'Build & VCS', place: place('vcs.vcsPath', vcsPathEntry),
      active: !!filter.vcsPath, cleared: { vcsPath: undefined }, controlId: 'filter-vcsPath',
      control: text('vcsPath', 'VCS path', 'contains…'),
    },
    {
      id: 'productionBranch', label: 'Production branch', group: 'Build & VCS', place: place('vcs.branch', productionBranchEntry),
      active: !!filter.productionBranch, cleared: { productionBranch: undefined }, controlId: 'filter-productionBranch',
      control: text('productionBranch', 'Production branch', 'contains…'),
    },
    {
      id: 'jiraProjectKey', label: 'Jira project key', group: 'Jira', place: place('jira.projectKey', jiraProjectKeyEntry),
      active: !!filter.jiraProjectKey?.length, cleared: { jiraProjectKey: undefined }, controlId: 'filter-jiraProjectKey',
      control: multi('jiraProjectKey', { options: jiraProjectKeyOptions, isLoading: jiraProjectKeysLoading, placeholder: 'All Jira keys', unitLabel: 'Jira key', onFirstOpen: () => setJiraProjectKeysActivated(true) }),
    },
    {
      id: 'jiraTechnical', label: 'Jira technical', group: 'Jira', place: place('jira.technical', jiraTechnicalEntry),
      active: filter.jiraTechnical !== undefined, cleared: { jiraTechnical: undefined },
      control: tri('jiraTechnical', 'Jira technical'),
    },
    {
      id: 'distributionExplicit', label: 'Distribution explicit', group: 'Distribution', place: place('component.distributionExplicit', distributionExplicitEntry),
      active: filter.distributionExplicit !== undefined, cleared: { distributionExplicit: undefined },
      control: tri('distributionExplicit', 'Distribution explicit'),
    },
    {
      id: 'distributionExternal', label: 'Distribution external', group: 'Distribution', place: place('component.distributionExternal', distributionExternalEntry),
      active: filter.distributionExternal !== undefined, cleared: { distributionExternal: undefined },
      control: tri('distributionExternal', 'Distribution external'),
    },
  ]

  const mainDefs = defs.filter((d) => d.place === 'Main')
  const extendedDefs = defs.filter((d) => d.place === 'Extended')
  const shownExtended = extendedDefs.filter((d) => d.active || added.includes(d.id))
  const addable = extendedDefs.filter((d) => !d.active && !added.includes(d.id))

  const removeFilter = (d: FilterDef) => {
    setAdded((a) => a.filter((id) => id !== d.id))
    if (d.active) onFilterChange({ ...filter, ...d.cleared })
  }

  // In "Only with problems" mode the displayed list is driven by the Portal
  // validation report, not a CRS query — so the CRS filter controls have no
  // effect. Visually disable (dim + non-interactive) the whole CRS filter group
  // while the toggle is on, so the inert controls don't read as "active".
  const crsFiltersDisabled = problemsOnly
  const disabledGroupClass = crsFiltersDisabled ? 'opacity-50 pointer-events-none' : undefined

  return (
    <div className="space-y-2">
      <FilterBar>
        {/* One row, however many filters are on: key/name, the Main-placed pickers, any
            Extended filter that holds a value or was added, then "+ Filter". Values show as
            removable chips below (ActiveFilterChips). Dimmed + inert in problems-only mode
            (the "With problems" preset): problems are Portal-computed, so the CRS filters
            have no effect while it is on. */}
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
            <Funnel className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by key or name…"
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {mainDefs.map((d) =>
            d.bare ? <div key={d.id}>{d.control}</div> : <LabelledFilter key={d.id} def={d} />,
          )}

          {shownExtended.map((d) => (
            <LabelledFilter key={d.id} def={d} onRemove={() => removeFilter(d)} />
          ))}

          {addable.length > 0 && (
            <AddFilterMenu defs={addable} onAdd={(id) => setAdded((a) => (a.includes(id) ? a : [...a, id]))} />
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
    </div>
  )
}
