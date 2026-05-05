import { Link } from 'react-router'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, Bug, GitBranch, Hammer, Database } from 'lucide-react'
import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Badge } from './ui/badge'
import { EmptyState } from './ui/empty-state'
import { SkeletonTable } from './ui/skeleton-table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { cn } from '../lib/utils'
import type { ComponentSummary, PortalLinks } from '../lib/types'
import { usePortalConfig } from '../hooks/useInfo'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData> {
    links?: PortalLinks | null
  }
}

interface ComponentTableProps {
  data: ComponentSummary[]
  isLoading: boolean
}

const columnHelper = createColumnHelper<ComponentSummary>()

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

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
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className="h-4 w-4" />
    </a>
  )
}

const columns = [
  columnHelper.accessor('name', {
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
        {column.getIsSorted() === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : column.getIsSorted() === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    ),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link
          to={`/components/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
        {row.original.displayName && (
          <span className="text-xs text-muted-foreground">{row.original.displayName}</span>
        )}
      </div>
    ),
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
    cell: ({ getValue }) => {
      const labels = getValue()
      if (!labels || labels.length === 0) return <span className="text-muted-foreground">—</span>
      const visible = labels.slice(0, 3)
      const overflow = labels.slice(3)
      return (
        <div className="flex flex-wrap gap-1">
          {visible.map((label, i) => (
            // Index-prefixed key — labels can legally repeat in the array (CRS dedup
            // is a soft contract; defending against duplicates here keeps React happy).
            <Badge key={`${i}-${label}`} variant="secondary" className="text-xs font-mono">
              {label}
            </Badge>
          ))}
          {overflow.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Badge is a <div>; make it keyboard-focusable so the tooltip
                    is reachable without a mouse, and label it for SR users. */}
                <Badge
                  variant="outline"
                  className="text-xs cursor-default focus:outline-none focus:ring-2 focus:ring-ring"
                  tabIndex={0}
                  role="button"
                  aria-label={`Show ${overflow.length} more label${overflow.length === 1 ? '' : 's'}`}
                >
                  +{overflow.length}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{overflow.join(', ')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )
    },
    enableSorting: false,
  }),
  columnHelper.display({
    id: 'links',
    header: 'Links',
    cell: ({ row, table }) => {
      const { name, jiraProjectKey, vcsPath } = row.original
      const linksConfig = table.options.meta?.links
      const jiraBaseUrl = linksConfig?.jiraBaseUrl ?? undefined
      const gitBaseUrl = linksConfig?.gitBaseUrl ?? undefined
      const tcBaseUrl = linksConfig?.tcBaseUrl ?? undefined
      const dmsBaseUrl = linksConfig?.dmsBaseUrl ?? undefined
      const links: IconLinkProps[] = []
      if (jiraBaseUrl && jiraProjectKey) {
        links.push({
          href: `${jiraBaseUrl}/browse/${jiraProjectKey}`,
          label: `Jira: ${jiraProjectKey}`,
          icon: Bug,
        })
      }
      if (gitBaseUrl && vcsPath) {
        links.push({
          href: `${gitBaseUrl}/${vcsPath}`,
          label: `Git: ${vcsPath}`,
          icon: GitBranch,
        })
      }
      if (tcBaseUrl) {
        // Component name is the URL slug for TC/DMS — encode to survive
        // characters that aren't allowed in raw URL paths. Jira/Git use
        // server-validated keys (projectKey / vcsPath) and don't need it.
        links.push({
          href: `${tcBaseUrl}/${encodeURIComponent(name)}`,
          label: `TeamCity: ${name}`,
          icon: Hammer,
        })
      }
      if (dmsBaseUrl) {
        links.push({
          href: `${dmsBaseUrl}/${encodeURIComponent(name)}`,
          label: `DMS: ${name}`,
          icon: Database,
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

export function ComponentTable({ data, isLoading }: ComponentTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const { data: portalConfig } = usePortalConfig()

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false,
    meta: { links: portalConfig?.links },
  })

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <SkeletonTable rows={8} cols={columns.length} />
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
              <TableCell colSpan={columns.length} className="p-0">
                <EmptyState message="No components found" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    // Single TooltipProvider wraps the table so per-cell Tooltip instances
    // (labels overflow) share one context — instantiating a Provider per
    // cell adds noticeable React work on long lists.
    <TooltipProvider>
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
    </TooltipProvider>
  )
}
