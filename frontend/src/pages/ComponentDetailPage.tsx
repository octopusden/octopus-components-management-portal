import { useParams, useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Copy, Trash2, AlertTriangle, LockKeyhole, Boxes, CircleCheck } from 'lucide-react'
import { JiraIcon, BitbucketIcon, TeamCityIcon } from '../components/ui/icons/brand-icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Layout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { StatusBanner } from '../components/ui/status-banner'
import { Separator } from '../components/ui/separator'
import { InlineError } from '../components/ui/inline-error'
import { SkeletonBlock } from '../components/ui/skeleton-block'
import { RelativeTime } from '../components/ui/RelativeTime'
import { Tabs, TabsContent } from '../components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { GeneralTab, type GeneralFormValues, GENERAL_TAB_FIELDS } from '../components/editor/GeneralTab'
import { DocumentationTab } from '../components/editor/DocumentationTab'
import { SolutionTab } from '../components/editor/SolutionTab'
import { HeaderLabelsEditor } from '../components/editor/HeaderLabelsEditor'
import { MiscTab, MISC_TAB_FIELDS } from '../components/editor/MiscTab'
import { ProducedArtifactsSection } from '../components/editor/ProducedArtifactsSection'
import { buildUpdateRequest } from '../lib/component/buildUpdateRequest'
import { BuildTab } from '../components/editor/BuildTab'
import { VcsTab } from '../components/editor/VcsTab'
import { DistributionTab } from '../components/editor/DistributionTab'
import { DockerImagesTab } from '../components/editor/DockerImagesTab'
import { JiraTab } from '../components/editor/JiraTab'
import { EscrowTab } from '../components/editor/EscrowTab'
import { useBuildSection } from '../components/editor/useBuildSection'
import { useVcsSection } from '../components/editor/useVcsSection'
import { useDistributionSection } from '../components/editor/useDistributionSection'
import { useJiraSection } from '../components/editor/useJiraSection'
import { useEscrowSection } from '../components/editor/useEscrowSection'
import { useSupportedVersionsSection } from '../components/editor/useSupportedVersionsSection'
import { generalSlice } from '../components/editor/generalSlice'
import { combineRequest, collectDiff, anyDirty } from '../lib/editor/combineRequest'
import { isFieldDirty } from '../lib/editor/dirtyField'
import { SaveBar } from '../components/editor/SaveBar'
import { ReviewChangesDialog } from '../components/editor/ReviewChangesDialog'
import type { ConfirmMeta } from '../components/editor/ReviewChangesDialog'
import { UnsavedChangesGuard } from '../components/editor/UnsavedChangesGuard'
import { completenessPercent } from '../lib/component/completeness'
import { CANNOT_EDIT_TITLE } from '../components/editor/editPermission'
import { WhoCanEditPanel } from '../components/editor/WhoCanEditPanel'
import { FieldOverrides } from '../components/editor/FieldOverrides'
import { OverridesDraftProvider } from '../components/editor/overridesDraft'
import { useOverridesSection } from '../components/editor/useOverridesSection'
import { ConfigurationsTab } from '../components/editor/ConfigurationsTab'
import { SupportedVersionsTab } from '../components/editor/SupportedVersionsTab'
import { AsCodeTab } from '../components/editor/AsCodeTab'
import { ComponentHistoryTab } from '../components/editor/ComponentHistoryTab'
import { EditorSidebarNav, type EditorNavSection } from '../components/editor/EditorSidebarNav'
import { ValidationProblemsList } from '../components/ValidationProblemsList'
import { TeamCityValidationsTab } from '../components/TeamCityValidationsTab'
import { EmptyState } from '../components/ui/empty-state'
import { useComponent, useUpdateComponent, useDeleteComponent, useFieldOverrides } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { ApiError } from '../lib/api'
import { useOptimisticConflict } from '../hooks/useOptimisticConflict'
import type { ComponentDetail } from '../lib/types'
import { countOwnershipIssues, fromArtifactId } from '../lib/artifactOwnership'
import { findUnsupportedGroupId } from '../lib/groupValidation'
import { isVcsHostSupported } from '../lib/vcsHost'
import { useSupportedGroups } from '../hooks/useSupportedGroups'
import { selectBaseRow } from '../lib/api/baseRow'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { hasPermission, PERMISSIONS } from '../lib/auth'
import { useAdminMode } from '../lib/adminModeStore'
import { useFieldConfigEntry, isFieldEditableFor } from '../hooks/useFieldConfig'
import { useFieldConfig } from '../hooks/useAdminConfig'
import { parseServerFieldErrors } from '../lib/serverErrors'
import { usePortalLinks, usePortalConfig } from '../hooks/useInfo'
import { useLabelsDictionary } from '../hooks/useLabelsDictionary'
import { isSolutionCandidate } from '../lib/solutionKey'
import { cn, safeHttpUrl } from '../lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/ui/tooltip'
import { getTeamCityValidationStatusTone } from '../lib/teamcityValidationTypes'
import { useValidationProblems } from '../hooks/useValidationProblems'
import { allProblemVersions, hasValidationIssue, validationBadgeCount } from '../lib/validation'
import { copyToClipboard } from '../lib/clipboard'

function EditSurface({
  canEdit,
  label,
  children,
}: {
  canEdit: boolean
  label: string
  children: ReactNode
}) {
  return (
    <fieldset
      aria-label={`${label} fields`}
      className="m-0 min-w-0 border-0 p-0"
      disabled={!canEdit}
    >
      {children}
    </fieldset>
  )
}

// Server component → RHF General/Misc form values. The single source of truth
// for hydrating the page-level form, used both by the on-id-change reset effect
// (P1-1: GeneralTab may be unmounted at navigation time, so hydration cannot
// live only inside GeneralTab) and by Discard. Mirrors GeneralTab's mapping.
function mapComponentToForm(component: ComponentDetail): GeneralFormValues {
  return {
    name: component.name,
    displayName: component.displayName ?? '',
    componentOwner: component.componentOwner ?? '',
    productType: component.productType ?? '',
    systems: component.systems ?? [],
    clientCode: component.clientCode ?? '',
    solution: component.solution ?? false,
    archived: component.archived,
    parentComponentName: component.parentComponentName ?? '',
    canBeParent: component.canBeParent ?? false,
    releaseManager: component.releaseManager ?? [],
    securityChampion: component.securityChampion ?? [],
    copyright: component.copyright ?? '',
    labels: component.labels ?? [],
    docs: (component.docs ?? []).map((d) => ({ docComponentKey: d.docComponentKey, majorVersion: d.majorVersion ?? '' })),
    artifactIds: (component.artifactIds ?? []).map(fromArtifactId),
  }
}

