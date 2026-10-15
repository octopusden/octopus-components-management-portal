import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { UNSAFE_DataRouterContext, useLocation, useSearchParams } from 'react-router'
import { Layout } from '../components/Layout'
import { AsCodeSearchResults } from '../components/AsCodeSearchResults'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { InlineError } from '../components/ui/inline-error'
import { Input } from '../components/ui/input'
import { SkeletonBlock } from '../components/ui/skeleton-block'
import { StatusBanner } from '../components/ui/status-banner'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { AS_CODE_SEARCH_MIN_QUERY, useAsCodeSearch } from '../hooks/useAsCodeSearch'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { ApiError } from '../lib/api'
import type { AsCodeSearchResponse } from '../lib/types'

/** The server's maximum `limit`; offered when the default cut truncates the results. */
const MAX_LIMIT = 1000

type ArchivedScope = 'all' | 'active' | 'archived'

function archivedParam(scope: ArchivedScope): boolean | undefined {
  if (scope === 'active') return false
  if (scope === 'archived') return true
  return undefined
}

// URL form of the scope. Active is the default and leaves no param, so a plain /search link
// (palette, nav) searches active components only.
const SCOPE_PARAM: Record<ArchivedScope, string | null> = { active: null, all: 'all', archived: 'true' }

function parseScope(raw: string | null): ArchivedScope {
  if (raw === 'all') return 'all'
  if (raw === 'true') return 'archived'
  return 'active'
}

function parseLimit(raw: string | null): number | undefined {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** Tags each URL write of this page (in the location state), so it can be told from incoming navigation. */
let lastWriteId = 0

function writeIdOf(state: unknown): number | undefined {
  return (state as { asCodeSearchWrite?: number } | null)?.asCodeSearchWrite
}

/**
 * The search state, kept in the URL so a search is shareable: `?q=&regex=true&archived=all|true&limit=`
 * (no `archived` = active components only).
 * Every write replaces the history entry (one entry per page visit, not per keystroke), and any
 * change other than `limit` itself drops a previously raised `limit`.
 * `arrivals` counts locations this page did not write itself (palette, header search, a link,
 * back/forward — also to an entry it wrote earlier), even ones carrying the same `q`.
 *
 * The data router (the app's createBrowserRouter) moves its location at once but renders it in a
 * transition, so a write can run while the page still shows the previous location. Writes
 * therefore start from the router's own location, and are dropped while it is one the page did
 * not write (it arrives as soon as it renders). Under a declarative router they use the
 * rendered params.
 */
function useAsCodeSearchUrlState() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const router = useContext(UNSAFE_DataRouterContext)?.router
  const renderedKey = useRef(location.key)
  useEffect(() => {
    renderedKey.current = location.key
  })
  // The id of the latest write, read by the next write before React has rendered this one.
  const latestWrite = useRef<number | null>(null)
  // The id of a write whose location has not rendered yet; consumed by that location, so a later
  // Back/Forward to the same entry counts as an arrival.
  const [ownWrite, setOwnWrite] = useState<number | null>(null)
  const [seenKey, setSeenKey] = useState(location.key)
  const [arrivals, setArrivals] = useState(0)
  if (location.key !== seenKey) {
    setSeenKey(location.key)
    if (ownWrite === null || writeIdOf(location.state) !== ownWrite) setArrivals((n) => n + 1)
    setOwnWrite(null)
  }
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const current = router?.state.location
      if (current && current.key !== renderedKey.current && writeIdOf(current.state) !== latestWrite.current) return
      const id = ++lastWriteId
      latestWrite.current = id
      setOwnWrite(id)
      setParams(
        (prev) => {
          const next = new URLSearchParams(current ? current.search : prev)
          if (value) next.set(key, value)
          else next.delete(key)
          if (key !== 'limit') next.delete('limit')
          return next
        },
        { replace: true, state: { asCodeSearchWrite: id } },
      )
    },
    [router, setParams],
  )
  return {
    query: params.get('q') ?? '',
    regex: params.get('regex') === 'true',
    scope: parseScope(params.get('archived')),
    limit: parseLimit(params.get('limit')),
    arrivals,
    setParam,
  }
}

