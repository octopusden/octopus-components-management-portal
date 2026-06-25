import { Link } from 'react-router'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, Copy, Package } from 'lucide-react'
import { JiraIcon, BitbucketIcon, TeamCityIcon } from './ui/icons/brand-icons'
import { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Badge, badgeVariants } from './ui/badge'
import { Button } from './ui/button'
import { EmptyState } from './ui/empty-state'
import { SkeletonTable } from './ui/skeleton-table'
import { ValidationBadge } from './ValidationBadge'
import { cn, safeHttpUrl } from '../lib/utils'
import { formatAbsoluteDate } from '../lib/date'
import type { ComponentSummary, ComponentValidation, PortalLinks } from '../lib/types'
import { usePortalLinks } from '../hooks/useInfo'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData> {
    links?: PortalLinks | null
    onCopy?: (id: string) => void
    // Validation overlay: componentKey -> ComponentValidation. When provided
    // (admin only), the Name cell renders a red AlertTriangle before the name
    // for any component that has a validation issue; each row looks up its own
    // entry by component key (ComponentSummary.name). Absent (non-admin / empty
    // report) → no indicator anywhere.
    validationByComponent?: Map<string, ComponentValidation>
  }
}

interface ComponentTableProps {
  data: ComponentSummary[]
  isLoading: boolean
  /**
   * Per-row "copy component" action. The page passes the callback only when
   * the user holds CREATE_COMPONENTS — when absent the actions column is not
   * rendered at all, so permission gating stays at the page level.
   */
  onCopy?: (id: string) => void
  /**
   * Validation overlay: componentKey -> ComponentValidation. When provided
   * (admin only), each row with an issue shows a red AlertTriangle before its
   * name (click → full-list dialog). When omitted (non-admin / the report
   * failed to load) no indicator is rendered at all.
   */
  validationByComponent?: Map<string, ComponentValidation>
}

const columnHelper = createColumnHelper<ComponentSummary>()

// Thin alias kept so the column cell below reads the same; the formatting logic
// now lives in lib/date so RelativeTime's tooltip shares one source of truth.
const formatDate = formatAbsoluteDate

interface IconLinkProps {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

function IconLink({ href, label, icon: Icon }: IconLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      // Brand-color SVGs (Jira/Bitbucket/TC) keep their fill across themes,
      // so `hover:text-foreground` produced no visible change. Mirror the
      // prototype's affordance with opacity instead — works uniformly for
      // brand icons and the generic Package/DMS glyph.
      className="text-muted-foreground hover:opacity-80 transition-opacity"
    >
      <Icon className="h-4 w-4" />
    </a>
  )
}

/**
 * Labels cell with inline expand/collapse. Each row owns its own `expanded`
 * state — independent across rows. When labels overflow the 3-visible default
 * the cell renders a +N toggle that expands the chip list in place (row grows
 * vertically); the previous popover implementation was replaced because the
 * popover obscured adjacent rows and required focus-management that the user
 * found heavier-weight than inline expansion.
 */
