import { useState } from 'react'
import { Layout } from '../components/Layout'
import { ComponentFilters } from '../components/ComponentFilters'
import { ComponentTable } from '../components/ComponentTable'
import { Pagination } from '../components/Pagination'
import { CreateComponentButton } from '../components/CreateComponentDialog'
import { CopyComponentDialog } from '../components/CopyComponentDialog'
import { InlineError } from '../components/ui/inline-error'
import { useComponents } from '../hooks/useComponents'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '@/lib/auth'
import { ApiError } from '../lib/api'
import type { ComponentFilter } from '../lib/types'

export function ComponentListPage() {
  const [filter, setFilter] = useState<ComponentFilter>({ archived: false })
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  // Source component id for the per-row Copy action; non-null = dialog open.
  const [copySourceId, setCopySourceId] = useState<string | null>(null)

  const { data: user } = useCurrentUser()
  const { data, isLoading, error } = useComponents({ filter, page, size })

  const canCreate = hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)

  const handleFilterChange = (newFilter: ComponentFilter) => {
    setFilter(newFilter)
    setPage(0) // reset to first page on filter change
  }

  const handleSizeChange = (newSize: number) => {
    setSize(newSize)
    setPage(0)
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Components</h1>
            {data && (
              <span className="text-sm text-muted-foreground">
                {data.totalElements} total
              </span>
            )}
          </div>
          {canCreate && <CreateComponentButton />}
        </div>

        <ComponentFilters filter={filter} onFilterChange={handleFilterChange} />

        {error && (
          <InlineError
            message={
              error instanceof ApiError && error.status === 403 ? (
                <>You do not have permission to view components. Contact your administrator.</>
              ) : (
                <>
                  Failed to load components: {error instanceof Error ? error.message : String(error)}
                </>
              )
            }
          />
        )}

        <ComponentTable
          data={data?.content ?? []}
          isLoading={isLoading}
          onCopy={canCreate ? setCopySourceId : undefined}
        />

        {/* One dialog per page (not per row); keyed by source id so each
            Copy click gets a fresh fetch + Display Name prefill. */}
        {copySourceId && (
          <CopyComponentDialog
            key={copySourceId}
            sourceId={copySourceId}
            open
            onOpenChange={(open) => {
              if (!open) setCopySourceId(null)
            }}
          />
        )}

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
