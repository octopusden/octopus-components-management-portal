import { useCallback, useContext, useEffect, useState } from 'react'
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

/**
 * The search state, kept in the URL so a search is shareable: `?q=&regex=true&archived=all|true&limit=`
 * (no `archived` = active components only).
 * Every write replaces the history entry (one entry per page visit, not per search), and any
 * change other than `limit` itself drops a previously raised `limit`.
 * A write starts from the router's own location: the data router renders a location in a
 * transition, so two writes in a row (a tab click, then the field's blur) would otherwise both
 * start from the rendered params and the second would undo the first.
 */
function useAsCodeSearchUrlState() {
  const [params, setParams] = useSearchParams()
  const router = useContext(UNSAFE_DataRouterContext)?.router
  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(router ? router.state.location.search : prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          if (!('limit' in changes)) next.delete('limit')
          return next
        },
        { replace: true },
      )
    },
    [router, setParams],
  )
  return {
    query: params.get('q') ?? '',
    regex: params.get('regex') === 'true',
    scope: parseScope(params.get('archived')),
    limit: parseLimit(params.get('limit')),
    update,
  }
}

/**
 * Global text search over every component's as-code view — the replacement for grepping the
 * Groovy DSL files. Results follow the field as it is typed (debounced); the URL takes the text
 * only when the search is committed: Enter, leaving the field, or a change of mode, scope or limit.
 */
export function AsCodeSearchPage() {
  const { query: urlQuery, regex, scope, limit, update } = useAsCodeSearchUrlState()
  const location = useLocation()
  const [input, setInput] = useState(urlQuery)
  const [query, setQuery] = useState(urlQuery)

  // Every location the page renders (palette, header search, a link, Back/Forward, its own
  // commits) sets the field and the results to its `q`. A draft typed before it is dropped:
  // only a commit writes the URL, so no pending text can overwrite navigation. A commit is a user
  // action; one landing before another navigation renders applies to it (last write wins).
  const [seenKey, setSeenKey] = useState(location.key)
  if (location.key !== seenKey) {
    setSeenKey(location.key)
    setInput(urlQuery)
    setQuery(urlQuery)
  }

  useEffect(() => {
    if (input === query) return
    const timer = setTimeout(() => setQuery(input), 300)
    return () => clearTimeout(timer)
  }, [input, query])

  // Writes the field's text along with `changes`.
  const commit = (changes: Record<string, string | null> = {}) => update({ q: input || null, ...changes })

  // A raised limit belongs to the committed query.
  const committed = query === urlQuery
  const search = useAsCodeSearch({ query, regex, archived: archivedParam(scope), limit: committed ? limit : undefined })

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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input !== urlQuery) commit()
            }}
            onBlur={() => {
              if (input !== urlQuery) commit()
            }}
            autoFocus
          />
          <Tabs value={regex ? 'regex' : 'text'} onValueChange={(v) => commit({ regex: v === 'regex' ? 'true' : null })} variant="pill">
            <TabsList aria-label="Match mode">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="regex">Regex</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={scope}
            onValueChange={(v) => commit({ archived: SCOPE_PARAM[v as ArchivedScope] })}
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
          tooShort={query.trim().length < AS_CODE_SEARCH_MIN_QUERY}
          regex={regex}
          data={search.data}
          error={search.error}
          canRaiseLimit={!committed || (limit ?? 0) < MAX_LIMIT}
          onRaiseLimit={() => commit({ limit: String(MAX_LIMIT) })}
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
