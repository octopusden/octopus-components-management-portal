import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, Search } from 'lucide-react'
import { AS_CODE_SEARCH_MIN_QUERY, useAsCodeSearch } from '../hooks/useAsCodeSearch'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { asCodeLineHref, globalSearchHref, highlightRanges, QUICK_RESULTS_LIMIT } from '../lib/asCodeSearch'
import { isTypingInFormField } from '../lib/keyboard'
import { cn } from '../lib/utils'

/**
 * Header Global search: a real field with a quick-results panel (the simple mode). Typing shows
 * the first matching components (active only, first matching line each); a result opens that line
 * in the component's As Code tab; Enter or "See all" opens the full /search page with the query.
 * "/" focuses the field from anywhere (when not typing). Narrow screens get just a magnifier link.
 */
export function GlobalSearchBox() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const debounced = useDebouncedValue(input, 250)
  const ready = debounced.trim().length >= AS_CODE_SEARCH_MIN_QUERY

  const search = useAsCodeSearch({ query: debounced, regex: false, archived: false, limit: QUICK_RESULTS_LIMIT, maxMatchesPerComponent: 1 })
  const hits = ready ? (search.data?.results ?? []) : []
  // Options: each hit, then "See all" — keyboard selection walks them in this order.
  const optionCount = ready ? hits.length + 1 : 0
  const showPanel = open && ready

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTypingInFormField(e.target)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => setActive(-1), [debounced])

  function go(href: string) {
    setOpen(false)
    setInput('')
    inputRef.current?.blur()
    void navigate(href)
  }

  function choose(index: number) {
    const hit = hits[index]
    if (hit) {
      const line = hit.matches[0]?.line
      go(line ? asCodeLineHref(hit.id, line) : `/components/${encodeURIComponent(hit.id)}`)
    } else {
      go(globalSearchHref(input))
    }
  }

  // Focus stays in the field (aria-activedescendant), so this only fires if an option gets focus some other way.
  function onOptionKeyDown(e: React.KeyboardEvent<HTMLDivElement>, index: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(index)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && optionCount) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % optionCount)
    } else if (e.key === 'ArrowUp' && optionCount) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? optionCount - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && showPanel) choose(active)
      else go(globalSearchHref(input))
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else inputRef.current?.blur()
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`
  const total = search.data?.totalComponents ?? 0

  return (
    <div ref={rootRef} className="relative" data-spotlight="as-code-search">
      <div className="relative hidden md:block">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Global search"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          title="Global search — searches every component's configuration"
          placeholder="Global search…"
          autoComplete="off"
          spellCheck={false}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-9 w-52 rounded-md border border-input bg-background pl-9 pr-7 text-sm placeholder:text-muted-foreground focus-visible:w-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-[width] [&::-webkit-search-cancel-button]:hidden"
        />
        {!input && (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            /
          </kbd>
        )}
      </div>
      {/* Narrow screens: no room for a field — the magnifier opens the full page. */}
      <button
        type="button"
        aria-label="Global search"
        onClick={() => void navigate('/search')}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground md:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Global search results"
          className="absolute right-0 top-full z-50 mt-1 w-[32rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {search.isError ? (
            <p className="px-3 py-2 text-sm text-destructive">{(search.error as Error).message}</p>
          ) : search.isPending || (search.isFetching && !search.data) ? (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No active component mentions “{debounced.trim()}”.</p>
          ) : (
            hits.map((hit, i) => {
              const m = hit.matches[0]
              return (
                <div
                  key={hit.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={active === i}
                  tabIndex={-1}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  onKeyDown={(e) => onOptionKeyDown(e, i)}
                  onMouseEnter={() => setActive(i)}
                  className={cn('cursor-pointer px-3 py-2', active === i && 'bg-accent text-accent-foreground')}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{hit.componentKey}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {hit.matchCount} {hit.matchCount === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                  {m && (
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      <span className="mr-2 tabular-nums">{m.line}</span>
                      {highlightRanges(m.text, m.ranges ?? [])}
                    </div>
                  )}
                </div>
              )
            })
          )}
          <div
            id={optionId(hits.length)}
            role="option"
            aria-selected={active === hits.length}
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(hits.length)}
            onKeyDown={(e) => onOptionKeyDown(e, hits.length)}
            onMouseEnter={() => setActive(hits.length)}
            className={cn(
              'flex cursor-pointer items-center justify-between border-t px-3 py-2 text-sm',
              active === hits.length ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="flex flex-col">
              <span className="text-foreground">
                {total > hits.length ? `See all ${total} results` : 'Open in Global search'}
              </span>
              <span className="text-xs">Extended search: regular expressions, archived components</span>
            </span>
            <kbd className="rounded border border-border bg-muted px-1.5 text-[10px] font-medium">↵</kbd>
          </div>
        </div>
      )}
    </div>
  )
}
