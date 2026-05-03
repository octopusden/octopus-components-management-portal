import { useState } from 'react'
import { Layout } from '../components/Layout'
import { AuditLogTable } from '../components/AuditLogTable'
import { AuditLogFilters, type AuditFilter } from '../components/AuditLogFilters'
import { Pagination } from '../components/Pagination'
import { InlineError } from '../components/ui/inline-error'
import { useRecentAuditLog } from '../hooks/useAuditLog'

export function AuditLogPage() {
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [filter, setFilter] = useState<AuditFilter>({})

  const { data, isLoading, error } = useRecentAuditLog({ page, size, filter })

  const handleSizeChange = (newSize: number) => {
    setSize(newSize)
    setPage(0)
  }

  // Reset to page 0 whenever the filter shape changes — staying on the
  // current page after a filter shrinks the result set lands the user on
  // an empty / out-of-bounds page.
  const handleFilterChange = (next: AuditFilter) => {
    setFilter(next)
    setPage(0)
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          {data && (
            <span className="text-sm text-muted-foreground">
              {data.totalElements} total entries
            </span>
          )}
        </div>

        <AuditLogFilters filter={filter} onChange={handleFilterChange} />

        {error && (
          <InlineError
            message={
              <>
                Failed to load audit log:{' '}
                {error instanceof Error ? error.message : String(error)}
              </>
            }
          />
        )}

        <AuditLogTable data={data?.content ?? []} isLoading={isLoading} />

        {data && data.totalElements > 0 && (
          <Pagination
            page={page}
            totalPages={data.totalPages}
            totalElements={data.totalElements}
            size={size}
            onPageChange={setPage}
            onSizeChange={handleSizeChange}
          />
        )}
      </div>
    </Layout>
  )
}
