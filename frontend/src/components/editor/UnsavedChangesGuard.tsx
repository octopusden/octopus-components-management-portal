import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'

interface UnsavedChangesGuardProps {
  /** When true, intercept in-app navigation and a browser unload. */
  when: boolean
}

/**
 * react-router unsaved-changes route guard (spec §2.2). While `when` is true,
 * in-app navigation away from the editor is intercepted with a confirm dialog;
 * a full-page unload (reload / close tab) shows the browser's native prompt via
 * beforeunload. Confirming proceeds with the blocked navigation; cancelling
 * stays put.
 */
export function UnsavedChangesGuard({ when }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  )

  // Native prompt for hard navigations (reload / tab close) — useBlocker only
  // catches in-app router navigations.
  useEffect(() => {
    if (!when) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])

  const blocked = blocker.state === 'blocked'

  return (
    <Dialog
      open={blocked}
      onOpenChange={(open) => {
        // Closing the dialog without confirming = stay (reset the blocker).
        if (!open && blocked) blocker.reset?.()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>
            You have unsaved changes on this component. Leaving now will discard them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Stay
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Leave without saving
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
