import { useRouteError, isRouteErrorResponse, Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'

/**
 * Route-level error boundary for the data router (wired as the AppShell route's
 * errorElement). Any uncaught render or loader error in a page route bubbles here
 * and renders a recoverable surface — heading, the error summary, a Reload action
 * and a link back to Components — instead of React unmounting the whole tree to a
 * blank white page (the most likely first-cutover failure mode given a fresh CRS v4).
 */
export function RouteError() {
  const error = useRouteError()
  const message =
    isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`.trim()
      : error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'An unexpected error occurred.'

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center"
    >
      <AlertTriangle className="size-10 text-destructive" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="break-words text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {/* autoFocus moves keyboard/screen-reader focus to the primary recovery
            action when this boundary replaces the page, so recovery is reachable
            without hunting for focus. */}
        <Button autoFocus onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="outline" asChild>
          <Link to="/components">Back to Components</Link>
        </Button>
      </div>
    </div>
  )
}
