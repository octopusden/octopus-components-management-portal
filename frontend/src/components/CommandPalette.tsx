import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Package, History, Activity, Plus, Filter, ListFilter } from 'lucide-react'
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
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { useAdminMode } from '@/lib/adminModeStore'
import { presetUrl } from '@/lib/presetUrl'
import { PRESETS, type PresetId } from '@/lib/listPresets'

// Filter presets the palette can apply. Mirrors ListPresetBar: the deferred
// (Phase 1b) RM/SC presets render disabled with a hint; "problems" is
// admin-only. "all"/"archived" are reachable from the list itself and omitted
// here to keep the palette focused on the common scoped views.
const PALETTE_FILTER_IDS = [
  'problems',
  'mine',
  'release-manager',
  'security-champion',
] as const satisfies readonly PresetId[]

const DEFERRED_HINT = 'Coming soon — needs registry support'

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
  // pre-filtered from CRS — letting cmdk re-filter would hide valid server
  // matches whose key text differs from the typed query.
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 250)
  const searchActive = debounced.length > 0
  const { data: results, isFetching } = useComponents({
    filter: { archived: false, search: debounced },
    size: 8,
    enabled: searchActive,
  })
  const components = searchActive ? (results?.content ?? []) : []

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

          <CommandGroup heading="Go to">
            <CommandItem value="goto components" onSelect={() => go('/components')}>
              <Package />
              Components
            </CommandItem>
            {canAudit && (
              <CommandItem value="goto audit" onSelect={() => go('/audit')}>
                <History />
                Audit
              </CommandItem>
            )}
            {isAdmin && (
              <CommandItem value="goto health" onSelect={() => go('/health')}>
                <Activity />
                Health
              </CommandItem>
            )}
          </CommandGroup>

          {canCreate && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Action">
                <CommandItem value="action new component" onSelect={startCreate}>
                  <Plus />
                  New Component
                </CommandItem>
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Filter">
            {PALETTE_FILTER_IDS.map((id) => {
              const preset = PRESETS.find((p) => p.id === id)
              if (!preset) return null
              // Admin-only presets (With problems) are hidden for non-admins,
              // mirroring the list's ListPresetBar.
              if (preset.adminOnly && !isAdmin) return null
              if (preset.deferred) {
                // Phase 1b — disabled with a "coming soon" hint, no navigation.
                return (
                  <CommandItem key={id} value={`filter ${preset.label}`} disabled>
                    <Filter />
                    {preset.label}
                    <span className="ml-auto text-xs text-muted-foreground">{DEFERRED_HINT}</span>
                  </CommandItem>
                )
              }
              return (
                <CommandItem
                  key={id}
                  value={`filter ${preset.label}`}
                  onSelect={() => go(presetUrl(id, username))}
                >
                  <ListFilter />
                  {preset.label}
                </CommandItem>
              )
            })}
          </CommandGroup>

          {searchActive && components.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Components">
                {components.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`component ${c.id}`}
                    onSelect={() => go(`/components/${c.id}`)}
                  >
                    <Package />
                    <span className="font-medium">{c.name}</span>
                    {c.displayName && c.displayName !== c.name && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {c.displayName}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
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
