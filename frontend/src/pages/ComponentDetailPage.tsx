import { useParams, useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Save, Trash2, AlertTriangle, ExternalLink, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Layout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { InlineError } from '../components/ui/inline-error'
import { SkeletonBlock } from '../components/ui/skeleton-block'
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
import { useCurrentUser } from '../hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '../lib/auth'
import { useFieldConfigEntry } from '../hooks/useFieldConfig'

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
  const { data: user } = useCurrentUser()

  const canArchive = hasPermission(user, PERMISSIONS.DELETE_COMPONENTS)
  const canUnarchive = hasPermission(user, PERMISSIONS.ARCHIVE_COMPONENTS)

  // Field-config visibility — used to filter hidden fields from the save payload.
  // Portal-side enforcement is required because CRS server-side does NOT filter
  // by field-config (ComponentManagementServiceImpl.kt:163 writes any field that
  // arrives in the request). Sending a hidden field would silently overwrite the
  // server value. See §7.0 critical contract #1 and #2.
  const { entry: displayNameFc } = useFieldConfigEntry('component.displayName')
  const { entry: componentOwnerFc } = useFieldConfigEntry('component.componentOwner')
  const { entry: systemFc } = useFieldConfigEntry('component.system')
  const { entry: clientCodeFc } = useFieldConfigEntry('component.clientCode')

  const jiraBaseUrl = import.meta.env.VITE_JIRA_BASE_URL as string | undefined
  const gitBaseUrl = import.meta.env.VITE_GIT_BASE_URL as string | undefined

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
        // displayName: hidden → undefined (no change); otherwise send value or undefined for empty
        displayName: displayNameFc.visibility === 'hidden' ? undefined : (values.displayName || undefined),
        // componentOwner: hidden → undefined
        componentOwner: componentOwnerFc.visibility === 'hidden' ? undefined : (values.componentOwner || undefined),
        // productType is rendered/saved from EscrowTab; do NOT send it from the General save
        // system: hidden → undefined (NOT [], which would wipe the server value via JSON merge-patch)
        system: systemFc.visibility === 'hidden' ? undefined : systemArray,
        // clientCode: hidden → undefined
        clientCode: clientCodeFc.visibility === 'hidden' ? undefined : (values.clientCode || undefined),
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

  async function handleArchive() {
    try {
      await deleteMutation.mutateAsync()
      toast({ title: 'Component archived', description: 'The component has been archived.' })
      navigate('/components')
    } catch (err) {
      toast({
        title: 'Archive failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
    setDeleteDialogOpen(false)
  }

  async function handleUnarchive() {
    if (!component) return
    try {
      await updateMutation.mutateAsync({ version: component.version, archived: false })
      toast({ title: 'Component unarchived', description: 'The component has been restored.' })
    } catch (err) {
      toast({
        title: 'Unarchive failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <SkeletonBlock height="h-8" width="w-48" />
          <SkeletonBlock height="h-4" width="w-64" />
          <SkeletonBlock height="h-64" width="w-full" />
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
          <InlineError
            message={error instanceof Error ? error.message : 'Component not found.'}
          />
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
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{component.name}</h1>
              <Badge variant={component.archived ? 'destructive' : 'secondary'}>
                {component.archived ? 'Archived' : 'Active'}
              </Badge>
              {component.solution && (
                <Badge variant="outline">Solution</Badge>
              )}
              {/* Breadcrumb badges: system + build system */}
              {component.system.length > 0 && (
                <Badge variant="outline">{component.system[0]}</Badge>
              )}
              {component.buildConfigurations[0]?.buildSystem && (
                <Badge variant="outline">{component.buildConfigurations[0].buildSystem}</Badge>
              )}
              {/* Quick-links: Jira and Git */}
              {jiraBaseUrl && component.jiraComponentConfigs[0]?.projectKey && (
                <a
                  href={`${jiraBaseUrl}/browse/${component.jiraComponentConfigs[0].projectKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  title={`Jira: ${component.jiraComponentConfigs[0].projectKey}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {gitBaseUrl && component.vcsSettings[0]?.entries[0]?.vcsPath && (
                <a
                  href={`${gitBaseUrl}/${component.vcsSettings[0].entries[0].vcsPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  title={`Git: ${component.vcsSettings[0].entries[0].vcsPath}`}
                >
                  <GitBranch className="h-4 w-4" />
                </a>
              )}
            </div>
            {component.displayName && (
              <p className="text-sm text-muted-foreground">{component.displayName}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Archive / Unarchive — permission-gated, not just disabled */}
            {!component.archived && canArchive && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Archive
              </Button>
            )}
            {component.archived && canUnarchive && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnarchive}
                disabled={updateMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Unarchive
              </Button>
            )}
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
        <Tabs defaultValue="general" variant="underline">
          <TabsList className="flex-wrap gap-1">
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

      {/* Archive confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Archive Component
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to archive <span className="font-semibold text-foreground">{component.name}</span>?
            This will archive the component. You can restore it later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
