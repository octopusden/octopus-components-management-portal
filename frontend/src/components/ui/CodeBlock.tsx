import { useEffect, useRef } from 'react'
import { tokenizeLine, type TokenType } from '../../lib/asCodeHighlight'
import { cn } from '../../lib/utils'

const TOKEN_CLASS: Record<TokenType, string> = {
  header: 'text-rose-600 dark:text-rose-400 font-semibold',
  property: 'text-sky-700 dark:text-sky-300',
  string: 'text-emerald-700 dark:text-emerald-400',
  enum: 'text-amber-700 dark:text-amber-400',
  keyword: 'text-purple-700 dark:text-purple-400',
  number: 'text-cyan-700 dark:text-cyan-400',
  plain: '',
}

interface CodeBlockProps {
  code: string
  className?: string
  /** 1-based line to mark and scroll into view (e.g. an as-code search hit). */
  highlightLine?: number
}

/**
 * Read-only, syntax-highlighted view of the CRS "as-code" Groovy-style output.
 * Highlighting is done by the dependency-free {@link tokenizeLine} tokenizer.
 */
export function CodeBlock({ code, className, highlightLine }: CodeBlockProps) {
  const lines = code.replace(/\n$/, '').split('\n')
  const highlightedRef = useRef<HTMLSpanElement>(null)

  // Scroll once the highlighted line exists, i.e. after the code has loaded. Optional call:
  // jsdom (unit tests) does not implement scrollIntoView.
  useEffect(() => {
    highlightedRef.current?.scrollIntoView?.({ block: 'center' })
  }, [code, highlightLine])

  return (
    <pre
      className={cn(
        'overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed',
        className,
      )}
    >
      <code>
        {lines.map((line, i) => {
          const highlighted = highlightLine === i + 1
          return (
            <span
              key={i}
              ref={highlighted ? highlightedRef : undefined}
              data-highlighted={highlighted ? 'true' : undefined}
              className={cn('block', highlighted && '-mx-3 bg-amber-100 px-3 dark:bg-amber-500/20')}
            >
              {tokenizeLine(line).map((token, j) => (
                <span key={j} className={TOKEN_CLASS[token.type]}>
                  {token.text}
                </span>
              ))}
            </span>
          )
        })}
      </code>
    </pre>
  )
}
