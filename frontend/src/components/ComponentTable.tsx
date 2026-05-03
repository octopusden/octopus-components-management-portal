import { Link } from 'react-router'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
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
import { cn } from '../lib/utils'
import type { ComponentSummary } from '../lib/types'

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
  columnHelper.accessor('system', {
    header: 'System',
    cell: ({ getValue }) => {
      const systems = getValue()
      if (!systems || systems.length === 0) return <span className="text-muted-foreground">—</span>
      return (
        <div className="flex flex-wrap gap-1">
          {systems.map((sys) => (
            <Badge key={sys} variant="secondary" className="text-xs">
              {sys}
            </Badge>
          ))}
        </div>
      )
    },
    enableSorting: false,
  }),
  columnHelper.accessor('productType', {
    header: 'Product Type',
    cell: ({ getValue }) => <span>{getValue() ?? '—'}</span>,
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

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: false,
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