// Maps a server 400 field error (or a tab section) to the sidebar section that
// should auto-switch into view. Identifiers match the Phase 3a nav values.
function sectionForField(field: string): string | null {
  // Produced Artifacts render on the Build tab (its form state stays in the
  // General form), so route an artifactIds 400 there — not General. Checked
  // first because `artifactIds` is deliberately absent from GENERAL_TAB_FIELDS.
  if (field === 'artifactIds' || field.startsWith('artifactIds')) return 'build'
  // Explicit / External classification toggles moved to the General tab's
  // Classification section (their state stays in useDistributionSection), so a
  // 400 on those routes to General — checked before the generic distribution* rule.
  if (field === 'distributionExplicit' || field === 'distributionExternal') return 'general'
  if ((GENERAL_TAB_FIELDS as ReadonlyArray<string>).includes(field)) return 'general'
  if ((MISC_TAB_FIELDS as ReadonlyArray<string>).includes(field)) return 'misc'
  if (field.startsWith('build')) return 'build'
  if (field.startsWith('vcs')) return 'vcs'
  if (field.startsWith('jira')) return 'jira'
  if (field.startsWith('escrow') || field === 'productType') return 'escrow'
  // Docker images are their own tab now (split out of Distribution), so route a
  // docker 400 there — both the baseConfiguration `dockerImages` key and the
  // `distribution.docker*` marker/field paths — before the generic distribution rule.
  if (field === 'dockerImages' || field.startsWith('distribution.docker')) return 'docker'
  if (field.startsWith('distribution') || field === 'securityGroups') return 'distribution'
  // Doc links moved to their own Documentation topic — route a CRS `docs`/
  // `docs[i]...` 400 there so the user lands on the owning tab, not a bare toast.
  if (field === 'docs' || field.startsWith('docs')) return 'documentation'
  return null
}

/**
 * The editor body. Rendered INSIDE OverridesDraftProvider (see
 * ComponentDetailPage below) so it — and every override surface — share one
 * draft instance; this is also where the section slices (incl. the override
 * slice) are assembled into the ONE combined save.
 */
function ComponentDetailEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const handleConflict = useOptimisticConflict(id)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Persistent save-time conflict message shown in the Review dialog (value 409s
  // like an overlapping/duplicate range) — survives the auto-dismissing toast.
  const [reviewError, setReviewError] = useState<string | null>(null)
  // Inline (projectKey, versionPrefix) uniqueness-conflict shown under the Jira
  // Project Key field after a value-409 on a save that changed the jira pair.
  const [jiraConflict, setJiraConflict] = useState<string | null>(null)
  // Controlled tab so a server 400 on a field that lives on a non-active tab can
  // auto-switch to the owning tab (otherwise the inline error renders on a hidden tab).
  const [activeTab, setActiveTab] = useState('general')
  // GeneralTab's owner PeopleInput commits a typed value only after its async
  // directory lookup resolves. Hold Save while that is in flight.
  const [ownerValidating, setOwnerValidating] = useState(false)

  const { data: component, isLoading, error } = useComponent(id ?? '')
  const updateMutation = useUpdateComponent(id ?? '')
  const deleteMutation = useDeleteComponent(id ?? '')
  const { data: user } = useCurrentUser()

  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)

  const { byComponent: validationByComponent } = useValidationProblems(isAdmin)
  const componentValidation = component ? validationByComponent.get(component.name) : undefined
  const hasProblems =
    isAdmin && componentValidation != null && hasValidationIssue(componentValidation)

  // Same tone logic as the teamcity-projects-list block below, rolled up
  // across all of the component's TeamCity projects — drives the
  // "Validations > TeamCity" sidebar item's red/warning treatment. Admin-only,
  // purely derived from data already on `component` (no extra query).
  const teamCityIssueCount = isAdmin
    ? (component?.teamcityProjects ?? []).reduce((total, tc) => {
        const tones = (tc.validations ?? []).map((v) => getTeamCityValidationStatusTone(v.status))
        return total + tones.filter((t) => t === 'destructive' || t === 'warning').length
      }, 0)
    : 0

  useEffect(() => {
    // Whole Validations section (TeamCity + Unregistered Release) is admin-only.
    if (!isAdmin && (activeTab === 'teamcity-validations' || activeTab === 'unregistered-release')) {
      setActiveTab('general')
    }
  }, [activeTab, isAdmin])

  const canArchive = hasPermission(user, PERMISSIONS.DELETE_COMPONENTS)
  const canUnarchive = hasPermission(user, PERMISSIONS.ARCHIVE_COMPONENTS)
  const canCreate = hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)
  const canEdit = component?.canEdit ?? hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)

  // Field-config visibility — used to filter hidden fields from the save payload.
  const { entry: displayNameFc, isLoading: displayNameFcLoading } =
    useFieldConfigEntry('component.displayName')
  const { entry: componentOwnerFc, isLoading: componentOwnerFcLoading } =
    useFieldConfigEntry('component.componentOwner')
  const { entry: systemFc, isLoading: systemFcLoading } = useFieldConfigEntry('component.system')
  const { entry: clientCodeFc, isLoading: clientCodeFcLoading } =
    useFieldConfigEntry('component.clientCode')
  const { entry: releaseManagerFc } = useFieldConfigEntry('component.releaseManager')
  const { entry: securityChampionFc } = useFieldConfigEntry('component.securityChampion')
  const { entry: copyrightFc } = useFieldConfigEntry('component.copyright')
  const { entry: canBeParentFc } = useFieldConfigEntry('component.canBeParent')
  const { entry: labelsFc } = useFieldConfigEntry('component.labels')
  // Section send-gating visibilities (Jira / Escrow).
  const { entry: releasesInDefaultBranchFc } = useFieldConfigEntry('component.releasesInDefaultBranch')
  const { entry: productTypeFc } = useFieldConfigEntry('component.productType')
  // Raw field-config blob → per-user effective editability for the jira slice's
  // payload-gating (P-1 omitNonEditable). User-agnostic blob + current user.
  const { data: fieldConfigData } = useFieldConfig()
  const isJiraFieldEditable = (fieldPath: string) => isFieldEditableFor(fieldConfigData, fieldPath, user)
  const fieldConfigLoading =
    displayNameFcLoading || componentOwnerFcLoading || systemFcLoading || clientCodeFcLoading

  const { data: portalLinks } = usePortalLinks()
  const jiraBaseUrl = portalLinks?.jiraBaseUrl ?? undefined
  const gitBaseUrl = portalLinks?.gitBaseUrl ?? undefined
  // Solution toggle is offered as its own sidebar topic ONLY for a component
  // whose key matches a service-config pattern; otherwise `solution` stays
  // server-owned (header badge/banner). Patterns come from /portal/config.
  const { data: portalConfig } = usePortalConfig()
  const { entry: solutionFc } = useFieldConfigEntry('component.solution')
  // Labels editor moved to the header (badges + popover). The dictionary powers
  // the ChipsInput picker; 404/501 → [] (handled by the hook).
  const labelsDict = useLabelsDictionary()

  // Supported groupId prefixes (CRS rule #10) feed the distribution/ownership
  // group checks; the bitbucket host (gitBaseUrl) feeds the VCS-host check.
  // Both fail-open when unavailable — CRS stays authoritative on save.
  const { groups: supportedGroups } = useSupportedGroups()

  const form = useForm<GeneralFormValues>({
    defaultValues: {
      name: '',
      displayName: '',
      componentOwner: '',
      productType: '',
      systems: [],
      clientCode: '',
      solution: false,
      archived: false,
      parentComponentName: '',
      canBeParent: false,
      releaseManager: [],
      securityChampion: [],
      copyright: '',
      labels: [],
      docs: [],
      artifactIds: [],
    },
  })

  // Subscribe RHF's lazy formState proxy + values so the in-handleSave reads see
  // live data and the render-time dirty gate recomputes on edit / after hydration.
  void form.formState.dirtyFields
  void form.formState.touchedFields
  void form.watch()

  // Offer the Solution topic only for a solution-key component AND when the
  // field isn't hidden by field-config. 'readonly' still shows the tab (with a
  // disabled switch) so the flag is visible where it's edited. The candidate
  // check reads the LIVE form key (with a fallback to the server value before
  // hydration) so a RENAME_COMPONENTS user who renames to a solution key sees
  // the topic — and can set the flag — in the same edit session, not only after
  // a save + refetch.
  const solutionKeyName = form.watch('name') || component?.name
  const showSolutionToggle =
    isSolutionCandidate(solutionKeyName, portalConfig?.solutionKeyPatterns) &&
    solutionFc.visibility !== 'hidden'

  // The Solution topic is conditional (key-pattern gated); if it's not offered —
  // or stops being offered after config loads / the component / key changes —
  // never leave the user stranded on an empty tab.
  useEffect(() => {
    if (activeTab === 'solution' && !showSolutionToggle) {
      setActiveTab('general')
    }
  }, [activeTab, showSolutionToggle])

  // P1-1: re-hydrate the page-level RHF form when the component id CHANGES to a
  // DIFFERENT id — independent of which tab is mounted. GeneralTab's own
  // mount-effect only fires while it is mounted, so navigating A→B from a
  // non-General tab would otherwise leave the form holding A's name/owner/parent
  // and build a spurious patch against B (even a rename B→A). Keyed on id (not
  // the component object) so a same-id sibling-save setQueryData does NOT
  // form.reset over an in-progress General edit. The FIRST load is intentionally
  // skipped (we only record the id): GeneralTab is the default-mounted tab and
  // owns initial hydration incl. its touched-not-dirty interactions (e.g. the
  // labels clear-all signal), which a reset here would stomp.
  const hydratedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!component) return
    const prevId = hydratedIdRef.current
    if (prevId === component.id) return
    hydratedIdRef.current = component.id
    if (prevId === null) return // first load — GeneralTab hydrates on mount
    form.reset(mapComponentToForm(component))
    form.clearErrors()
    // `form` is a stable RHF ref (never changes identity); listed for
    // exhaustive-deps lint only — the id ref-compare is the real gate.
  }, [component, form])

  // ── Section state hooks (the five ex-useState tabs). Each owns its local
  // state + last-saved snapshot and contributes a payload slice + dirty flag.
  // A non-loaded component renders a skeleton before any hook is read, but the
  // hooks must be called unconditionally (rules of hooks) — feed a stable empty
  // shell until the data arrives.
  const shell = component ?? EMPTY_COMPONENT
  const buildSection = useBuildSection(shell)
  const vcsSection = useVcsSection(shell)
  const distributionSection = useDistributionSection(shell)
  // EFFECTIVE (outgoing) BASE build system = the Build section's DRAFT value, so
  // the Jira Skip Commit Check Whiskey rule reacts to an unsaved Build-tab switch
  // in the same combined save (Codex #151 P1), not just the persisted component.
  const effectiveBuildSystem = buildSection.state.buildSystem
  const jiraSection = useJiraSection(shell, {
    releasesInDefaultBranch: releasesInDefaultBranchFc.visibility ?? 'editable',
    isFieldEditable: isJiraFieldEditable,
    effectiveBuildSystem,
  })
  const escrowSection = useEscrowSection(shell, {
    productType: productTypeFc.visibility ?? 'editable',
  })
  // Field-overrides slice — draft lives in OverridesDraftProvider (wraps this
  // component), so this just projects it into a SectionSlice like the others.
  const overridesSection = useOverridesSection()
  // Supported-versions (coverage) draft. NOT a PATCH slice — it persists via a
  // separate PUT (endpoint off the combined-PATCH contract) — so it feeds the
  // page dirty flag + Review diff directly and is saved inside runCombinedSave
  // after the PATCH. Seeded from shell.id so the hook is called unconditionally.
  const supportedVersionsSection = useSupportedVersionsSection(shell.id)

  // ── General/Misc slice (RHF touched-not-dirty gate, preserved verbatim) ──
  function buildPatchRequest() {
    if (!component) return null
    return buildUpdateRequest({
      component,
      values: form.getValues(),
      visibilities: {
        displayName: displayNameFc.visibility ?? 'editable',
        componentOwner: componentOwnerFc.visibility ?? 'editable',
        systems: systemFc.visibility ?? 'editable',
        clientCode: clientCodeFc.visibility ?? 'editable',
        releaseManager: releaseManagerFc.visibility ?? 'editable',
        securityChampion: securityChampionFc.visibility ?? 'editable',
        copyright: copyrightFc.visibility ?? 'editable',
        canBeParent: canBeParentFc.visibility ?? 'editable',
        labels: labelsFc.visibility ?? 'editable',
        solution: solutionFc.visibility ?? 'editable',
      },
      dirtyFields: {
        solution: form.formState.dirtyFields.solution === true,
        // `systems` is a multi-value array field — same dirty shape as labels
        // (isFieldDirty handles RHF's collapsed-boolean-or-array form; the
        // second branch keeps the clear-all case value-compare can't see).
        systems:
          isFieldDirty(form.formState.dirtyFields.systems) ||
          (systemFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.systems as unknown) === true &&
            ((component.systems?.length ?? 0) > 0) &&
            ((form.getValues('systems')?.length ?? 0) === 0)),
        displayName:
          form.formState.dirtyFields.displayName === true ||
          form.formState.touchedFields.displayName === true,
        // componentOwner / clientCode / copyright: pass "interacted" (dirty OR touched) like
        // displayName so buildUpdateRequest's value-compare catches a clear back to '' (RHF's
        // clear-to-default blind-spot) while a pristine/pre-hydration form omits the field.
        componentOwner:
          form.formState.dirtyFields.componentOwner === true ||
          form.formState.touchedFields.componentOwner === true,
        clientCode:
          form.formState.dirtyFields.clientCode === true ||
          form.formState.touchedFields.clientCode === true,
        copyright:
          form.formState.dirtyFields.copyright === true ||
          form.formState.touchedFields.copyright === true,
        // Array fields: isFieldDirty handles RHF's collapsed-boolean OR per-element-array
        // dirtyFields shape (the shape flips to array once any component subscribes
        // formState.isDirty — see dirtyField.ts). The second branch keeps the clear-all
        // case (touched + had-prior + now-empty) that buildUpdateRequest's value-compare
        // cannot see, because an emptied array equals the blank form default.
        labels:
          isFieldDirty(form.formState.dirtyFields.labels) ||
          (labelsFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.labels as unknown) === true &&
            ((component.labels?.length ?? 0) > 0) &&
            ((form.getValues('labels')?.length ?? 0) === 0)),
        releaseManager:
          isFieldDirty(form.formState.dirtyFields.releaseManager) ||
          (releaseManagerFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.releaseManager as unknown) === true &&
            ((component.releaseManager?.length ?? 0) > 0) &&
            ((form.getValues('releaseManager')?.length ?? 0) === 0)),
        securityChampion:
          isFieldDirty(form.formState.dirtyFields.securityChampion) ||
          (securityChampionFc.visibility !== 'hidden' &&
            (form.formState.touchedFields.securityChampion as unknown) === true &&
            ((component.securityChampion?.length ?? 0) > 0) &&
            ((form.getValues('securityChampion')?.length ?? 0) === 0)),
        docs: isFieldDirty(form.formState.dirtyFields.docs),
        artifactIds: isFieldDirty(form.formState.dirtyFields.artifactIds),
      },
    })
  }

  const pendingGeneralPatch = component ? buildPatchRequest() : null
  // P1-3: Build System is required when a BASE build aspect exists. Block the
  // save if it has been cleared to empty (server had one, draft is now blank).
  // `buildSystemMissing` = !draft.buildSystem.
  const serverBuildSystem = selectBaseRow(component ?? EMPTY_COMPONENT)?.build?.buildSystem ?? ''
  const buildSystemNeedsAttention =
    !!component && serverBuildSystem !== '' && buildSection.buildSystemMissing
  const genSlice = component
    ? generalSlice(component, pendingGeneralPatch)
    : { isDirty: false, request: {}, diff: [] }

  // ── Combine every section into ONE request + ONE diff + ONE dirty flag ──
  const slices = [
    genSlice,
    buildSection.slice,
    vcsSection.slice,
    distributionSection.slice,
    jiraSection.slice,
    escrowSection.slice,
    overridesSection.slice,
  ]
  // Supported-versions coverage lives on a separate PUT endpoint (not a PATCH
  // slice), so fold its dirty flag + diff into the page's unified pair here.
  const dirty = anyDirty(slices) || supportedVersionsSection.isDirty
  const diff = [...collectDiff(slices), ...supportedVersionsSection.diff]

  // Client-side artifact-ownership validity gate: block save while the editor shows unresolved
  // issues (invalid group, empty EXPLICIT, intra-component conflict, overlapping override ranges).
  // The server is the authoritative gate (400/409); this avoids a round-trip on a known-bad state.
  const ownershipIssues = countOwnershipIssues(form.watch('artifactIds') ?? [], supportedGroups)
  // groupId-prefix (CRS rule #10) and VCS-host validity gates, mirroring the
  // ownership gate above. Both skip when their source list is empty/absent.
  // Only count rows the request actually sends — cleanMaven drops a row unless
  // BOTH groupPattern and artifactPattern are non-blank, so a half-filled row
  // (bad group, no artifact yet) must not false-block an unrelated save.
  const mavenPrefixIssues = distributionSection.state.maven.filter(
    (m) =>
      m.groupPattern.trim() !== '' &&
      m.artifactPattern.trim() !== '' &&
      findUnsupportedGroupId(m.groupPattern, supportedGroups) !== undefined,
  ).length
  const vcsHostIssues = vcsSection.entries.filter(
    (e) => e.vcsPath.trim() !== '' && !isVcsHostSupported(e.vcsPath, gitBaseUrl),
  ).length

  function discardAll() {
    // Reset the RHF form to the COMPONENT's values (not the empty form
    // defaults) — resetting to defaults would clear multi-value fields (e.g.
    // systems=[]) against server data and leave the bar spuriously "dirty".
    // Same mapping as the on-id-change hydration effect (mapComponentToForm).
    if (component) {
      form.reset(mapComponentToForm(component))
    }
    buildSection.reset()
    vcsSection.reset()
    distributionSection.reset()
    jiraSection.reset()
    escrowSection.reset()
    overridesSection.reset()
    supportedVersionsSection.reset()
    form.clearErrors()
  }

  async function runCombinedSave(meta: ConfirmMeta = {}) {
    if (!component) return
    if (!canEdit || !dirty) return
    form.clearErrors()
    // Clear any prior conflict banner / inline jira conflict so a retry starts clean.
    setReviewError(null)
    setJiraConflict(null)

    // Build System is REQUIRED (P1-3). Clearing it would PATCH null = a CRS
    // no-op, so block and surface the Build section's inline required error.
    if (buildSystemNeedsAttention) {
      setActiveTab('build')
      buildSection.setBuildSystemTouched(true)
      return
    }

    // Change metadata (Jira task key + comment) is recorded on the audit row, not
    // the component — merge it onto the combined PATCH. Values arrive already
    // normalized (undefined when blank), so JSON.stringify omits them.
    const patchDirty = anyDirty(slices)
    const request = {
      ...combineRequest(component.version, slices),
      jiraTaskKey: meta.jiraTaskKey,
      changeComment: meta.changeComment,
    }

    try {
      // The combined PATCH fires only when a PATCH-backed section is dirty — a
      // supported-versions-only save must not send an (essentially empty) PATCH.
      if (patchDirty) {
        const saved = await updateMutation.mutateAsync(request)
        // Re-baseline the General/Misc form to the SAVED (server-normalized) component.
        // The GeneralTab re-hydration guard skips while the form is dirty/touched, so without
        // an explicit reset here the form would stay dirty for the rest of the session and a
        // later same-id refetch would never reflect a value CRS normalized on write. The
        // section hooks re-seed themselves via their snapshot deep-equal; only the RHF form
        // needs the nudge. (`if (saved)` keeps tests whose mutateAsync resolves undefined inert.)
        if (saved) {
          form.reset(mapComponentToForm(saved))
          form.clearErrors()
        }
      }
      // Supported-versions coverage persists via its OWN PUT (off the PATCH
      // contract), sequenced AFTER the PATCH. The hook re-seeds its draft to the
      // MERGED server response, so the tab reads clean once this resolves. The
      // change metadata rides along on this PUT too (variant B) — the SV endpoint
      // records it on the audit row, so a coverage-only save keeps the Jira key /
      // comment the user typed in the Review dialog.
      if (supportedVersionsSection.isDirty) {
        try {
          await supportedVersionsSection.save({
            jiraTaskKey: meta.jiraTaskKey,
            changeComment: meta.changeComment,
          })
        } catch (svErr) {
          // P2-1: the PUT failed. If a PATCH already persisted, the save is only
          // PARTLY done — the combined diff can't be safely re-edited (the PATCH is
          // committed, so its "from" values are stale), so reset the overrides for
          // the part that landed and surface the failure distinctly rather than as
          // a misleading generic "Save failed".
          if (patchDirty) {
            const msg = svErr instanceof Error ? svErr.message : String(svErr)
            overridesSection.reset()
            setReviewOpen(false)
            toast({
              title: 'Partly saved',
              description: `Your other changes were saved, but updating supported versions failed: ${msg}`,
              variant: 'destructive',
            })
            return
          }
          // Coverage-only failure: nothing else persisted, so defer to the shared
          // conflict / 400 / generic handling below. That keeps an in-place-fixable
          // value conflict (or a field-mapped 400) routed to its banner/section
          // instead of flattening every SV error to a generic toast.
          throw svErr
        }
      }
      // Clear the override draft after a successful save. The combined PATCH
      // persisted the desired set; useUpdateComponent invalidates
      // ['field-overrides', id], so OverridesDraftProvider re-seeds from the
      // refetched (authoritative) baseline and the section reads clean.
      // (For ~one tick — until that refetch settles — effectiveOverrides shows
      // the pre-save rows again; benign, the Overrides tab isn't in view here.)
      overridesSection.reset()
      setReviewOpen(false)
      toast({ title: 'Component saved', description: 'Changes have been saved successfully.' })
    } catch (err) {
      // 409 — split by kind. A `value` conflict (uniqueness / overlapping range)
      // is fixable in place, so keep the Review dialog open with a persistent
      // banner (plus a sticky toast) instead of closing and losing the diff. An
      // `optimistic` (stale-version) conflict has already refetched the latest
      // snapshot, so the open diff's "from" values are stale — close it and tell
      // the user to re-apply.
      const conflict = await handleConflict(err)
      if (conflict) {
        toast({ title: conflict.title, description: conflict.description, variant: 'destructive' })
        if (conflict.kind === 'value') {
          // Attribute a value-409 to the Jira (projectKey, versionPrefix) pair
          // ONLY when this save changed either AND the server message is about
          // that pair — the pair is edited on the Jira tab, not the Review
          // dialog, so surface it inline there and close the diff. A guard on the
          // message keeps an unrelated uniqueness conflict in a combined save
          // (e.g. a distribution GAV) from being misrouted to the Jira banner.
          // Every other value conflict stays a persistent Review-dialog banner
          // (fixable in place).
          const jServer = selectBaseRow(component)?.jira
          const jiraPairChanged =
            (jiraSection.state.projectKey || '') !== (jServer?.projectKey ?? '') ||
            (jiraSection.state.versionPrefix || '') !== (jServer?.versionPrefix ?? '')
          const looksLikeJiraConflict = /jira|project\s*key/i.test(conflict.description)
          if (jiraPairChanged && looksLikeJiraConflict) {
            setJiraConflict(conflict.description)
            setActiveTab('jira')
            setReviewOpen(false)
          } else {
            setReviewError(conflict.description)
          }
        } else {
          setReviewOpen(false)
        }
        return
      }
      if (err instanceof ApiError && err.status === 400) {
        const fieldErrors = parseServerFieldErrors(err.rawBody)
        const hasGeneralError = [...fieldErrors.keys()].some((f) =>
          (GENERAL_TAB_FIELDS as ReadonlyArray<string>).includes(f),
        )
        let anyFieldMapped = false
        let switchTo: string | null = null
        for (const [field, message] of fieldErrors) {
          const isGeneral = (GENERAL_TAB_FIELDS as ReadonlyArray<string>).includes(field)
          const isMisc = (MISC_TAB_FIELDS as ReadonlyArray<string>).includes(field)
          // `labels` is a page-level RHF field edited in the always-visible
          // header (not a tab), so it isn't in GENERAL_TAB_FIELDS. Map its 400
          // to form.setError anyway → HeaderLabelsEditor shows it inline instead
          // of the user getting only a toast for a field they're looking at.
          const isHeaderLabels = field === 'labels'
          if (isGeneral || isMisc || isHeaderLabels) {
            form.setError(field as keyof GeneralFormValues, { type: 'server', message })
            anyFieldMapped = true
          }
          // First non-General offending field decides the section to switch to.
          if (switchTo === null && !(isGeneral && !isMisc)) {
            const target = sectionForField(field)
            // Normally 'general' isn't a switch target (RHF general fields render
            // inline on the default tab). But section-state fields mapped to
            // General (the Classification Explicit/External toggles, which are NOT
            // in GENERAL_TAB_FIELDS so `isGeneral` is false) have no inline slot,
            // so DO navigate there instead of only toasting.
            if (target && (target !== 'general' || !isGeneral)) switchTo = target
          }
        }
        // Prefer keeping the user on General when a General field also errored.
        if (switchTo && !hasGeneralError) setActiveTab(switchTo)
        if (anyFieldMapped || switchTo) {
          setReviewOpen(false)
          // A General/Misc field 400 (anyFieldMapped) surfaces inline via
          // form.setError, so we stop here (no toast). Non-RHF section fields
          // (build/vcs/jira/escrow/distribution) have no inline-error slot, so
          // we switch to the owning section AND fall through to the toast below
          // — the toast is their only error surface.
          if (anyFieldMapped) return
        }
      }
      setReviewOpen(false)
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  function handleOpenReview() {
    if (!component || !canEdit || !dirty) return
    // Gate for the required Build System (P1-3).
    if (buildSystemNeedsAttention) {
      setActiveTab('build')
      buildSection.setBuildSystemTouched(true)
      return
    }
    setReviewError(null)
    setReviewOpen(true)
  }

  async function handleCopyVersions() {
    if (!componentValidation) return
    try {
      await copyToClipboard(allProblemVersions(componentValidation).join('\n'))
      toast({ title: 'Copied to clipboard' })
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' })
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

  const baseRow = selectBaseRow(component)
  const profilePct = completenessPercent(component)

  return (
    <Layout>
      <UnsavedChangesGuard when={dirty} />
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
              {!canEdit && (
                <Badge variant="warning" title={CANNOT_EDIT_TITLE}>
                  <LockKeyhole className="mr-1 h-3 w-3" />
                  View only
                </Badge>
              )}
              {component.solution && (
                <Badge variant="info">
                  <Boxes className="mr-1 h-3 w-3" aria-hidden />
                  Solution
                </Badge>
              )}
              {(() => {
                const systems = component.systems ?? []
                const buildSystem = baseRow?.build?.buildSystem
                const jiraProjectKey = baseRow?.jira?.projectKey
                // A read-only badge mirroring a field respects field-config
                // visibility: when `component.system` is hidden, the System
                // badge is suppressed (not just the input). D7.
                const systemsHidden = systemFc.visibility === 'hidden'
                return (
                  <>
                    {!systemsHidden && systems.map((s) => (
                      <Badge key={s} variant="outline">{s}</Badge>
                    ))}
                    {buildSystem && <Badge variant="outline">{buildSystem}</Badge>}
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
            </div>
            {/* Subline (spec §2.3/§2.5): Owner · Version · Updated <date> [by <user>] · Profile N% */}
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
              <span>Owner {component.componentOwner ?? '—'}</span>
              <span aria-hidden>·</span>
              <span>Version {component.version}</span>
              {component.updatedAt && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    Updated <RelativeTime ts={component.updatedAt} />
                    {component.updatedBy ? ` by ${component.updatedBy}` : ''}
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>Profile {profilePct}% complete</span>
            </p>
            {component.displayName && component.displayName !== component.name && (
              <p className="text-sm text-muted-foreground">{component.displayName}</p>
            )}
            {/* Labels — badges + popover editor, moved here from the General tab.
                Wired to the same page form: onChange sets shouldDirty/shouldTouch
                so the clear-all touched-flag contract in buildPatchRequest holds. */}
            <div className="pt-1">
              <HeaderLabelsEditor
                value={form.watch('labels') ?? []}
                onChange={(next) => form.setValue('labels', next, { shouldDirty: true, shouldTouch: true })}
                options={labelsDict.data ?? []}
                isLoading={labelsDict.isLoading}
                visibility={labelsFc.visibility ?? 'editable'}
                canEdit={canEdit}
                error={form.formState.errors.labels?.message}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canCreate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/components/new?from=${component.id}`)}
              >
                <Copy className="h-4 w-4" />
                Clone
              </Button>
            )}
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
          </div>
        </div>

        {(component.teamcityProjects ?? []).length > 0 && (
          <div className="rounded-md border divide-y" data-testid="teamcity-projects-list">
            {component.teamcityProjects.map((tc) => {
              const url = safeHttpUrl(tc.projectUrl ?? null)
              const validations = tc.validations ?? []
              const tones = validations.map((v) => getTeamCityValidationStatusTone(v.status))
              const hasError = tones.includes('destructive')
              const hasWarning = tones.includes('warning')
              const issueCount = tones.filter((t) => t === 'destructive' || t === 'warning').length
              const allClean = issueCount === 0
              return (
                <div key={tc.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {/* Status icon is an admin-only affordance — TeamCity validation
                      findings are an admin concern (see the admin-gated Validations
                      page/sidebar tab); a regular user just sees the project links. */}
                  {isAdmin &&
                    (allClean ? (
                      <CircleCheck
                        className="h-4 w-4 shrink-0 text-[color:var(--color-badge-green-fg)]"
                        aria-label="No validation issues"
                      />
                    ) : (
                      <AlertTriangle
                        className={cn(
                          'h-4 w-4 shrink-0',
                          hasError
                            ? 'text-destructive'
                            : hasWarning
                              ? 'text-[color:var(--color-badge-yellow-fg)]'
                              : 'text-muted-foreground',
                        )}
                        aria-label={`${issueCount} validation ${issueCount === 1 ? 'issue' : 'issues'}`}
                      />
                    ))}
                  {url ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`TeamCity: ${tc.projectId}`}
                          aria-label={`TeamCity: ${tc.projectId}`}
                          className="inline-flex min-w-0 items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          <TeamCityIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{tc.projectId}</span>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs break-all">{url}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <TeamCityIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium truncate">{tc.projectId}</span>
                    </span>
                  )}
                  {tc.projectVersion && (
                    <Badge variant="secondary" className="text-xs font-mono shrink-0">
                      {tc.projectVersion}
                    </Badge>
                  )}
                  {isAdmin && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {allClean ? 'no issues' : `${issueCount} issue${issueCount === 1 ? '' : 's'}`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {component.solution && (
          <StatusBanner variant="info" className="flex items-center gap-2" data-testid="solution-banner">
            <Boxes className="h-4 w-4 shrink-0" aria-hidden />
            <span>This component is a <span className="font-medium">Solution</span> — it groups and ships other components together.</span>
          </StatusBanner>
        )}

        {!canEdit && <WhoCanEditPanel componentId={component.id} />}

        <Separator />

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          variant="underline"
          orientation="vertical"
          className="flex flex-col gap-4 lg:flex-row lg:gap-6"
        >
          {(() => {
            const br = selectBaseRow(component)
            const vcsCount = br?.vcsEntries.length ?? 0
            const distCount =
              (br?.mavenArtifacts.length ?? 0) +
              (br?.fileUrlArtifacts.length ?? 0) +
              (br?.packages.length ?? 0)
            const dockerCount = br?.dockerImages.length ?? 0
            const configCount = component.configurations?.length ?? 0
            const docsCount = component.docs?.length ?? 0
            const sections: EditorNavSection[] = [
              {
                label: 'Overview',
                items: [
                  { value: 'general', label: 'General' },
                  // Solution is its own topic, offered only for solution-key components.
                  ...(showSolutionToggle ? [{ value: 'solution', label: 'Solution' }] : []),
                ],
              },
              {
                label: 'Build & Release',
                items: [
                  { value: 'build', label: 'Build', count: br?.build ? 1 : 0 },
                  { value: 'vcs', label: 'VCS', count: vcsCount },
                  { value: 'jira', label: 'Jira', count: br?.jira ? 1 : 0 },
                  { value: 'escrow', label: 'Escrow', count: br?.escrow ? 1 : 0 },
                  { value: 'documentation', label: 'Documentation', count: docsCount },
                ],
              },
              {
                label: 'Distribution',
                items: [
                  { value: 'distribution', label: 'Distribution', count: distCount },
                  { value: 'docker', label: 'Docker', count: dockerCount },
                ],
              },
              {
                label: 'Metadata',
                items: [
                  { value: 'misc', label: 'Misc' },
                  { value: 'supported-versions', label: 'Supported Versions' },
                  { value: 'configurations', label: 'Configurations', count: configCount },
                ],
              },
              {
                label: 'Tools',
                items: [
                  { value: 'as-code', label: 'As Code' },
                  { value: 'overrides', label: 'Overrides' },
                  { value: 'history', label: 'History' },
                ],
              },
              // Admin-only: TeamCity findings and Unregistered Release findings
              // are both an admin concern (see the admin-gated Validations
              // page), so the whole section is hidden for regular users.
              ...(isAdmin
                ? [
                    {
                      label: 'Validations',
                      items: [
                        {
                          value: 'teamcity-validations',
                          label: 'TeamCity',
                          problemCount: teamCityIssueCount,
                        },
                        {
                          value: 'unregistered-release',
                          label: 'Unregistered Release',
                          problemCount:
                            hasProblems && componentValidation
                              ? validationBadgeCount(componentValidation)
                              : 0,
                        },
                      ],
                    },
                  ]
                : []),
            ]
            return <EditorSidebarNav sections={sections} activeValue={activeTab} />
          })()}

          <div className="min-w-0 flex-1 rounded-lg border bg-card p-4 sm:p-6">
            <TabsContent value="general">
              <EditSurface canEdit={canEdit} label="General">
                <GeneralTab
                  key={component.id}
                  component={component}
                  form={form}
                  canEdit={canEdit}
                  onOwnerValidatingChange={setOwnerValidating}
                  classification={{
                    explicit: distributionSection.state.explicit,
                    external: distributionSection.state.external,
                    setExplicit: distributionSection.setExplicit,
                    setExternal: distributionSection.setExternal,
                  }}
                />
              </EditSurface>
            </TabsContent>

            {showSolutionToggle && (
              <TabsContent value="solution">
                <EditSurface canEdit={canEdit} label="Solution">
                  <SolutionTab form={form} visibility={solutionFc.visibility ?? 'editable'} />
                </EditSurface>
              </TabsContent>
            )}

            <TabsContent value="build">
              <EditSurface canEdit={canEdit} label="Build">
                <div className="space-y-6">
                  <BuildTab section={buildSection} canEdit={canEdit} />
                  <ProducedArtifactsSection form={form} component={component} canEdit={canEdit} />
                </div>
              </EditSurface>
            </TabsContent>

            <TabsContent value="documentation">
              <EditSurface canEdit={canEdit} label="Documentation">
                <DocumentationTab form={form} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="vcs">
              <EditSurface canEdit={canEdit} label="VCS">
                <VcsTab section={vcsSection} canEdit={canEdit} gitBaseUrl={gitBaseUrl} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="distribution">
              <EditSurface canEdit={canEdit} label="Distribution">
                <DistributionTab section={distributionSection} canEdit={canEdit} supportedGroups={supportedGroups} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="docker">
              <EditSurface canEdit={canEdit} label="Docker">
                <DockerImagesTab section={distributionSection} canEdit={canEdit} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="jira">
              <EditSurface canEdit={canEdit} label="Jira">
                <JiraTab component={component} section={jiraSection} canEdit={canEdit} conflictError={jiraConflict} effectiveBuildSystem={effectiveBuildSystem} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="escrow">
              <EditSurface canEdit={canEdit} label="Escrow">
                <EscrowTab section={escrowSection} canEdit={canEdit} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="misc">
              <EditSurface canEdit={canEdit} label="Misc">
                <MiscTab key={component.id} component={component} form={form} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="supported-versions">
              <EditSurface canEdit={canEdit} label="Supported Versions">
                <SupportedVersionsTab section={supportedVersionsSection} canEdit={canEdit} />
              </EditSurface>
            </TabsContent>

            <TabsContent value="configurations">
              <ConfigurationsTab component={component} />
            </TabsContent>

            <TabsContent value="as-code">
              <AsCodeTab component={component} />
            </TabsContent>

            <TabsContent value="overrides">
              <EditSurface canEdit={canEdit} label="Overrides">
                <FieldOverrides />
              </EditSurface>
            </TabsContent>

            <TabsContent value="history">
              <ComponentHistoryTab componentId={component.id} />
            </TabsContent>

            <TabsContent value="teamcity-validations">
              <TeamCityValidationsTab teamcityProjects={component.teamcityProjects ?? []} />
            </TabsContent>

            <TabsContent value="unregistered-release">
              {hasProblems && componentValidation ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Released versions checked against the registry. Admin-only.
                  </p>
                  <div className="max-h-[60vh] overflow-auto">
                    <ValidationProblemsList validation={componentValidation} />
                  </div>
                  {allProblemVersions(componentValidation).length > 0 && (
                    <Button variant="outline" size="sm" onClick={handleCopyVersions}>
                      <Copy className="mr-1.5 h-4 w-4" />
                      Copy versions
                    </Button>
                  )}
                </div>
              ) : (
                <EmptyState
                  message="No unregister release for this component."
                  className="py-8"
                />
              )}
            </TabsContent>

            {/* Single sticky save bar — governs the WHOLE component (one combined
                PATCH), replacing the old per-tab Save buttons. Rendered for
                read-only viewers too (disabled, with the cannot-edit tooltip) so
                the save affordance is consistent. */}
            <SaveBar
              dirty={dirty}
              canEdit={canEdit}
              isSaving={updateMutation.isPending}
              blockedReason={
                fieldConfigLoading
                  ? 'Loading field configuration…'
                  : ownerValidating
                    ? 'Validating component owner…'
                    : ownershipIssues > 0
                      ? `Resolve ${ownershipIssues} artifact-ownership ${ownershipIssues === 1 ? 'issue' : 'issues'} before saving`
                      : mavenPrefixIssues > 0
                        ? `Fix ${mavenPrefixIssues} distribution Group ID ${mavenPrefixIssues === 1 ? 'prefix' : 'prefixes'} before saving`
                        : vcsHostIssues > 0
                          ? `Fix ${vcsHostIssues} VCS ${vcsHostIssues === 1 ? 'host' : 'hosts'} before saving`
                          : null
              }
              onDiscard={discardAll}
              onSave={handleOpenReview}
            />
          </div>
        </Tabs>
      </div>

      <ReviewChangesDialog
        open={reviewOpen}
        onOpenChange={(open) => {
          setReviewOpen(open)
          if (!open) setReviewError(null)
        }}
        diff={diff}
        onConfirm={runCombinedSave}
        isSaving={updateMutation.isPending}
        errorBanner={reviewError}
      />

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

// Stable empty-component shell so the section hooks can be called
// unconditionally (rules of hooks) before the real component loads. The page
// returns a skeleton in that window, so this is never rendered.
const EMPTY_COMPONENT: ComponentDetail = {
  id: '',
  name: '',
  displayName: null,
  componentOwner: null,
  productType: null,
  systems: [],
  clientCode: null,
  archived: false,
  solution: false,
  parentComponentName: null,
  version: 0,
  createdAt: null,
  updatedAt: null,
  labels: [],
  docs: [],
  artifactIds: [],
  securityGroups: [],
  teamcityProjects: [],
  configurations: [],
}

/**
 * Route entry. Provides the page-level field-override draft (seeded from the
 * server overrides) so the editor body and every override surface share ONE
 * draft instance, then renders the editor. The provider sits here — above the
 * component that assembles the combined-save slices — so useOverridesSection()
 * and the surfaces all resolve the same context.
 */
export function ComponentDetailPage() {
  const { id } = useParams<{ id: string }>()
  // id is always defined on this route; the `?? ''` only guards the type. An
  // empty id disables the query (useFieldOverrides: enabled: !!componentId), so
  // the provider just starts from an empty baseline until the route resolves.
  //
  // Baseline/version coupling: the combined PATCH sends component.version (from
  // useComponent) AND the desired-full-set built from THIS override baseline.
  // The desired-set deletes anything omitted, so a stale override baseline paired
  // with a fresh component.version could in theory drop a concurrently-added row.
  // In practice these two queries move in lockstep — the combined-save
  // useUpdateComponent invalidates ['field-overrides', id] alongside the
  // component, useUpdateSupportedVersions does the same via
  // invalidateOverrideAndComponent, and window-focus refetches both — so a fresh
  // version never pairs with a stale override set. (A fully snapshot-coupled
  // baseline derived from component.configurations is a possible follow-up.)
  const { data: serverOverrides = [], isLoading: overridesLoading } = useFieldOverrides(id ?? '')
  return (
    <OverridesDraftProvider componentId={id ?? ''} serverOverrides={serverOverrides} serverLoading={overridesLoading}>
      <ComponentDetailEditor />
    </OverridesDraftProvider>
  )
}
