import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { CodeBlock } from '../ui/CodeBlock'
import { InlineError } from '../ui/inline-error'
import { SkeletonBlock } from '../ui/skeleton-block'
import { useComponentAsCode, type AsCodeMode } from '../../hooks/useComponentAsCode'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useToast } from '../../hooks/use-toast'
import { copyToClipboard } from '../../lib/clipboard'
import { ApiError } from '../../lib/api'
import { highestLowerBoundVersion } from '../../lib/versionRange'
import type { ComponentDetail } from '../../lib/types'

interface AsCodeTabProps {
  component: ComponentDetail
}

/**
 * Read-only "As Code" tab: renders the component as a Groovy-style definition
 * fetched from GET /components/{id}/as-code. A Full/Resolved toggle switches
 * between the all-version-ranges view and a single concrete version (entered in
 * the debounced version box). A Copy button puts the current text on the clipboard.
 */
export function AsCodeTab({ component }: AsCodeTabProps) {
  const { toast } = useToast()
  const [mode, setMode] = useState<AsCodeMode>('full')
  // Seed the resolve box with the highest configured version (the "current"
  // version) so Resolved works out of the box and a version-outside-the-ranges
  // miss is the exception, not the default. Derived from the component's
  // configuration + ownership ranges; null when none has a usable lower bound.
  const defaultVersion = useMemo(
    () =>
      highestLowerBoundVersion([
        ...(component.configurations ?? []).map((c) => c.versionRange),
        ...(component.artifactIds ?? []).map((a) => a.versionRange),
      ]),
    [component.configurations, component.artifactIds],
  )
  const [versionInput, setVersionInput] = useState(() => defaultVersion ?? '')
  const debouncedVersion = useDebouncedValue(versionInput, 350)

  const query = useComponentAsCode(component.id, { mode, version: debouncedVersion })
  const apiError = query.error instanceof ApiError ? query.error : null
  const trimmedVersion = debouncedVersion.trim()
  const code = query.data ?? ''

  async function handleCopy() {
    try {
      await copyToClipboard(code)
      toast({ title: 'Copied to clipboard' })
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={mode} onValueChange={(v) => setMode(v as AsCodeMode)} variant="pill">
            <TabsList>
              <TabsTrigger value="full">Full</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === 'resolved' && (
            <Input
              aria-label="Version"
              placeholder="e.g. 1.5.0"
              className="h-9 w-40"
              value={versionInput}
              onChange={(e) => setVersionInput(e.target.value)}
            />
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={!code}>
          <Copy className="mr-1.5 h-4 w-4" />
          Copy
        </Button>
      </div>

      <AsCodeBody
        mode={mode}
        hasVersion={trimmedVersion.length > 0}
        isLoading={query.isLoading}
        isError={query.isError}
        notFound={apiError?.status === 404}
        errorMessage={apiError?.message ?? 'Failed to load the code view.'}
        version={trimmedVersion}
        code={code}
        defaultVersion={defaultVersion}
        onUseDefault={() => defaultVersion && setVersionInput(defaultVersion)}
      />
    </div>
  )
}

interface AsCodeBodyProps {
  mode: AsCodeMode
  hasVersion: boolean
  isLoading: boolean
  isError: boolean
  notFound: boolean
  errorMessage: string
  version: string
  code: string
  defaultVersion: string | null
  onUseDefault: () => void
}

function AsCodeBody({
  mode,
  hasVersion,
  isLoading,
  isError,
  notFound,
  errorMessage,
  version,
  code,
  defaultVersion,
  onUseDefault,
}: AsCodeBodyProps) {
  if (mode === 'resolved' && !hasVersion) {
    return <p className="text-sm text-muted-foreground">Enter a version to resolve the component.</p>
  }
  if (isLoading) {
    return <SkeletonBlock height="h-64" width="w-full" />
  }
  if (isError) {
    // A 404 in resolved mode means the version falls outside every configured
    // range — not a failure. Explain it and offer the latest configured version
    // (when known) instead of a bare error.
    if (mode === 'resolved' && notFound) {
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Version <span className="font-mono">{version}</span> falls outside every configured range
            {defaultVersion ? (
              <>
                {' '}— the latest configured version is <span className="font-mono">{defaultVersion}</span>.
              </>
            ) : (
              '.'
            )}
          </p>
          {defaultVersion && defaultVersion !== version && (
            <Button variant="outline" size="sm" onClick={onUseDefault}>
              Resolve {defaultVersion}
            </Button>
          )}
        </div>
      )
    }
    return <InlineError message={errorMessage} />
  }
  return <CodeBlock code={code} />
}
