import { useEffect, useRef } from 'react'
import { tokenizeLine, type TokenType } from '../../lib/asCodeHighlight'
import { cn } from '../../lib/utils'

// Atom "One Dark" — colors are theme tokens (--color-code-* in index.css).
const TOKEN_CLASS: Record<TokenType, string> = {
  header: 'text-code-header font-semibold',
  range: 'text-code-number font-semibold',
  property: 'text-code-property',
  string: 'text-code-string',
  enum: 'text-code-enum',
  keyword: 'text-code-keyword',
  number: 'text-code-number',
  plain: '',
}

// Line numbers come from a CSS counter on ::before, so they are neither selectable nor part of
// the text content (copying a selection yields just the code).
const LINE_CLASS =
  'relative block pl-14 pr-4 [counter-increment:line] ' +
  'before:absolute before:left-0 before:w-10 before:select-none before:text-right ' +
  'before:text-code-gutter before:content-[counter(line)]'

interface CodeBlockProps {
  code: string
  className?: string
  /** 1-based line to mark and scroll into view (e.g. an as-code search hit). */
  highlightLine?: number
}

/**
 * Read-only, syntax-highlighted view of the CRS "as-code" Groovy-style output, in a dark
 * One Dark pane with line numbers. Highlighting is done by the dependency-free
 * {@link tokenizeLine} tokenizer.
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
        'overflow-auto rounded-md border border-code-border bg-code-bg py-3 font-mono text-xs leading-relaxed text-code-fg',
        'selection:bg-code-line-highlight',
        className,
      )}
    >
      <code className="inline-block min-w-full [counter-reset:line]">
        {lines.map((line, i) => {
          const highlighted = highlightLine === i + 1
          return (
            <span
              key={i}
              ref={highlighted ? highlightedRef : undefined}
              data-highlighted={highlighted ? 'true' : undefined}
              className={cn(
                LINE_CLASS,
                highlighted && 'bg-code-line-highlight shadow-[inset_3px_0_0_var(--color-code-enum)]',
              )}
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
