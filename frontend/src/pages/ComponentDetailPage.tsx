import { useParams, useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Save, Trash2, AlertTriangle } from 'lucide-react'
import { JiraIcon, BitbucketIcon, TeamCityIcon } from '../components/ui/icons/brand-icons'
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
import { GeneralTab, type GeneralFormValues, GENERAL_TAB_FIELDS } from '../components/editor/GeneralTab'
import { buildUpdateRequest } from '../lib/component/buildUpdateRequest'
import { BuildTab } from '../components/editor/BuildTab'
import { VcsTab } from '../components/editor/VcsTab'
import { DistributionTab } from '../components/editor/DistributionTab'
import { JiraTab } from '../components/editor/JiraTab'
import { EscrowTab } from '../components/editor/EscrowTab'
import { FieldOverrides } from '../components/editor/FieldOverrides'
import { ConfigurationsTab } from '../components/editor/ConfigurationsTab'
import { ComponentHistoryTab } from '../components/editor/ComponentHistoryTab'
import { useComponent, useUpdateComponent, useDeleteComponent, type ComponentUpdateRequest } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { ApiError } from '../lib/api'
import { useOptimisticConflict } from '../hooks/useOptimisticConflict'
import { type UseMutationResult } from '@tanstack/react-query'
// queryClient + describeOptimisticConflict were moved into
// useOptimisticConflict — the hook owns refetch + toast-shape composition.
import type { ComponentDetail } from '../lib/types'
import { selectBaseRow } from '../lib/api/baseRow'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '../lib/auth'
import { useFieldConfigEntry } from '../hooks/useFieldConfig'
import { parseServerFieldErrors } from '../lib/serverErrors'
import { usePortalLinks } from '../hooks/useInfo'
import { safeHttpUrl } from '../lib/utils'

export type UpdateMutation = UseMutationResult<ComponentDetail, Error, ComponentUpdateRequest>

