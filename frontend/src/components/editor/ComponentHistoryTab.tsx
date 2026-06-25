import { useState } from 'react'
import { AuditLogTable } from '../AuditLogTable'
import { useEntityAuditLog } from '../../hooks/useAuditLog'
import { Switch } from '../ui/switch'
import { Label } from '../ui/label'

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
 * variant. The duplicate "Entity Type" + "Component Key" columns are noise on
 * this page (they're constant `Component` + the page's own key) but trimming
 * them now would fork the table for a cosmetic win — that's a 7.2 polish
 * if we ever pick it up.
 *
 * The "Show migration" toggle surfaces the git-history baseline row
 * (`action = MIGRATED`), which CRS hides by default — one migration row per
 * component is noise on the day-to-day history view (SYS-049).
 */
export function ComponentHistoryTab({ componentId }: ComponentHistoryTabProps) {
  const [includeMigrated, setIncludeMigrated] = useState(false)
  const { data, isLoading } = useEntityAuditLog('Component', componentId, {
    page: 0,
    size: 50,
    includeMigrated,
  })
  const entries = data?.content ?? []
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="history-show-migration" className="text-sm font-normal text-muted-foreground">
          Show migration
        </Label>
        <Switch
          id="history-show-migration"
          aria-label="Show migration"
          checked={includeMigrated}
          onCheckedChange={setIncludeMigrated}
        />
      </div>
      <AuditLogTable data={entries} isLoading={isLoading} />
    </div>
  )
}
