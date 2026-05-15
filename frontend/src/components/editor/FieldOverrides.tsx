import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import {
  useFieldOverrides,
  useDeleteFieldOverride,
} from '../../hooks/useComponent'
import { EmptyState } from '../ui/empty-state'
import { SkeletonBlock } from '../ui/skeleton-block'
import { useToast } from '../../hooks/use-toast'
import type { FieldOverride } from '../../lib/types'
import { OverrideRowEditor } from './OverrideRowEditor'

interface FieldOverridesProps {
  componentId: string
}

export function FieldOverrides({ componentId }: FieldOverridesProps) {
  const { data: overrides, isLoading } = useFieldOverrides(componentId)
  const deleteMutation = useDeleteFieldOverride(componentId)
  const { toast } = useToast()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editingOverride, setEditingOverride] = useState<FieldOverride | undefined>(undefined)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  function openCreate() {
    setEditorMode('create')
    setEditingOverride(undefined)
    setEditorOpen(true)
  }

  function openEdit(override: FieldOverride) {
    setEditorMode('edit')
    setEditingOverride(override)
    setEditorOpen(true)
  }

  async function handleDelete(overrideId: string) {
    try {
      await deleteMutation.mutateAsync(overrideId)
      toast({ title: 'Override deleted' })
      setDeleteConfirm(null)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} height="h-9" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Field Overrides</h3>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Override
        </Button>
      </div>

      {!overrides || overrides.length === 0 ? (
        <div className="rounded-md border border-dashed">
          <EmptyState message="No field overrides defined." className="py-8" />
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attribute</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version Range</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((override) => {
                const isMarker = override.rowType === 'MARKER'
                return (
                  <TableRow key={override.id}>
                    <TableCell className="font-mono text-xs">{override.overriddenAttribute}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {override.rowType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{override.versionRange}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      {isMarker
                        ? <span className="text-muted-foreground italic">marker — edit to view children</span>
                        : typeof override.value === 'string'
                          ? override.value
                          : JSON.stringify(override.value)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(override)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(override.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Override row editor (create + edit) */}
      <OverrideRowEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        componentId={componentId}
        mode={editorMode}
        override={editingOverride}
      />

      {/* Delete confirm dialog */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Override</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this field override? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
