import { useParams, useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Save, Trash2, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Layout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { GeneralTab, type GeneralFormValues } from '../components/editor/GeneralTab'
import { BuildTab } from '../components/editor/BuildTab'
import { VcsTab } from '../components/editor/VcsTab'
import { DistributionTab } from '../components/editor/DistributionTab'
import { JiraTab } from '../components/editor/JiraTab'
import { EscrowTab } from '../components/editor/EscrowTab'
import { FieldOverrides } from '../components/editor/FieldOverrides'
import { ComponentHistoryTab } from '../components/editor/ComponentHistoryTab'
import { useComponent, useUpdateComponent, useDeleteComponent, type ComponentUpdateRequest } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { ApiError } from '../lib/api'
import { describeOptimisticConflict } from '../lib/conflict'
import { useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import type { ComponentDetail } from '../lib/types'

export type UpdateMutation = UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>

export function ComponentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const { data: component, isLoading, error } = useComponent(id ?? '')
  const updateMutation = useUpdateComponent(id ?? '')
  const deleteMutation = useDeleteComponent(id ?? '')

  const form = useForm<GeneralFormValues>({
    defaultValues: {
      name: '',
      displayName: '',
      componentOwner: '',
      productType: '',
      system: '',
      clientCode: '',
      solution: false,
      archived: false,
      parentComponentName: '',
    },
  })

  async function handleSave() {
    if (!component) return
    const values = form.getValues()

    const systemArray = values.system
      ? values.system.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    // `archived` is gated server-side by ARCHIVE_COMPONENTS (a permission
    // ROLE_REGISTRY_EDITOR does not hold). Send it only when the user actually
    // toggled it — otherwise a plain rename/owner/system edit from a non-admin
    // would trip the archive guard with 403.
    const archivedChanged = values.archived !== component.archived

    // `name` is gated server-side by RENAME_COMPONENTS (same role gap as
    // archive). The Name input is disabled in the UI for users without it
    // (GeneralTab.tsx), but defence in depth: only send `name` when it
    // actually changed, regardless of permission. A trimmed-blank or
    // whitespace-only name would 400, and "unchanged" carries no semantic
    // meaning so undefined is the right wire shape.
    const trimmedName = values.name.trim()
    const nameChanged = trimmedName !== '' && trimmedName !== component.name
    const renameField = nameChanged ? trimmedName : undefined

    // parentComponentName: blank input clears the field (JSON Merge Patch null);
    // an unchanged value means "don't touch" (undefined). Anything else sets it.
    const trimmedParent = values.parentComponentName.trim()
    const currentParent = component.parentComponentName ?? ''
    const parentComponentName: string | null | undefined =
      trimmedParent === currentParent
        ? undefined
        : trimmedParent === ''
          ? null
          : trimmedParent

    try {
      await updateMutation.mutateAsync({
        version: component.version,
        name: renameField,
        displayName: values.displayName || undefined,
        componentOwner: values.componentOwner || undefined,
        productType: values.productType || undefined,
        system: systemArray,
        clientCode: values.clientCode || undefined,
        solution: values.solution,
        archived: archivedChanged ? values.archived : undefined,
        parentComponentName,
      })
      toast({ title: 'Component saved', description: 'Changes have been saved successfully.' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Optimistic-locking conflict (B7.1.6). Two things matter for UX:
        //   1) The cached ComponentDetail is stale — refetch so the next
        //      render shows the actual server state. Without this the user could
        //      keep clicking Save against the same stale @Version and keep getting
        //      409s.
        //   2) The toast message names *what* and *when*, where "when" is the
        //      server's post-conflict updatedAt — i.e. the timestamp of the OTHER
        //      person's commit. We use refetchQueries here (not invalidateQueries)
        //      because invalidate only marks the cache stale and resolves once
        //      the next observer re-subscribes — getQueryData would still see the
        //      old snapshot. refetchQueries waits for the actual network round-trip
        //      so getQueryData below sees the new value.
        await queryClient.refetchQueries({ queryKey: ['component', id ?? ''], type: 'active' })
        const latest = queryClient.getQueryData<ComponentDetail>(['component', id ?? ''])
        const { title, description } = describeOptimisticConflict(latest)
        toast({ title, description, variant: 'destructive' })
        return
      }
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync()
      toast({ title: 'Component deleted' })
      navigate('/components')
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
    setDeleteDialogOpen(false)
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      </Layout>
    )
  }

  if (error || !component) {
    return (
      <Layout>
        <div className="space-y-4">
          <Link
            to="/components"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Components
          </Link>
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Component not found.'}
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Link
              to="/components"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Components
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{component.name}</h1>
              <Badge variant={component.archived ? 'destructive' : 'secondary'}>
                {component.archived ? 'Archived' : 'Active'}
              </Badge>
              {component.solution && (
                <Badge variant="outline">Solution</Badge>
              )}
            </div>
            {component.displayName && (
              <p className="text-sm text-muted-foreground">{component.displayName}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs defaultValue="general">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="build">
              Build
              {component.buildConfigurations.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-xs">
                  {component.buildConfigurations.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="vcs">
              VCS
              {component.vcsSettings.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-xs">
                  {component.vcsSettings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="distribution">
              Distribution
              {component.distributions.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-xs">
                  {component.distributions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="jira">
              Jira
              {component.jiraComponentConfigs.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-xs">
                  {component.jiraComponentConfigs.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="escrow">
              Escrow
              {component.escrowConfigurations.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-xs">
                  {component.escrowConfigurations.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="overrides">Overrides</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="general">
              {/* key={component.id} forces a remount when the user navigates
                  between component detail pages without unmounting the route
                  (react-router can reuse the page instance). Without it the
                  internal state of ComponentSelect / PeopleInput would carry
                  the previous component's typed-but-unblurred input over to
                  the next component's form. */}
              <GeneralTab key={component.id} component={component} form={form} />
            </TabsContent>

            <TabsContent value="build">
              <BuildTab component={component} updateMutation={updateMutation} toast={toast} />
            </TabsContent>

            <TabsContent value="vcs">
              <VcsTab component={component} updateMutation={updateMutation} toast={toast} />
            </TabsContent>

            <TabsContent value="distribution">
              <DistributionTab component={component} updateMutation={updateMutation} toast={toast} />
            </TabsContent>

            <TabsContent value="jira">
              <JiraTab component={component} updateMutation={updateMutation} toast={toast} />
            </TabsContent>

            <TabsContent value="escrow">
              <EscrowTab component={component} updateMutation={updateMutation} toast={toast} />
            </TabsContent>

            <TabsContent value="overrides">
              <FieldOverrides componentId={component.id} />
            </TabsContent>

            <TabsContent value="history">
              <ComponentHistoryTab componentId={component.id} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Component
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{component.name}</span>?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
