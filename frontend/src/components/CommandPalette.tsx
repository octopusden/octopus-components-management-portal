import { Fragment, type ReactNode, useState } from 'react'
import { useNavigate } from 'react-router'
import { Package, History, Activity, Plus, ListFilter } from 'lucide-react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from './ui/command'
import { CreateComponentDialog } from './CreateComponentDialog'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useComponents } from '@/hooks/useComponents'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { matchesQuery, rankComponents } from '@/lib/paletteSearch'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useAdminMode } from '@/lib/adminModeStore'
import { presetUrl } from '@/lib/presetUrl'
import { PRESETS, type PresetId } from '@/lib/listPresets'

// Filter presets the palette can apply. Mirrors ListPresetBar: "problems" is
// admin-only; the personal RM/SC presets scope to the current user's own roles.
// "all"/"archived" are reachable from the list itself and omitted here to keep
// the palette focused on the common scoped views.
const PALETTE_FILTER_IDS = [
  'problems',
  'mine',
  'release-manager',
  'security-champion',
] as const satisfies readonly PresetId[]

// Fetch with headroom so the client-side relevance ranking has candidates to
// reorder: CRS caps by `size` *before* we can rank, so requesting only the 6 we
// display could drop a prefix match the server happened to sort late. We fetch
// up to this many matches, rank them, then show the top PALETTE_RESULT_CAP.
const PALETTE_FETCH_SIZE = 25
const PALETTE_RESULT_CAP = 6

// A static (non-component) palette entry: navigation, action, or filter preset.
interface PaletteItem {
  value: string
  label: string
  icon: ReactNode
  onSelect: () => void
}

export function CommandPalette() {
  const open = useUiOverlay((s) => s.paletteOpen)
  const setPaletteOpen = useUiOverlay((s) => s.setPaletteOpen)
  const closePalette = useUiOverlay((s) => s.closePalette)
  const navigate = useNavigate()

  const { data: user } = useCurrentUser()
  const username = user?.username ?? null
  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)
  const canAudit = hasPermission(user, PERMISSIONS.ACCESS_AUDIT)
  const canCreate = hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)

  // Component search: server-side `search` param, debounced. cmdk's built-in
  // fuzzy filter is disabled (shouldFilter=false) because results already come
  // pre-filtered from CRS; we rank them ourselves (see rankComponents).
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 250)
  const searchActive = debounced.length > 0
  const { data: results, isFetching } = useComponents({
    filter: { archived: false, search: debounced },
    size: PALETTE_FETCH_SIZE,
    enabled: searchActive,
  })
  const components = searchActive
    ? rankComponents(results?.content ?? [], debounced, PALETTE_RESULT_CAP)
    : []

  // "New Component" reuses the existing create dialog. We open it after closing
  // the palette so two stacked dialogs never fight for focus.
  const [createOpen, setCreateOpen] = useState(false)

  // Closing the palette clears the typed query so a prior search doesn't flash
  // its (cached) results on the next open. Setting query to '' also resets the
  // debounced value, so searchActive flips back to false synchronously.
  function setOpen(next: boolean) {
    setPaletteOpen(next)
    if (!next) setQuery('')
  }

  function go(to: string) {
    closePalette()
    setQuery('')
    navigate(to)
  }

  function startCreate() {
    closePalette()
    setCreateOpen(true)
  }

  // Static entries, gated by permission. Built every render but cheap.
  const navItems: PaletteItem[] = [
    { value: 'goto components', label: 'Components', icon: <Package />, onSelect: () => go('/components') },
    ...(canAudit
      ? [{ value: 'goto audit', label: 'Audit', icon: <History />, onSelect: () => go('/audit') }]
      : []),
    ...(isAdmin
      ? [{ value: 'goto health', label: 'Health', icon: <Activity />, onSelect: () => go('/health') }]
      : []),
  ]
  const actionItems: PaletteItem[] = canCreate
    ? [{ value: 'action new component', label: 'New Component', icon: <Plus />, onSelect: startCreate }]
    : []
  const filterItems: PaletteItem[] = PALETTE_FILTER_IDS.flatMap((id) => {
    const preset = PRESETS.find((p) => p.id === id)
    // Admin-only presets (With problems) are hidden for non-admins, mirroring
    // the list's ListPresetBar.
    if (!preset || (preset.adminOnly && !isAdmin)) return []
    return [
      {
        value: `filter ${preset.label}`,
        label: preset.label,
        icon: <ListFilter />,
        onSelect: () => go(presetUrl(id, username)),
      },
    ]
  })

  function itemGroup(key: string, heading: string, items: PaletteItem[]): ReactNode {
    if (!items.length) return null
    return (
      <CommandGroup key={key} heading={heading}>
        {items.map((it) => (
          <CommandItem key={it.value} value={it.value} onSelect={it.onSelect}>
            {it.icon}
            {it.label}
          </CommandItem>
        ))}
      </CommandGroup>
    )
  }

  // Build the visible groups. When searching, components rank first and the
  // static groups show only entries whose label matches the query; when idle,
  // the static groups form the suggestion menu. Empty groups are dropped so the
  // separators between them stay correct.
  const matched = (items: PaletteItem[]) =>
    searchActive ? items.filter((it) => matchesQuery(it.label, debounced)) : items

  const componentsGroup: ReactNode =
    searchActive && components.length > 0 ? (
      <CommandGroup key="components" heading="Components">
        {components.map((c) => (
          <CommandItem
            key={c.id}
            value={`component ${c.id}`}
            onSelect={() => go(`/components/${c.id}`)}
          >
            <Package />
            <span className="font-medium">{c.name}</span>
            {c.displayName && c.displayName !== c.name && (
              <span className="ml-2 truncate text-xs text-muted-foreground">{c.displayName}</span>
            )}
          </CommandItem>
        ))}
      </CommandGroup>
    ) : null

  const groups: { key: string; node: ReactNode }[] = [
    { key: 'components', node: componentsGroup },
    { key: 'goto', node: itemGroup('goto', 'Go to', matched(navItems)) },
    { key: 'action', node: itemGroup('action', 'Action', matched(actionItems)) },
    { key: 'filter', node: itemGroup('filter', 'Filter', matched(filterItems)) },
  ].filter((g) => g.node != null)

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Search components, jump to a page, run an action…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {searchActive && isFetching ? 'Searching…' : 'No results.'}
          </CommandEmpty>

          {groups.map(({ key, node }, i) => (
            <Fragment key={key}>
              {i > 0 && <CommandSeparator />}
              {node}
            </Fragment>
          ))}
        </CommandList>
      </CommandDialog>

      {/* Reuse the list's create flow. Mounted outside the palette dialog so it
          survives the palette closing; opened from the "New Component" action. */}
      {createOpen && (
        <CreateComponentDialog
          open
          onOpenChange={(o) => {
            if (!o) setCreateOpen(false)
          }}
        />
      )}
    </>
  )
}
