import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import { isMac, MOD_KEY_LABEL } from '@/lib/platform'

interface Shortcut {
  keys: string[]
  label: string
}

// The canonical shortcut list (spec §1.6). The first row's modifier label is
// platform-aware (⌘ on mac, Ctrl elsewhere) so the panel matches the key the
// user actually presses.
function shortcuts(): Shortcut[] {
  return [
    { keys: [MOD_KEY_LABEL, 'K'], label: 'Open the command palette' },
    { keys: ['?'], label: 'Show this shortcuts panel' },
    { keys: ['↑', '↓'], label: 'Move between results' },
    { keys: ['↵'], label: 'Activate the selected item' },
    { keys: ['Esc'], label: 'Close the palette or this panel' },
  ]
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

/**
 * Keyboard-shortcuts reference panel (spec §1.6). Opened by pressing "?"
 * (handled by useGlobalHotkeys) or via the AppFooter link, and closed by Esc /
 * the overlay. Mounted once globally alongside the command palette; its open
 * state lives in the shared uiOverlay store.
 */
export function KeyboardShortcutsDialog() {
  const open = useUiOverlay((s) => s.shortcutsOpen)
  const setOpen = useUiOverlay((s) => s.setShortcutsOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            {isMac() ? 'Press ⌘K' : 'Press Ctrl+K'} anywhere to open the command palette.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2">
          {shortcuts().map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-foreground">{s.label}</dt>
              <dd className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
