/**
 * Shared stat-tile presentation used by both MigrationPanel and
 * MigrationHistoryPanel. Extracted so the two tiles visually match without
 * duplicating the styling.
 */
export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
