import { TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import { SkeletonBlock } from './skeleton-block'

export interface SkeletonTableProps {
  /** Number of body rows to render. Default: 8. */
  rows?: number
  /** Number of columns. Required — caller must match its real column count. */
  cols: number
  /** Whether to render a skeleton TableHeader row. Default: true. */
  showHeader?: boolean
}

/**
 * Loading-state placeholder that emits `<TableHeader>` + `<TableBody>` so
 * the consumer keeps full control of the outer `<Table>` wrapper and any
 * surrounding container styling (`rounded-md border`, etc.).
 *
 * Body cell widths intentionally vary (`60% / 73% / 86% / 99% / 60% ...`)
 * so the loading state doesn't look like a uniform grid; matches the
 * pattern previously inlined in ComponentTable.
 *
 * `data-testid="skeleton-table"` on the body so visual specs can wait
 * on it without ambiguity (multiple `skeleton-block` children would
 * otherwise need disambiguation).
 */
export function SkeletonTable({ rows = 8, cols, showHeader = true }: SkeletonTableProps) {
  return (
    <>
      {showHeader && (
        <TableHeader>
          <TableRow>
            {Array.from({ length: cols }).map((_, i) => (
              <TableHead key={i}>
                <SkeletonBlock height="h-4" width="w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      )}
      <TableBody data-testid="skeleton-table">
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: cols }).map((_, j) => (
              <TableCell key={j}>
                <SkeletonBlock
                  height="h-4"
                  width=""
                  style={{ width: `${60 + ((j * 13) % 40)}%` }}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </>
  )
}
