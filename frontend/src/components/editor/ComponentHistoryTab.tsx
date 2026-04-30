import { AuditLogTable } from '../AuditLogTable'
import { useEntityAuditLog } from '../../hooks/useAuditLog'

interface ComponentHistoryTabProps {
  componentId: string
}

/**
 * History tab on the component detail page (B7.1.2). Reads the per-component
 * audit feed from `GET /rest/api/4/audit/Component/{id}`. The entity-type
 * literal `Component` is intentional: it must match the value
 * `ComponentManagementServiceImpl` writes when it publishes `AuditEvent`s
 * (see CRS technical-design.md §6.4 and AuditLogFilterTest fixture).
 *
 * We deliberately reuse `AuditLogTable` rather than minting a per-component
 * variant. The duplicate "Entity Type" + "Entity ID" columns are noise on
 * this page (they're constant `Component` + the page's id) but trimming
 * them now would fork the table for a cosmetic win — that's a 7.2 polish
 * if we ever pick it up.
 */
export function ComponentHistoryTab({ componentId }: ComponentHistoryTabProps) {
  const { data, isLoading } = useEntityAuditLog('Component', componentId, { page: 0, size: 50 })
  const entries = data?.content ?? []
  return <AuditLogTable data={entries} isLoading={isLoading} />
}