export function ComponentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const handleConflict = useOptimisticConflict(id)
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
  const { entry: displayNameFc, isLoading: displayNameFcLoading } =
    useFieldConfigEntry('component.displayName')
  const { entry: componentOwnerFc, isLoading: componentOwnerFcLoading } =
    useFieldConfigEntry('component.componentOwner')
  // CRS PR #301: scalar `component.system` field-config key (renamed
  // from plural `component.systems` along with the DTO collapse).
  const { entry: systemFc, isLoading: systemFcLoading } = useFieldConfigEntry('component.system')
  const { entry: clientCodeFc, isLoading: clientCodeFcLoading } =
    useFieldConfigEntry('component.clientCode')
  // SYS-039 FC entries
  const { entry: releaseManagerFc } = useFieldConfigEntry('component.releaseManager')
  const { entry: securityChampionFc } = useFieldConfigEntry('component.securityChampion')
  const { entry: copyrightFc } = useFieldConfigEntry('component.copyright')
  const { entry: canBeParentFc } = useFieldConfigEntry('component.canBeParent')
  const { entry: labelsFc } = useFieldConfigEntry('component.labels')
  // Race-guard: while field-config is still loading, every FC entry falls
  // back to visibility='editable', which would let a fast-clicking user
  // overwrite hidden/readonly fields with form defaults before the real
  // policy arrives. All useFieldConfigEntry calls share the same
  // underlying useFieldConfig query, so any one loading flag implies all
  // are loading — checking the four pre-SYS-039 entries is sufficient.
  // Save button is disabled until at least one entry resolves.
  const fieldConfigLoading =
    displayNameFcLoading || componentOwnerFcLoading || systemFcLoading || clientCodeFcLoading

  const { data: portalLinks } = usePortalLinks()
  const jiraBaseUrl = portalLinks?.jiraBaseUrl ?? undefined
  const gitBaseUrl = portalLinks?.gitBaseUrl ?? undefined

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
      // SYS-039 — must match GeneralFormValues (no `?` modifier on those
      // fields). Without these defaults, an early Save (before useEffect
      // populates from `component`) would read `undefined` for labels and
      // friends and emit empty / wrong wire shapes.
      canBeParent: false,
      // Multi-value people lists — default [] (mirrors labels). An early Save
      // before useEffect hydrates from `component` reads [] here; the dirty-
      // gate in the dirtyFields assembly below blocks that from clobbering
      // server data.
      releaseManager: [],
      securityChampion: [],
      copyright: '',
      labels: [],
      // schema-v2 list defaults — empty arrays so an early Save before useEffect
      // populates from `component` still produces a coherent form value.
      docs: [],
      artifactIds: [],
    },
  })

  // RHF v7's formState is a lazy proxy: dirtyFields / touchedFields only
  // populate if a render-time read subscribes to them. handleSave runs
  // outside the render path, so reading form.formState.dirtyFields there
  // would silently return `{}`. Touch the proxy properties during render
  // so the in-handleSave reads see live data. Confirmed behaviour, not
  // micro-optimisation: without this, the systems guard's
  // form.formState.dirtyFields.system === true check and the labels
  // synth-dirty's form.formState.touchedFields.labels === true check
  // would both always be false at handleSave time. `void` keeps TS happy
  // about the otherwise-unused expressions.
  void form.formState.dirtyFields
  void form.formState.touchedFields
  // Subscribe to form VALUES too (not just dirty/touched flags) so the Save
  // dirty-gate below recomputes as the user edits and after GeneralTab's
  // useEffect hydrates the form from the server — `setValue` during hydration
  // doesn't flip a dirty flag, so without a value subscription the gate would
  // stay stuck on the pre-hydration snapshot.
  void form.watch()

  // Assemble the General-tab PATCH from current form + server snapshot + FC
  // visibility. Shared by handleSave (the actual write) and the render-time
  // dirty gate below so the two never disagree about what counts as a change.
  function buildPatchRequest(): ComponentUpdateRequest | null {
    if (!component) return null
    return buildUpdateRequest({
      component,
      values: form.getValues(),
      visibilities: {
        displayName: displayNameFc.visibility ?? 'editable',
        componentOwner: componentOwnerFc.visibility ?? 'editable',
        system: systemFc.visibility ?? 'editable',
        clientCode: clientCodeFc.visibility ?? 'editable',
        releaseManager: releaseManagerFc.visibility ?? 'editable',
        securityChampion: securityChampionFc.visibility ?? 'editable',
        copyright: copyrightFc.visibility ?? 'editable',
        canBeParent: canBeParentFc.visibility ?? 'editable',
        labels: labelsFc.visibility ?? 'editable',
      },
      dirtyFields: {
        solution: form.formState.dirtyFields.solution === true,
        system: form.formState.dirtyFields.system === true,
        labels:
          (form.formState.dirtyFields.labels as unknown) === true ||
          (labelsFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.labels as unknown) === true &&
            (component.labels?.length ?? 0) > 0 &&
            (form.getValues('labels')?.length ?? 0) === 0),
        releaseManager:
          (form.formState.dirtyFields.releaseManager as unknown) === true ||
          (releaseManagerFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.releaseManager as unknown) === true &&
            (component.releaseManager?.length ?? 0) > 0 &&
            (form.getValues('releaseManager')?.length ?? 0) === 0),
        securityChampion:
          (form.formState.dirtyFields.securityChampion as unknown) === true ||
          (securityChampionFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.securityChampion as unknown) === true &&
            (component.securityChampion?.length ?? 0) > 0 &&
            (form.getValues('securityChampion')?.length ?? 0) === 0),
        docs: !!form.formState.dirtyFields.docs,
        artifactIds: !!form.formState.dirtyFields.artifactIds,
      },
    })
  }

  // Save-button dirty gate (Portal companion to SYS-048). The header Save
  // governs ONLY the General tab — the other tabs own their own save — so the
  // gate reflects whether the General form carries a real change. It is built
  // purely from RHF's own dirty/touched signals and MUST NOT dereference
  // `component` (e.g. via buildUpdateRequest): doing so at render once crashed
  // the whole /components/{id} page when the API omitted an optional collection.
  // RHF leaves dirty=false when an array field is cleared back to its empty
  // default, so a real clear-all of a server-populated list is detected via
  // touched + server-had + now-empty (mirrors buildUpdateRequest's synth). The
  // system-required-clear case keeps Save enabled so the inline "System is
  // required" error still surfaces on click.
  const arrayClearedToEmpty = (
    field: 'labels' | 'releaseManager' | 'securityChampion',
    hidden: boolean,
    serverLen: number,
  ): boolean =>
    !hidden &&
    (form.formState.touchedFields[field] as unknown) === true &&
    serverLen > 0 &&
    (form.getValues(field)?.length ?? 0) === 0
  const systemClearNeedsAttention =
    systemFc.visibility !== 'hidden' &&
    (component?.system ?? '') !== '' &&
    ((form.getValues('system') as string | undefined) ?? '') === ''
  const hasUnsavedChanges =
    form.formState.isDirty ||
    systemClearNeedsAttention ||
    arrayClearedToEmpty('labels', labelsFc.visibility === 'hidden', component?.labels?.length ?? 0) ||
    arrayClearedToEmpty('releaseManager', releaseManagerFc.visibility === 'hidden', component?.releaseManager?.length ?? 0) ||
    arrayClearedToEmpty('securityChampion', securityChampionFc.visibility === 'hidden', component?.securityChampion?.length ?? 0)

  async function handleSave() {
    if (!component) return
    // Defence-in-depth for the Save dirty-gate: the button is already disabled
    // when there's nothing to save, but bail here too so any non-click trigger
    // can't fire a no-op PATCH (and a misleading "saved" toast). The system-
    // required-clear case keeps hasUnsavedChanges true, so its inline error
    // still surfaces below.
    if (!hasUnsavedChanges) return
    // Server-side errors set on a previous failed submit don't auto-clear
    // when the user fixes the input or when the next save succeeds (RHF
    // only clears errors on its own validation passes). Wipe them at the
    // start of each save so a successful retry doesn't leave stale red
    // text behind.
    form.clearErrors()

    // System is REQUIRED server-side (CRS PR #301 keeps the not-null
    // constraint, just renamed). buildUpdateRequest omits the field on
    // empty (so we don't 400), but that combination means the server
    // keeps the prior value while the user just cleared the dropdown.
    // Surface the constraint inline so the user can recover or revert
    // instead of walking away thinking their clear took.
    //
    // Gate semantics: compare form value against the server's
    // `component.system` rather than RHF's `dirtyFields.system`. RHF
    // doesn't mark the field dirty when setValue's new value equals the
    // form default ('' here), so a clear-then-save flow can leave the
    // dirty flag false. The "server had a system, form has none"
    // comparison captures the user intent without depending on RHF
    // internals.
    //
    // Skip when field-config hides the field (admin can't fix it from
    // the form). The narrow pre-hydration race — server has a system,
    // form is still the `''` default — fails closed: user re-clicks
    // Save once GeneralTab's useEffect mirrors the server state.
    if (systemFc.visibility !== 'hidden') {
      const systemValue = (form.getValues('system') as string | undefined) ?? ''
      const priorSystem = component.system ?? ''
      if (priorSystem !== '' && systemValue === '') {
        form.setError('system', {
          type: 'required',
          message: 'System is required',
        })
        return
      }
    }

    // Group Key is now server-derived + read-only (items 1/2) — no group save
    // guard. canBeParent invariants are enforced server-side; their 400s map
    // inline via GENERAL_TAB_FIELDS below.

    const request = buildPatchRequest()
    if (!request) return

    try {
      await updateMutation.mutateAsync(request)
      toast({ title: 'Component saved', description: 'Changes have been saved successfully.' })
    } catch (err) {
      // Optimistic-locking 409 (B7.1.6) — useOptimisticConflict refetches
      // the component and returns the toast options; null means "not a 409,
      // fall through to other branches".
      const conflict = await handleConflict(err)
      if (conflict) {
        toast({ ...conflict, variant: 'destructive' })
        return
      }
      if (err instanceof ApiError && err.status === 400) {
        const fieldErrors = parseServerFieldErrors(err.rawBody)
        let anyFieldMapped = false
        for (const [field, message] of fieldErrors) {
          // Only set errors for fields owned by GeneralTab; fields from other
          // tabs (buildConfiguration, vcsSettings, …) arrive in the same 400
          // but should not pollute GeneralTab's form state.
          if ((GENERAL_TAB_FIELDS as ReadonlyArray<string>).includes(field)) {
            form.setError(field as keyof GeneralFormValues, { type: 'server', message })
            anyFieldMapped = true
          }
        }
        // Known gap: mixed 400 with both GeneralTab and other-tab field
        // errors silently drops the non-tab errors here. Acceptable while
        // CRS update validations don't combine cross-tab violations in
        // one response; revisit when a shared-error-mapping helper lands.
        if (anyFieldMapped) return
        // No field mapped → fall through to generic toast so the error is still surfaced.
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
      await updateMutation.mutateAsync({ version: component.version, clearGroup: false, archived: false })
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
              {/* Breadcrumb badges: system + build system (schema-v2: read from BASE row). */}
              {(() => {
                const baseRow = selectBaseRow(component)
                const system = component.system
                const buildSystem = baseRow?.build?.buildSystem
                const jiraProjectKey = baseRow?.jira?.projectKey
                return (
                  <>
                    {system && <Badge variant="outline">{system}</Badge>}
                    {buildSystem && <Badge variant="outline">{buildSystem}</Badge>}
                    {/* Quick-links: Jira (Atlassian) and Bitbucket. aria-label mirrors
                        the title so screen readers announce the icon-only link's
                        destination — using brand-specific names so the cue matches
                        the icon a sighted user sees. */}
                    {jiraBaseUrl && jiraProjectKey && (
                      <a
                        href={`${jiraBaseUrl}/browse/${jiraProjectKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
                        title={`Jira: ${jiraProjectKey}`}
                        aria-label={`Jira: ${jiraProjectKey}`}
                      >
                        <JiraIcon className="h-4 w-4" />
                      </a>
                    )}
                  </>
                )
              })()}
              {(() => {
                const vcsPath = selectBaseRow(component)?.vcsEntries[0]?.vcsPath
                if (!gitBaseUrl || !vcsPath) return null
                const slashIdx = vcsPath.indexOf('/')
                if (slashIdx <= 0 || slashIdx >= vcsPath.length - 1) return null
                const projectKey = vcsPath.slice(0, slashIdx)
                const repoName = vcsPath.slice(slashIdx + 1)
                const href = `${gitBaseUrl}/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoName)}`
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
                    title={`Bitbucket: ${vcsPath}`}
                    aria-label={`Bitbucket: ${vcsPath}`}
                  >
                    <BitbucketIcon className="h-4 w-4" />
                  </a>
                )
              })()}
              {/* TeamCity quick-links — one icon per project with a valid http(s)
                  URL (safeHttpUrl allowlists the scheme). Read-only header links;
                  the edit form no longer manages TeamCity projects (item 6). */}
              {(component.teamcityProjects ?? [])
                .map((tc) => ({ tc, url: safeHttpUrl(tc.projectUrl ?? null) }))
                .filter((x) => x.url)
                .map(({ tc, url }) => (
                  <a
                    key={tc.id}
                    href={url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
                    title={`TeamCity: ${tc.projectId}`}
                    aria-label={`TeamCity: ${tc.projectId}`}
                  >
                    <TeamCityIcon className="h-4 w-4" />
                  </a>
                ))}
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
              disabled={updateMutation.isPending || fieldConfigLoading || !hasUnsavedChanges}
              title={
                fieldConfigLoading
                  ? 'Loading field configuration…'
                  : !hasUnsavedChanges
                    ? 'No changes to save'
                    : undefined
              }
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
            {(() => {
              // schema-v2: counts derived from the BASE row. Build/Jira/Escrow are
              // 0-or-1 (presence of the aspect); VCS counts vcsEntries; Distribution
              // sums the four typed families + component-level securityGroups[].
              const baseRow = selectBaseRow(component)
              const vcsCount = baseRow?.vcsEntries.length ?? 0
              const distCount =
                (baseRow?.mavenArtifacts.length ?? 0) +
                (baseRow?.fileUrlArtifacts.length ?? 0) +
                (baseRow?.dockerImages.length ?? 0) +
                (baseRow?.packages.length ?? 0)
              const buildPresent = baseRow?.build ? 1 : 0
              const jiraPresent = baseRow?.jira ? 1 : 0
              const escrowPresent = baseRow?.escrow ? 1 : 0
              const tabBadge = (n: number) =>
                n > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-xs">
                    {n}
                  </span>
                )
              return (
                <>
                  <TabsTrigger value="build">Build{tabBadge(buildPresent)}</TabsTrigger>
                  <TabsTrigger value="vcs">VCS{tabBadge(vcsCount)}</TabsTrigger>
                  <TabsTrigger value="distribution">Distribution{tabBadge(distCount)}</TabsTrigger>
                  <TabsTrigger value="jira">Jira{tabBadge(jiraPresent)}</TabsTrigger>
                  <TabsTrigger value="escrow">Escrow{tabBadge(escrowPresent)}</TabsTrigger>
                </>
              )
            })()}
            <TabsTrigger value="configurations">
              Configurations
              {(() => {
                const n = component.configurations?.length ?? 0
                return n > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted-foreground/20 px-1.5 text-xs">{n}</span>
                )
              })()}
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

            <TabsContent value="configurations">
              <ConfigurationsTab component={component} />
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
