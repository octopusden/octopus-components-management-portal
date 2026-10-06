import { Fragment } from 'react'
import { Link } from 'react-router'
import { Badge } from './ui/badge'
import { asCodeLineHref, highlightSubstring } from '../lib/asCodeSearch'
import type { AsCodeSearchHit } from '../lib/types'

interface AsCodeSearchResultsProps {
  hits: AsCodeSearchHit[]
  query: string
  regex: boolean
}

/**
 * Matches grouped by component. Each line links into the component's As Code tab at that
 * line; the block path (minus the component block itself) tells which version range or
 * section a match sits in without opening the component.
 */
export function AsCodeSearchResults({ hits, query, regex }: AsCodeSearchResultsProps) {
  return (
    <div className="space-y-3">
      {hits.map((hit) => {
        const more = hit.matchCount - hit.matches.length
        const firstLine = hit.matches[0]?.line ?? 1
        return (
          <section key={hit.id} className="rounded-md border" aria-label={hit.componentKey}>
            <header className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
              <Link
                to={asCodeLineHref(hit.id, firstLine)}
                className="font-mono text-sm font-semibold text-primary hover:underline"
              >
                {hit.componentKey}
              </Link>
              {hit.archived && <Badge variant="secondary">Archived</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">
                {hit.matchCount} {hit.matchCount === 1 ? 'match' : 'matches'}
              </span>
            </header>
            <ol className="divide-y">
              {hit.matches.map((m) => {
                const nested = m.path.slice(1)
                return (
                  <li key={m.line}>
                    <Link
                      to={asCodeLineHref(hit.id, m.line)}
                      className="flex items-baseline gap-3 px-3 py-1.5 hover:bg-muted/50"
                      aria-label={`${hit.componentKey} line ${m.line}`}
                    >
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">{m.line}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {regex ? m.text : highlightSubstring(m.text, query)}
                      </span>
                      {nested.length > 0 && (
                        <span className="shrink-0 truncate font-mono text-xs text-muted-foreground" title={nested.join(' › ')}>
                          {nested.map((segment, i) => (
                            <Fragment key={i}>
                              {i > 0 && ' › '}
                              {segment}
                            </Fragment>
                          ))}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ol>
            {more > 0 && (
              <div className="border-t px-3 py-1.5 text-xs">
                <Link to={asCodeLineHref(hit.id, firstLine)} className="text-primary hover:underline">
                  +{more} more in {hit.componentKey}
                </Link>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
