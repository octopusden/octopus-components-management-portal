import { useState, useEffect } from 'react'
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
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '../../lib/auth'
import type { FieldOverride } from '../../lib/types'
import { OverrideRowEditor } from './OverrideRowEditor'
import { OverridesTimeline } from './OverridesTimeline'

interface FieldOverridesProps {
  componentId: string
}

/**
 * Neutral, read-only one-line summary of a marker override's children. The API
 * already returns `markerChildren`, so we render the actual child identifiers
 * inline rather than forcing the user to open the editor — important for
 * read-only viewers who never open the edit dialog. (The full structured view
 * is also available on the "As Code" tab.)
 */
function markerSummary(override: FieldOverride): string {
  const mc = override.markerChildren
  if (!mc) return 'marker'
  const join = (xs: Array<string | null | undefined>) => xs.filter((x): x is string => !!x).join(', ')
  switch (override.overriddenAttribute) {
    case 'vcs.settings':
      return join((mc.vcsEntries ?? []).map((e) => e.name?.trim() || e.vcsPath)) || 'vcs settings'
    case 'distribution.maven':
      return join((mc.mavenArtifacts ?? []).map((a) => `${a.groupPattern}:${a.artifactPattern}`)) || 'maven'
    case 'distribution.fileUrl':
      return join((mc.fileUrlArtifacts ?? []).map((a) => a.url)) || 'file urls'
    case 'distribution.docker':
      return join((mc.dockerImages ?? []).map((a) => (a.flavor ? `${a.imageName}:${a.flavor}` : a.imageName))) || 'docker'
    case 'distribution.packages':
      return join((mc.packages ?? []).map((a) => `${a.packageType} ${a.packageName}`)) || 'packages'
    case 'build.requiredTools':
      return join(mc.requiredTools ?? []) || 'required tools'
    default:
      return 'marker'
  }
}

export function FieldOverrides({ componentId }: FieldOverridesProps) {
  const { data: overrides, isLoading } = useFieldOverrides(componentId)
  const deleteMutation = useDeleteFieldOverride(componentId)
  const { toast } = useToast()
  // This raw edit surface (add / edit / delete, incl. marker editing) is an
  // admin-tier escape hatch — regular users edit scalars inline on the
  // parameter tabs. Non-admins get a read-only audit view. Gated on EDIT_METADATA
  // (ROLE_ADMIN). Intentionally stricter than the backend, which now allows a
  // component's owner/RM/SC to call the same field-override endpoints — this panel
  // stays admin-only as a UI convenience, not a security boundary.
  const { data: user } = useCurrentUser()
  const canAdmin = hasPermission(user, PERMISSIONS.EDIT_METADATA)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editingOverride, setEditingOverride] = useState<FieldOverride | undefined>(undefined)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // If permissions are downgraded mid-session (a background /auth/me refetch
  // returns a non-admin user), close any open edit dialogs so their state
  // can't resurface should admin be re-granted later.
  useEffect(() => {
    if (!canAdmin) {
      setEditorOpen(false)
      setDeleteConfirm(null)
    }
  }, [canAdmin])

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
        {canAdmin && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Override
          </Button>
        )}
      </div>

      {!overrides || overrides.length === 0 ? (
        <div className="rounded-md border border-dashed">
          <EmptyState message="No field overrides defined." className="py-8" />
        </div>
      ) : (
        <>
          {/* Version timeline above the table: one track per attribute, each
              override placed by its version range. Overlaps on one attribute
              render destructive with a disjoint-rule banner. */}
          <OverridesTimeline overrides={overrides} />
          <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attribute</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version Range</TableHead>
                <TableHead>Value</TableHead>
                {canAdmin && <TableHead className="w-24">Actions</TableHead>}
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
                    <TableCell
                      className="font-mono text-xs max-w-[200px] truncate"
                      title={isMarker ? markerSummary(override) : undefined}
                    >
                      {isMarker
                        ? markerSummary(override)
                        : typeof override.value === 'string'
                          ? override.value
                          : JSON.stringify(override.value)}
                    </TableCell>
                    {canAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Edit override"
                            onClick={() => openEdit(override)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label="Delete override"
                            onClick={() => setDeleteConfirm(override.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      {/* Edit surfaces are admin-only; non-admins never reach these. */}
      {canAdmin && (
        <>
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
        </>
      )}
    </div>
  )
}
