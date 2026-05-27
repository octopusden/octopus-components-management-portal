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
import { useSupportedGroups } from '../hooks/useSupportedGroups'
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
  // field-config registry key is `component.systems` to match the v4 DTO
  // field (plural). The legacy `component.system` key is migrated server-side.
  const { entry: systemFc, isLoading: systemFcLoading } = useFieldConfigEntry('component.systems')
  const { entry: clientCodeFc, isLoading: clientCodeFcLoading } =
    useFieldConfigEntry('component.clientCode')
  // SYS-039 FC entries
  const { entry: groupIdFc } = useFieldConfigEntry('component.groupId')
  const { entry: releaseManagerFc } = useFieldConfigEntry('component.releaseManager')
  const { entry: securityChampionFc } = useFieldConfigEntry('component.securityChampion')
  const { entry: copyrightFc } = useFieldConfigEntry('component.copyright')
  const { entry: releasesInDefaultBranchFc } = useFieldConfigEntry(
    'component.releasesInDefaultBranch',
  )
  const { entry: labelsFc } = useFieldConfigEntry('component.labels')
  // TC link restoration — manual override pair. Hidden FC visibility skips
  // both fields on save (see handleSave below).
  // ui-swift-sloth §3.5: pull the allowed groupId prefixes so the save guard
  // mirrors the inline render-side check. Empty list (loading/errored) skips
  // the prefix gate so a transient hook failure doesn't lock the user out
  // of saving an already-valid groupId.
  const supportedGroupsQuery = useSupportedGroups()
  const supportedGroupsList = supportedGroupsQuery.data ?? []
  const { entry: teamcityProjectIdFc } = useFieldConfigEntry('component.teamcityProjectId')
  const { entry: teamcityProjectUrlFc } = useFieldConfigEntry('component.teamcityProjectUrl')
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
      system: [],
      clientCode: '',
      solution: false,
      archived: false,
      parentComponentName: '',
      // SYS-039 — must match GeneralFormValues (no `?` modifier on those
      // fields). Without these defaults, an early Save (before useEffect
      // populates from `component`) would read `undefined` for labels and
      // friends and emit empty / wrong wire shapes.
      groupId: '',
      groupIsFake: false,
      releaseManager: '',
      securityChampion: '',
      copyright: '',
      releasesInDefaultBranch: false,
      labels: [],
      // schema-v2 list defaults — empty arrays so an early Save before useEffect
      // populates from `component` still produces a coherent form value.
      teamcityProjects: [],
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

  async function handleSave() {
    if (!component) return
    // Server-side errors set on a previous failed submit don't auto-clear
    // when the user fixes the input or when the next save succeeds (RHF
    // only clears errors on its own validation passes). Wipe them at the
    // start of each save so a successful retry doesn't leave stale red
    // text behind.
    form.clearErrors()

    // PR #44 P2 (systems): block save if the user emptied the Systems
    // multi-select. systems is REQUIRED server-side, and buildUpdateRequest
    // omits the field on empty (so we don't 400) — but that combination
    // means the server keeps the prior list while the user just clicked
    // "clear all". Surface the constraint inline so the user can recover
    // (pick a value) or revert (re-add the prior selection) instead of
    // walking away thinking their clear took.
    //
    // Gate semantics: compare form value against server `component.systems`
    // rather than RHF's `dirtyFields.system`. RHF doesn't mark an array
    // field dirty when setValue's new value equals defaultValues (and the
    // form default IS `[]`), so a clear-all flow leaves the dirty flag
    // false even though the user explicitly cleared the list. The
    // "server had systems, form has none" comparison captures the same
    // intent without depending on RHF's internals.
    //
    // Skip when field-config hides the field (admin can't fix it from the
    // form). The narrow pre-hydration race — server has systems, form is
    // still the `[]` default — fails closed: user re-clicks Save once
    // GeneralTab's useEffect mirrors the server state.
    if (systemFc.visibility !== 'hidden') {
      const systemValue = form.getValues('system') ?? []
      const priorSystems = component.systems ?? []
      if (priorSystems.length > 0 && systemValue.length === 0) {
        form.setError('system', {
          type: 'required',
          message: 'At least one system is required',
        })
        return
      }
    }

    // ui-swift-sloth §3.5: block the save if the user typed something into
    // Group Key that violates the contract — either by emptying a dirty
    // field, or by entering a value with a disallowed prefix. Both would
    // 400 server-side once the CRS strict contract lands.
    //
    // We deliberately only trip on a dirty field: an untouched empty form
    // (pre-hydration race, or admin saving another tab without ever
    // touching groupId) falls through, and buildGroupPatch's belt-and-
    // braces simply omits the group key — server-side PATCH semantics
    // keep the existing group untouched.
    if (groupIdFc.visibility !== 'hidden') {
      const trimmed = (form.getValues('groupId') ?? '').trim()
      const groupIdDirty = form.formState.dirtyFields.groupId === true
      if (groupIdDirty && trimmed === '') {
        form.setError('groupId', { type: 'required', message: 'Group Key is required' })
        return
      }
      // PR #44 comment (copilot-pull-request-reviewer, 2026-05-27): also
      // gate the prefix check on `groupIdDirty`. Legacy components with a
      // stored groupKey that doesn't match the current supported-prefix
      // list (admin reconfigured the list mid-life) must remain saveable
      // for unrelated field changes — otherwise the user can't fix a typo
      // in displayName without first updating the groupKey.
      if (groupIdDirty && trimmed !== '' && supportedGroupsList.length > 0) {
        const v = trimmed.toLowerCase()
        const ok = supportedGroupsList.some((p) => {
          const lp = p.toLowerCase()
          return v === lp || v.startsWith(lp + '.')
        })
        if (!ok) {
          form.setError('groupId', {
            type: 'prefix',
            message: `Group Key must start with one of: ${supportedGroupsList.join(', ')}`,
          })
          return
        }
      }
    }

    const request = buildUpdateRequest({
      component,
      values: form.getValues(),
      // Each FieldConfigEntry.visibility is optional in the type but the
      // hook falls back to 'editable' when the config row is missing, so
      // mirror the same default here for the (rare) case where data is
      // shaped without the visibility key set.
      visibilities: {
        displayName: displayNameFc.visibility ?? 'editable',
        componentOwner: componentOwnerFc.visibility ?? 'editable',
        systems: systemFc.visibility ?? 'editable',
        clientCode: clientCodeFc.visibility ?? 'editable',
        groupId: groupIdFc.visibility ?? 'editable',
        releaseManager: releaseManagerFc.visibility ?? 'editable',
        securityChampion: securityChampionFc.visibility ?? 'editable',
        copyright: copyrightFc.visibility ?? 'editable',
        releasesInDefaultBranch: releasesInDefaultBranchFc.visibility ?? 'editable',
        labels: labelsFc.visibility ?? 'editable',
        teamcityProjectId: teamcityProjectIdFc.visibility ?? 'editable',
        teamcityProjectUrl: teamcityProjectUrlFc.visibility ?? 'editable',
      },
      dirtyFields: {
        releasesInDefaultBranch: form.formState.dirtyFields.releasesInDefaultBranch === true,
        solution: form.formState.dirtyFields.solution === true,
        // system / labels: RHF's TS types model array-field dirtiness as
        // `boolean[] | undefined`, but at runtime setValue(..., {shouldDirty:
        // true}) flips a single boolean. We narrow through `unknown` so the
        // type system accepts the runtime contract; the === true check
        // ignores both `undefined` and any future partial-dirty array shape.
        system: (form.formState.dirtyFields.system as unknown) === true,
        // labels: close the RHF clear-all blind-spot (PR #44 follow-up).
        // RHF treats `setValue('labels', [])` as not-dirty when the form
        // default is also `[]` — so a user who unchecks every label gets
        // dirty=false even with shouldDirty:true. The chip UI uses
        // shouldTouch:true to flip `touchedFields.labels`, which gives us
        // a reliable "user interacted" signal independent of RHF's
        // value-equality dirty check.
        //
        // Synth-dirty fires when ALL of these hold:
        //   - field is not FC-hidden (admins who hid it can't fix the form),
        //   - user has touched the field (touchedFields.labels === true) —
        //     guards against the pre-hydration race where form is the []
        //     default and component.labels is non-empty,
        //   - server had labels (component.labels.length > 0),
        //   - form has no labels now (form.getValues('labels').length === 0).
        // The touched guard makes "fails closed" symmetric with the systems
        // race: if the user hasn't touched labels, no synth → no PATCH wipe.
        labels:
          (form.formState.dirtyFields.labels as unknown) === true ||
          (labelsFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.labels as unknown) === true &&
            (component.labels?.length ?? 0) > 0 &&
            (form.getValues('labels')?.length ?? 0) === 0),
        groupId: form.formState.dirtyFields.groupId === true,
        teamcityProjects: !!form.formState.dirtyFields.teamcityProjects,
        docs: !!form.formState.dirtyFields.docs,
        artifactIds: !!form.formState.dirtyFields.artifactIds,
      },
    })

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
                const firstSystem = component.systems?.[0]
                const buildSystem = baseRow?.build?.buildSystem
                const jiraProjectKey = baseRow?.jira?.projectKey
                return (
                  <>
                    {firstSystem && <Badge variant="outline">{firstSystem}</Badge>}
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
              {/* TeamCity quick-link — gated on the per-component webUrl
                  persisted by CRS PR-2. Same affordance/aria pattern as the
                  Jira and Bitbucket links above. The URL is rendered
                  verbatim; the SPA does NOT template it from tcBaseUrl.
                  safeHttpUrl allowlists http/https before the URL reaches
                  an <a href> — prevents javascript: or data: URIs. */}
              {(() => {
                // schema-v2: TC link moved to component.teamcityProjects[]; surface the first
                // row (matches ComponentSummaryResponse's derived list-view badge).
                const safeTcUrl = safeHttpUrl(component.teamcityProjects?.[0]?.projectUrl ?? null)
                if (!safeTcUrl) return null
                return (
                  <a
                    href={safeTcUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
                    title={`TeamCity: ${component.name}`}
                    aria-label={`TeamCity: ${component.name}`}
                  >
                    <TeamCityIcon className="h-4 w-4" />
                  </a>
                )
              })()}
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
              disabled={updateMutation.isPending || fieldConfigLoading}
              title={fieldConfigLoading ? 'Loading field configuration…' : undefined}
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