/**
 * Global text search over every component's as-code view — the replacement for grepping the
 * Groovy DSL files. The input is debounced; the URL and the request follow the debounced value.
 */
export function AsCodeSearchPage() {
  const { query: urlQuery, regex, scope, limit, arrivals, setParam } = useAsCodeSearchUrlState()
  const [input, setInput] = useState(urlQuery)
  const debounced = useDebouncedValue(input, 300)

  // Incoming navigation while the page stays mounted replaces the input, pending keystrokes
  // included, even when its `q` equals the current one (setting the input restarts the
  // debounce, so the superseded text is never written).
  const [seenArrivals, setSeenArrivals] = useState(arrivals)
  if (arrivals !== seenArrivals) {
    setSeenArrivals(arrivals)
    setInput(urlQuery)
  }

  // Typing writes the URL — only when the debounced text itself changes, so a stale value
  // never overwrites a query that arrived by navigation.
  const writtenRef = useRef(debounced)
  useEffect(() => {
    if (debounced === writtenRef.current) return
    writtenRef.current = debounced
    if (debounced !== urlQuery) setParam('q', debounced)
  }, [debounced, urlQuery, setParam])

  const search = useAsCodeSearch({ query: urlQuery, regex, archived: archivedParam(scope), limit })

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Global search</h1>
          <p className="text-sm text-muted-foreground">
            Search the as-code text of every component — artifacts, versions, VCS URLs, Jira keys, people.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Search text"
            placeholder={regex ? 'Regular expression, e.g. groupId = "org\\.example' : 'e.g. org.example.foo'}
            className="h-9 min-w-64 flex-1 font-mono"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <Tabs value={regex ? 'regex' : 'text'} onValueChange={(v) => setParam('regex', v === 'regex' ? 'true' : null)} variant="pill">
            <TabsList aria-label="Match mode">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="regex">Regex</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={scope}
            onValueChange={(v) => setParam('archived', SCOPE_PARAM[v as ArchivedScope])}
            variant="pill"
          >
            <TabsList aria-label="Archived">
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <SearchBody
          tooShort={urlQuery.trim().length < AS_CODE_SEARCH_MIN_QUERY}
          regex={regex}
          data={search.data}
          error={search.error}
          canRaiseLimit={(limit ?? 0) < MAX_LIMIT}
          onRaiseLimit={() => setParam('limit', String(MAX_LIMIT))}
        />
      </div>
    </Layout>
  )
}

interface SearchBodyProps {
  tooShort: boolean
  regex: boolean
  data: AsCodeSearchResponse | undefined
  error: Error | null
  canRaiseLimit: boolean
  onRaiseLimit: () => void
}

function SearchBody({ tooShort, regex, data, error, canRaiseLimit, onRaiseLimit }: SearchBodyProps) {
  if (tooShort) {
    return (
      <p className="text-sm text-muted-foreground">
        Type at least {AS_CODE_SEARCH_MIN_QUERY} characters. Matching is case-insensitive
        {regex ? '; the query is a regular expression (RE2 syntax: no lookarounds or backreferences).' : '; the text is matched literally.'}
      </p>
    )
  }
  if (error) {
    // A 400 carries the server's reason (invalid regex, too expensive, too complex).
    return <InlineError message={error instanceof ApiError ? error.message : String(error)} />
  }
  if (!data) return <SkeletonBlock height="h-48" width="w-full" />
  if (data.results.length === 0) return <EmptyState message="No component's as-code view matches." />
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {data.totalComponents} {data.totalComponents === 1 ? 'component matches' : 'components match'}
        {data.truncated && ` — showing the first ${data.results.length}`}
      </p>
      {data.truncated && canRaiseLimit && (
        <StatusBanner variant="info">
          <span className="flex flex-wrap items-center gap-2">
            More components match than are shown. Narrow the query, or
            <Button variant="outline" size="sm" onClick={onRaiseLimit}>
              Show up to {MAX_LIMIT}
            </Button>
          </span>
        </StatusBanner>
      )}
      <AsCodeSearchResults hits={data.results} />
    </>
  )
}
