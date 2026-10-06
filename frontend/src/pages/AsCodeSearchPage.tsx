import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
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

/** The server's maximum `limit`; offered when the default cut truncates the results. */
const MAX_LIMIT = 1000

type ArchivedScope = 'all' | 'active' | 'archived'

function archivedParam(scope: ArchivedScope): boolean | undefined {
  if (scope === 'active') return false
  if (scope === 'archived') return true
  return undefined
}

function parseScope(raw: string | null): ArchivedScope {
  if (raw === 'false') return 'active'
  if (raw === 'true') return 'archived'
  return 'all'
}

/**
 * Global text search over every component's as-code view — the replacement for grepping the
 * Groovy DSL files. URL-shareable: `?q=&regex=true&archived=true|false`. The input is
 * debounced; the URL and the request follow the debounced value.
 */
export function AsCodeSearchPage() {
  const [params, setParams] = useSearchParams()
  const urlQuery = params.get('q') ?? ''
  const regex = params.get('regex') === 'true'
  const scope = parseScope(params.get('archived'))
  const limitParam = Number(params.get('limit'))
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined

  const [input, setInput] = useState(urlQuery)
  const debounced = useDebouncedValue(input, 300)

  // Keep the URL in step with the debounced input (replace, not push: one history entry per
  // search page visit, not per keystroke). A changed query drops a previously raised limit.
  useEffect(() => {
    if (debounced === urlQuery) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (debounced) next.set('q', debounced)
        else next.delete('q')
        next.delete('limit')
        return next
      },
      { replace: true },
    )
  }, [debounced, urlQuery, setParams])

  function updateParam(key: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null) next.delete(key)
        else next.set(key, value)
        if (key !== 'limit') next.delete('limit')
        return next
      },
      { replace: true },
    )
  }

  const query = useAsCodeSearch({ query: urlQuery, regex, archived: archivedParam(scope), limit })
  const tooShort = urlQuery.trim().length < AS_CODE_SEARCH_MIN_QUERY
  const data = tooShort ? undefined : query.data
  const errorMessage =
    query.error instanceof ApiError ? query.error.message : query.error ? String(query.error) : null

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Search as code</h1>
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
          <Tabs value={regex ? 'regex' : 'text'} onValueChange={(v) => updateParam('regex', v === 'regex' ? 'true' : null)} variant="pill">
            <TabsList aria-label="Match mode">
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="regex">Regex</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={scope}
            onValueChange={(v) => {
              const p = archivedParam(v as ArchivedScope)
              updateParam('archived', p === undefined ? null : String(p))
            }}
            variant="pill"
          >
            <TabsList aria-label="Archived">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {tooShort ? (
          <p className="text-sm text-muted-foreground">
            Type at least {AS_CODE_SEARCH_MIN_QUERY} characters. Matching is case-insensitive
            {regex ? '; the query is a regular expression.' : '; the text is matched literally.'}
          </p>
        ) : errorMessage ? (
          <InlineError message={errorMessage} />
        ) : !data ? (
          <SkeletonBlock height="h-48" width="w-full" />
        ) : data.results.length === 0 ? (
          <EmptyState message="No component's as-code view matches." />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {data.totalComponents} {data.totalComponents === 1 ? 'component matches' : 'components match'}
              {data.truncated && ` — showing the first ${data.results.length}`}
            </p>
            {data.truncated && (limit ?? 0) < MAX_LIMIT && (
              <StatusBanner variant="info">
                <span className="flex flex-wrap items-center gap-2">
                  More components match than are shown. Narrow the query, or
                  <Button variant="outline" size="sm" onClick={() => updateParam('limit', String(MAX_LIMIT))}>
                    Show up to {MAX_LIMIT}
                  </Button>
                </span>
              </StatusBanner>
            )}
            <AsCodeSearchResults hits={data.results} query={data.query} regex={data.regex} />
          </>
        )}
      </div>
    </Layout>
  )
}