function LabelsCell({ labels }: { labels: string[] | null | undefined }) {
  const [expanded, setExpanded] = useState(false)
  if (!labels || labels.length === 0) return <span className="text-muted-foreground">—</span>

  const overflowCount = labels.length - 3
  const showToggle = overflowCount > 0
  const visible = expanded ? labels : labels.slice(0, 3)

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((label, i) => (
        // Index-prefixed key — labels can legally repeat in the array (CRS
        // dedup is a soft contract; defending against duplicates keeps React happy).
        <Badge key={`${i}-${label}`} variant="secondary" className="text-xs font-mono">
          {label}
        </Badge>
      ))}
      {showToggle && (
        // Real <button> (not Badge: Badge renders a <div>, which is not
        // reliably Enter/Space-activatable across AT). Styled with
        // badgeVariants so the visual stays in sync with the surrounding chips.
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={cn(badgeVariants({ variant: 'outline' }), 'text-xs cursor-pointer')}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Show fewer labels (collapse to first 3 of ${labels.length})`
              : `Show all ${labels.length} labels`
          }
        >
          {expanded ? 'show less' : `+${overflowCount}`}
        </button>
      )}
    </div>
  )
}

const columns = [
  columnHelper.accessor('name', {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Component Key
        {column.getIsSorted() === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : column.getIsSorted() === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    ),
    cell: ({ row, table }) => {
      // Validation overlay (admin only): look the row up by component key
      // (ComponentSummary.name — the established CRS validation key). When the
      // map is absent (non-admin / empty report) or the component is clean,
      // ValidationBadge renders null, so nothing extra appears before the name.
      const validation = table.options.meta?.validationByComponent?.get(row.original.name)
      return (
        <div className="flex items-start gap-1.5">
          <ValidationBadge validation={validation} />
          <div className="flex flex-col">
            <Link
              to={`/components/${row.original.id}`}
              className="font-medium text-primary hover:underline"
            >
              {row.original.name}
            </Link>
            {/* displayName is nullable (null when no componentDisplayName); show the secondary
                line only when present AND distinct from the name (not a redundant echo). */}
            {row.original.displayName && row.original.displayName !== row.original.name && (
              <span className="text-xs text-muted-foreground">{row.original.displayName}</span>
            )}
          </div>
        </div>
      )
    },
    enableSorting: true,
  }),
  columnHelper.accessor('componentOwner', {
    header: 'Owner',
    cell: ({ getValue }) => <span>{getValue() ?? '—'}</span>,
    enableSorting: false,
  }),
  columnHelper.accessor('buildSystem', {
    header: 'Build System',
    cell: ({ getValue }) => {
      const bs = getValue()
      if (!bs) return <span className="text-muted-foreground">—</span>
      return (
        <Badge variant="secondary" className="text-xs font-mono">
          {bs}
        </Badge>
      )
    },
    enableSorting: false,
  }),
  columnHelper.accessor('labels', {
    header: 'Labels',
    cell: ({ getValue }) => <LabelsCell labels={getValue()} />,
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'links',
    header: 'Links',
    cell: ({ row, table }) => {
      const { name, jiraProjectKey, vcsPath, teamcityProjectUrl } = row.original
      const linksConfig = table.options.meta?.links
      const jiraBaseUrl = linksConfig?.jiraBaseUrl ?? undefined
      const gitBaseUrl = linksConfig?.gitBaseUrl ?? undefined
      const dmsBaseUrl = linksConfig?.dmsBaseUrl ?? undefined
      // tcBaseUrl from /portal/links is intentionally NOT used here — CRS PR-2
      // persists the full TC webUrl per component on `teamcityProjectUrl`, so
      // Portal renders the URL verbatim and does not template it. The runtime
      // config still ships `tcBaseUrl` for any future cross-project link.
      const links: IconLinkProps[] = []
      if (jiraBaseUrl && jiraProjectKey) {
        links.push({
          href: `${jiraBaseUrl}/browse/${jiraProjectKey}`,
          label: `Jira: ${jiraProjectKey}`,
          icon: JiraIcon,
        })
      }
      if (gitBaseUrl && vcsPath) {
        // vcsPath is the slash-joined Bitbucket project key + repo slug
        // (e.g. "creg/components-registry"). Bitbucket Server's browser-
        // friendly URL is /projects/<key>/repos/<repo>, not /<key>/<repo>.
        const slashIdx = vcsPath.indexOf('/')
        if (slashIdx > 0 && slashIdx < vcsPath.length - 1) {
          const projectKey = vcsPath.slice(0, slashIdx)
          const repoName = vcsPath.slice(slashIdx + 1)
          links.push({
            href: `${gitBaseUrl}/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoName)}`,
            label: `Bitbucket: ${vcsPath}`,
            icon: BitbucketIcon,
          })
        }
      }
      // TeamCity icon — gated only on the per-component `teamcityProjectUrl`
      // (the persisted webUrl). Independent of `tcBaseUrl` because the URL
      // is self-sufficient: CRS resolves projectId → webUrl during resync
      // and stores the result; Portal does NOT template it.
      // safeHttpUrl allowlists http/https before the URL reaches an <a href>
      // — prevents javascript: or data: URIs from being rendered as links.
      const safeTcUrl = safeHttpUrl(teamcityProjectUrl)
      if (safeTcUrl) {
        links.push({
          href: safeTcUrl,
          label: `TeamCity: ${name}`,
          icon: TeamCityIcon,
        })
      }
      if (dmsBaseUrl) {
        // DMS uses a query-string component selector, not a path segment.
        links.push({
          href: `${dmsBaseUrl}/?component=${encodeURIComponent(name)}`,
          label: `DMS: ${name}`,
          icon: Package,
        })
      }
      if (links.length === 0) return <span className="text-muted-foreground">—</span>
      return (
        <div className="flex items-center gap-2">
          {links.map((l) => (
            <IconLink key={l.label} {...l} />
          ))}
        </div>
      )
    },
    enableSorting: false,
  }),
  columnHelper.accessor('archived', {
    header: 'Status',
    cell: ({ getValue }) => {
      const archived = getValue()
      return (
        <Badge variant={archived ? 'destructive' : 'secondary'}>
          {archived ? 'Archived' : 'Active'}
        </Badge>
      )
    },
    enableSorting: false,
  }),
  columnHelper.accessor('updatedAt', {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Updated
        {column.getIsSorted() === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : column.getIsSorted() === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground text-xs">{formatDate(getValue())}</span>
    ),
    enableSorting: true,
  }),
]

// Per-row Copy action — appended to `columns` only when the page provides an
// `onCopy` callback (CREATE_COMPONENTS holders), so viewers never see the
// column. The handler travels via table meta like `links` does.
const actionsColumn = columnHelper.display({
  id: 'actions',
  header: '',
  cell: ({ row, table }) => {
    const onCopy = table.options.meta?.onCopy
    if (!onCopy) return null
    return (
      <Button
        variant="ghost"
        size="sm"
        title={`Create similar to ${row.original.name}`}
        aria-label={`Create similar to ${row.original.name}`}
        onClick={() => onCopy(row.original.id)}
      >
        <Copy className="h-4 w-4" />
      </Button>
    )
  },
  enableSorting: false,
})

export function ComponentTable({
  data,
  isLoading,
  onCopy,
  validationByComponent,
}: ComponentTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const { data: portalLinks } = usePortalLinks()

  const visibleColumns = useMemo(() => {
    const cols = [...columns]
    if (onCopy) cols.push(actionsColumn)
    return cols
  }, [onCopy])

  const table = useReactTable({
    data,
    columns: visibleColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false,
    meta: { links: portalLinks, onCopy, validationByComponent },
  })

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <SkeletonTable rows={8} cols={visibleColumns.length} />
        </Table>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={visibleColumns.length} className="p-0">
                <EmptyState message="No components found" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(header.column.getCanSort() && 'cursor-pointer select-none')}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className={cn(row.original.archived && 'opacity-50')}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
