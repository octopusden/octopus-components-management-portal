import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Copy, Archive, ArchiveRestore, AlertTriangle, LockKeyhole, Boxes, CircleCheck, CircleDashed } from 'lucide-react'
import { JiraIcon, BitbucketIcon, GiteaIcon, TeamCityIcon } from '../components/ui/icons/brand-icons'
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
import { useArchiveReadiness } from '../hooks/useArchiveReadiness'
import { ArchiveReadinessView } from '../components/ArchiveReadinessView'
import { DocumentationTab } from '../components/editor/DocumentationTab'
import { SolutionTab } from '../components/editor/SolutionTab'
import { HeaderLabelsEditor } from '../components/editor/HeaderLabelsEditor'
import { MiscTab, MISC_TAB_FIELDS } from '../components/editor/MiscTab'
import { ReleaseProcessTab } from '../components/editor/ReleaseProcessTab'
import { ProducedArtifactsSection } from '../components/editor/ProducedArtifactsSection'
import { buildUpdateRequest } from '../lib/component/buildUpdateRequest'
import { renameKeyCharsetError } from '../lib/component/createFormModel'
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
import { useComponent, useUpdateComponent, useDeleteComponent, useFieldOverrides, refreshComponentIntoCache, fetchFieldOverrides } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { ApiError } from '../lib/api'
import { useOptimisticConflict, type ClassifiedConflict } from '../hooks/useOptimisticConflict'
import { classifyConflictBody } from '../lib/conflict'
import type { ComponentDetail, ComponentUpdateRequest, ComponentValidation, TeamcityProject } from '../lib/types'
import { countOwnershipIssues, fromArtifactId } from '../lib/artifactOwnership'
import { findUnsupportedGroupId } from '../lib/groupValidation'
import { isVcsHostSupported, vcsBrowseUrl, type VcsProvider } from '../lib/vcsHost'
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
    testComponent: component.testComponent ?? false,
    autoRelease: component.autoRelease ?? false,
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
  if (field === 'autoRelease') return 'release-process'
  // VCS checkout layout is edited on the VCS tab — the Build Working Directory too, not on the Build tab —
  // for the base row and for a per-range row (`fieldOverrides[<j>].…`).
  if (/^(fieldOverrides\[\d+\]\.)?(buildWorkingDirectory$|vcsEntries\[)/.test(field)) return 'vcs'
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

// Conditional JSX pulled out of ComponentDetailEditor so no single function
// exceeds the SonarQube cognitive-complexity gate. The DOM is unchanged.

function ComponentBadges({
  component,
  canEdit,
  systemsHidden,
  jiraBaseUrl,
  gitBaseUrl,
  vcsProvider,
}: {
  component: ComponentDetail
  canEdit: boolean
  systemsHidden: boolean
  jiraBaseUrl: string | undefined
  gitBaseUrl: string | undefined
  vcsProvider: VcsProvider
}) {
  const baseRow = selectBaseRow(component)
  const systems = component.systems ?? []
  const buildSystem = baseRow?.build?.buildSystem
  const jiraProjectKey = baseRow?.jira?.projectKey
  const vcsTarget = vcsBrowseUrl(baseRow?.vcsEntries[0]?.vcsPath, gitBaseUrl, vcsProvider)
  const providerLabel = vcsProvider === 'gitea' ? 'Gitea' : 'Bitbucket'
  const VcsIcon = vcsProvider === 'gitea' ? GiteaIcon : BitbucketIcon
  const vcsLabel = vcsTarget ? `${providerLabel}: ${vcsTarget.namespace}/${vcsTarget.repoName}` : ''
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h1 className="text-2xl font-semibold tracking-tight">{component.name}</h1>
      <Badge variant={component.archived ? 'destructive' : 'secondary'}>
        {component.archived ? 'Archived' : 'Active'}
      </Badge>
      {component.testComponent && (
        <Badge variant="outline" title="Test component">
          Test
        </Badge>
      )}
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
      {/* A read-only badge mirroring a field respects field-config
          visibility: when `component.system` is hidden, the System badge is
          suppressed (not just the input). D7. */}
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
      {vcsTarget && (
        <a
          href={vcsTarget.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm hover:opacity-80 transition-opacity"
          title={vcsLabel}
          aria-label={vcsLabel}
        >
          <VcsIcon className="h-4 w-4" />
        </a>
      )}
    </div>
  )
}

function ComponentSubline({ component, profilePct }: { component: ComponentDetail; profilePct: number }) {
  return (
    <>
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
    </>
  )
}

function ComponentHeader({
  component,
  canEdit,
  canCreate,
  canArchive,
  canUnarchive,
  systemsHidden,
  profilePct,
  jiraBaseUrl,
  gitBaseUrl,
  vcsProvider,
  labelsValue,
  labelsOptions,
  labelsLoading,
  labelsVisibility,
  labelsError,
  onLabelsChange,
  onClone,
  onArchiveClick,
  onUnarchive,
  unarchivePending,
}: {
  component: ComponentDetail
  canEdit: boolean
  canCreate: boolean
  canArchive: boolean
  canUnarchive: boolean
  systemsHidden: boolean
  profilePct: number
  jiraBaseUrl: string | undefined
  gitBaseUrl: string | undefined
  vcsProvider: VcsProvider
  labelsValue: string[] | undefined
  labelsOptions: string[] | undefined
  labelsLoading: boolean
  labelsVisibility: 'editable' | 'readonly' | 'hidden' | undefined
  labelsError: string | undefined
  onLabelsChange: (next: string[]) => void
  onClone: () => void
  onArchiveClick: () => void
  onUnarchive: () => void
  unarchivePending: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Link
          to="/components"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Components
        </Link>
        <ComponentBadges
          component={component}
          canEdit={canEdit}
          systemsHidden={systemsHidden}
          jiraBaseUrl={jiraBaseUrl}
          gitBaseUrl={gitBaseUrl}
          vcsProvider={vcsProvider}
        />
        <ComponentSubline component={component} profilePct={profilePct} />
        {/* Labels — badges + popover editor, moved here from the General tab.
            Wired to the same page form: onChange sets shouldDirty/shouldTouch
            so the clear-all touched-flag contract in buildPatchRequest holds. */}
        <div className="pt-1">
          <HeaderLabelsEditor
            value={labelsValue ?? []}
            onChange={onLabelsChange}
            options={labelsOptions ?? []}
            isLoading={labelsLoading}
            visibility={labelsVisibility}
            canEdit={canEdit}
            error={labelsError}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {canCreate && (
          <Button variant="outline" size="sm" onClick={onClone}>
            <Copy className="h-4 w-4" />
            Clone
          </Button>
        )}
        {!component.archived && canArchive && (
          // Quiet red outline: the solid red belongs to the confirm dialog's final step,
          // not to a header button that only opens it.
          <Button variant="destructive-outline" size="sm" onClick={onArchiveClick}>
            <Archive className="h-4 w-4" />
            Archive
          </Button>
        )}
        {component.archived && canUnarchive && (
          <Button variant="outline" size="sm" onClick={onUnarchive} disabled={unarchivePending}>
            <ArchiveRestore className="h-4 w-4" />
            Unarchive
          </Button>
        )}
      </div>
    </div>
  )
}

function TeamCityValidationStatusIcon({
  noRecordedFindings,
  allClean,
  hasError,
  hasWarning,
  issueCount,
}: {
  noRecordedFindings: boolean
  allClean: boolean
  hasError: boolean
  hasWarning: boolean
  issueCount: number
}) {
  if (noRecordedFindings) {
    return (
      <CircleDashed
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-label="No validation findings on record"
      />
    )
  }
  if (allClean) {
    return (
      <CircleCheck
        className="h-4 w-4 shrink-0 text-[color:var(--color-badge-green-fg)]"
        aria-label="No validation issues"
      />
    )
  }
  return (
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
  )
}

function teamCityStatusText(noRecordedFindings: boolean, allClean: boolean, issueCount: number): string {
  if (noRecordedFindings) return 'no recorded findings'
  if (allClean) return 'no issues'
  return `${issueCount} issue${issueCount === 1 ? '' : 's'}`
}

function TeamCityProjectRow({ tc, isAdmin }: { tc: TeamcityProject; isAdmin: boolean }) {
  const url = safeHttpUrl(tc.projectUrl ?? null)
  const validations = tc.validations ?? []
  const tones = validations.map((v) => getTeamCityValidationStatusTone(v.status))
  const hasError = tones.includes('destructive')
  const hasWarning = tones.includes('warning')
  const issueCount = tones.filter((t) => t === 'destructive' || t === 'warning').length
  const noRecordedFindings = validations.length === 0
  const allClean = !noRecordedFindings && issueCount === 0
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      {isAdmin && (
        <TeamCityValidationStatusIcon
          noRecordedFindings={noRecordedFindings}
          allClean={allClean}
          hasError={hasError}
          hasWarning={hasWarning}
          issueCount={issueCount}
        />
      )}
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
          {teamCityStatusText(noRecordedFindings, allClean, issueCount)}
        </span>
      )}
    </div>
  )
}

function TeamCityProjectsList({ projects, isAdmin }: { projects: TeamcityProject[] | undefined; isAdmin: boolean }) {
  if (!projects?.length) return null
  return (
    <div className="rounded-md border divide-y" data-testid="teamcity-projects-list">
      {projects.map((tc) => (
        <TeamCityProjectRow key={tc.id} tc={tc} isAdmin={isAdmin} />
      ))}
    </div>
  )
}

function UnregisteredReleaseContent({
  hasProblems,
  componentValidation,
  onCopyVersions,
}: {
  hasProblems: boolean
  componentValidation: ComponentValidation | undefined
  onCopyVersions: () => void
}) {
  if (!hasProblems || !componentValidation) {
    return <EmptyState message="No unregister release for this component." className="py-8" />
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Released versions checked against the registry. Admin-only.
      </p>
      <div className="max-h-[60vh] overflow-auto">
        <ValidationProblemsList validation={componentValidation} />
      </div>
      {allProblemVersions(componentValidation).length > 0 && (
        <Button variant="outline" size="sm" onClick={onCopyVersions}>
          <Copy className="mr-1.5 h-4 w-4" />
          Copy versions
        </Button>
      )}
    </div>
  )
}

function ArchiveComponentDialog({
  open,
  onOpenChange,
  componentName,
  componentOwner,
  readiness,
  canConfirm,
  isPending,
  jiraBaseUrl,
  currentUsername,
  onArchive,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentName: string
  componentOwner: ComponentDetail['componentOwner']
  readiness: ReturnType<typeof useArchiveReadiness>
  canConfirm: boolean
  isPending: boolean
  jiraBaseUrl: string | undefined
  currentUsername: string | undefined
  onArchive: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Archive Component
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to archive <span className="font-semibold text-foreground">{componentName}</span>?
          This will archive the component. You can restore it later.
        </p>
        <div className="max-h-[50vh] overflow-auto">
          <ArchiveReadinessView
            isLoading={readiness.isLoading}
            isError={readiness.isError}
            data={readiness.data}
            onRetry={() => readiness.refetch()}
            jiraBaseUrl={jiraBaseUrl}
            componentOwner={componentOwner}
            currentUsername={currentUsername}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onArchive} disabled={isPending || !canConfirm}>
            {isPending ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildEditorNavSections({
  component,
  showSolutionToggle,
  releaseProcessVisible,
  isAdmin,
  teamCityIssueCount,
  hasProblems,
  componentValidation,
}: {
  component: ComponentDetail
  showSolutionToggle: boolean
  releaseProcessVisible: boolean
  isAdmin: boolean
  teamCityIssueCount: number
  hasProblems: boolean
  componentValidation: ComponentValidation | undefined
}): EditorNavSection[] {
  const br = selectBaseRow(component)
  const vcsCount = br?.vcsEntries.length ?? 0
  const distCount =
    (br?.mavenArtifacts.length ?? 0) +
    (br?.fileUrlArtifacts.length ?? 0) +
    (br?.packages.length ?? 0) +
    (br?.genericArtifacts?.length ?? 0)
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
        ...(releaseProcessVisible ? [{ value: 'release-process', label: 'Release Process' }] : []),
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
        { value: AS_CODE_TAB, label: 'As Code' },
        { value: 'overrides', label: 'Overrides' },
        { value: 'history', label: 'History' },
      ],
    },
    // Validations section is admin-only, hidden for regular users.
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
  return sections
}

// Client-side save gates — hints only; the server stays authoritative on save.
function saveBlockedReason(
  fieldConfigLoading: boolean,
  ownerValidating: boolean,
  ownershipIssues: number,
  mavenPrefixIssues: number,
  vcsHostIssues: number,
  renameKeyBlocked: boolean,
): string | null {
  if (fieldConfigLoading) return 'Loading field configuration…'
  if (ownerValidating) return 'Validating component owner…'
  if (ownershipIssues > 0)
    return `Resolve ${ownershipIssues} artifact-ownership ${ownershipIssues === 1 ? 'issue' : 'issues'} before saving`
  if (mavenPrefixIssues > 0)
    return `Fix ${mavenPrefixIssues} distribution Group ID ${mavenPrefixIssues === 1 ? 'prefix' : 'prefixes'} before saving`
  if (vcsHostIssues > 0)
    return `Fix ${vcsHostIssues} VCS ${vcsHostIssues === 1 ? 'host' : 'hosts'} before saving`
  if (renameKeyBlocked) return 'Fix the Component Key before saving'
  return null
}

function countTeamCityIssues(isAdmin: boolean, projects: TeamcityProject[] | undefined): number {
  if (!isAdmin) return 0
  return (projects ?? []).reduce((total, tc) => {
    const tones = (tc.validations ?? []).map((v) => getTeamCityValidationStatusTone(v.status))
    return total + tones.filter((t) => t === 'destructive' || t === 'warning').length
  }, 0)
}

function canConfirmArchiveFor(readiness: ReturnType<typeof useArchiveReadiness>): boolean {
  return readiness.data?.ready === true && !readiness.isLoading && !readiness.isFetching && !readiness.isError
}

function hasValidationProblems(isAdmin: boolean, validation: ComponentValidation | undefined): boolean {
  return isAdmin && validation != null && hasValidationIssue(validation)
}

const AS_CODE_TAB = 'as-code'

/** A positive integer from a query param, or undefined. */
function parsePositiveInt(raw: string | null): number | undefined {
  const n = Number(raw)
  return raw && Number.isInteger(n) && n > 0 ? n : undefined
}

/**
 * The editor body. Rendered INSIDE OverridesDraftProvider (see
 * ComponentDetailPage below) so it — and every override surface — share one
 * draft instance; this is also where the section slices (incl. the override
 * slice) are assembled into the ONE combined save.
 */
function ComponentDetailEditor({ component, routeId }: { component: ComponentDetail; routeId: string }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const handleConflict = useOptimisticConflict(component.id, routeId)
  const queryClient = useQueryClient()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  // Persistent save-time conflict message shown in the Review dialog (value 409s
  // like an overlapping/duplicate range) — survives the auto-dismissing toast.
  const [reviewError, setReviewError] = useState<string | null>(null)
  // Inline (projectKey, versionPrefix) uniqueness-conflict shown under the Jira
  // Project Key field after a value-409 on a save that changed the jira pair.
  const [jiraConflict, setJiraConflict] = useState<string | null>(null)
  // Inline RMS_REGISTERED_VALUE_CONFLICT banner shown at the top of the Build
  // tab — CRS's message doesn't say which field (Java/Maven) conflicted, so
  // this isn't attached to one field the way jiraConflict is.
  const [buildConflict, setBuildConflict] = useState<string | null>(null)
  // Controlled tab so a server 400 on a field that lives on a non-active tab can
  // auto-switch to the owning tab (otherwise the inline error renders on a hidden tab).
  //
  // `?tab=as-code&line=N` (the as-code search page's deep link) opens the As Code tab
  // scrolled to line N. Only `as-code` is honoured: every other tab keeps opening on
  // General, as before.
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get('tab') === AS_CODE_TAB ? AS_CODE_TAB : 'general',
  )
  const asCodeLine = parsePositiveInt(searchParams.get('line'))
  // The same deep link can also arrive while this page is mounted (a header search hit on
  // the component already open): switch to As Code again and remount it on the full view,
  // so the line is shown and scrolled to even if the tab was on another view.
  const [seenLocationKey, setSeenLocationKey] = useState(location.key)
  const [asCodeKey, setAsCodeKey] = useState(0)
  if (location.key !== seenLocationKey) {
    setSeenLocationKey(location.key)
    if (searchParams.get('tab') === AS_CODE_TAB) {
      setActiveTab(AS_CODE_TAB)
      setAsCodeKey((k) => k + 1)
    }
  }
  // GeneralTab's owner PeopleInput commits a typed value only after its async
  // directory lookup resolves. Hold Save while that is in flight.
  const [ownerValidating, setOwnerValidating] = useState(false)

  const updateMutation = useUpdateComponent(component.id, routeId)
  const deleteMutation = useDeleteComponent(component.id)
  // Enabled only while the Archive dialog is open (design.md decision 1) — the
  // answer requires live calls to three external systems, so it is never
  // requested on component load, only when someone actually chooses Archive.
  const archiveReadiness = useArchiveReadiness(component.id, deleteDialogOpen)
  const canConfirmArchive = canConfirmArchiveFor(archiveReadiness)
  const { data: user } = useCurrentUser()

  const adminMode = useAdminMode((s) => s.enabled)
  const isAdmin = adminMode && hasPermission(user, PERMISSIONS.IMPORT_DATA)

  const { byComponent: validationByComponent } = useValidationProblems(isAdmin)
  const componentValidation = validationByComponent.get(component.name)
  const hasProblems = hasValidationProblems(isAdmin, componentValidation)

  // Rolled up across all TeamCity projects — drives the sidebar item's
  // red/warning treatment. Admin-only, derived from data already on `component`.
  const teamCityIssueCount = countTeamCityIssues(isAdmin, component.teamcityProjects)

  useEffect(() => {
    // Whole Validations section (TeamCity + Unregistered Release) is admin-only.
    if (!isAdmin && (activeTab === 'teamcity-validations' || activeTab === 'unregistered-release')) {
      setActiveTab('general')
    }
  }, [activeTab, isAdmin])

  const canArchive = hasPermission(user, PERMISSIONS.DELETE_COMPONENTS)
  const canUnarchive = hasPermission(user, PERMISSIONS.ARCHIVE_COMPONENTS)
  const canCreate = hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)
  const canEdit = component.canEdit ?? hasPermission(user, PERMISSIONS.CREATE_COMPONENTS)

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
  const { entry: autoReleaseFc } = useFieldConfigEntry('component.autoRelease')
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
  const vcsProvider = portalLinks?.vcsProvider ?? 'bitbucket'
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
      testComponent: false,
      autoRelease: false,
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
  const solutionKeyName = form.watch('name') || component.name
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
  // owns initial hydration (its own reset to the server values, on a pristine form).
  const hydratedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!component) return
    const prevId = hydratedIdRef.current
    if (prevId === component.id) return
    hydratedIdRef.current = component.id
    if (prevId === null) return // first load — GeneralTab hydrates on mount
    form.reset(mapComponentToForm(component))
    form.clearErrors()
    // A conflict banner belongs to the component that was being saved when it
    // fired — carrying it across a same-instance A→B navigation would render
    // component A's error on component B's page.
    setReviewError(null)
    setJiraConflict(null)
    setBuildConflict(null)
    // `form` is a stable RHF ref (never changes identity); listed for
    // exhaustive-deps lint only — the id ref-compare is the real gate.
  }, [component, form])

  // ── Section state hooks (the five ex-useState tabs). Each owns its local
  // state + last-saved snapshot and contributes a payload slice + dirty flag.
  const buildSection = useBuildSection(component)
  const vcsSection = useVcsSection(component)
  const distributionSection = useDistributionSection(component)
  // EFFECTIVE (outgoing) BASE build system = the Build section's DRAFT value, so
  // the Jira Skip Commit Check Whiskey rule reacts to an unsaved Build-tab switch
  // in the same combined save (Codex #151 P1), not just the persisted component.
  const effectiveBuildSystem = buildSection.state.buildSystem
  const jiraSection = useJiraSection(component, {
    releasesInDefaultBranch: releasesInDefaultBranchFc.visibility ?? 'editable',
    isFieldEditable: isJiraFieldEditable,
    effectiveBuildSystem,
  })
  const escrowSection = useEscrowSection(component, {
    productType: productTypeFc.visibility ?? 'editable',
  })
  // Field-overrides slice — draft lives in OverridesDraftProvider (wraps this
  // component), so this just projects it into a SectionSlice like the others.
  const overridesSection = useOverridesSection()
  // Supported-versions (coverage) draft. NOT a PATCH slice — it persists via a
  // separate PUT (endpoint off the combined-PATCH contract) — so it feeds the
  // page dirty flag + Review diff directly and is saved inside runCombinedSave
  // after the PATCH.
  const supportedVersionsSection = useSupportedVersionsSection(component.id, routeId)

  // ── General/Misc slice (RHF touched-not-dirty gate, preserved verbatim) ──
  function buildPatchRequest() {
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
        // Not editable for this user (readonly, adminOnly, none) → never sent.
        autoRelease:
          autoReleaseFc.visibility === 'hidden'
            ? 'hidden'
            : isFieldEditableFor(fieldConfigData, 'component.autoRelease', user) ? 'editable' : 'readonly',
      },
      dirtyFields: {
        // "Interacted" (dirty OR touched): GeneralTab hydrates with reset, so the server value is
        // RHF's default and a real change reads as dirty; the touched branch is a safety net for
        // a clear back to the blank form default before hydration. buildUpdateRequest
        // value-compares, so an untouched switch still never sends a stale value.
        solution: form.formState.dirtyFields.solution === true || form.formState.touchedFields.solution === true,
        autoRelease:
          form.formState.dirtyFields.autoRelease === true || form.formState.touchedFields.autoRelease === true,
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

  const pendingGeneralPatch = buildPatchRequest()
  // P1-3: Build System is required when a BASE build aspect exists. Block the
  // save if it has been cleared to empty (server had one, draft is now blank).
  // `buildSystemMissing` = !draft.buildSystem.
  const serverBuildSystem = selectBaseRow(component)?.build?.buildSystem ?? ''
  const buildSystemNeedsAttention = serverBuildSystem !== '' && buildSection.buildSystemMissing
  const genSlice = generalSlice(component, pendingGeneralPatch)

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
  // SYS-095 rename gate. Client-detectable like the three above, so it blocks Save
  // instead of letting the PATCH round-trip to a CRS 400 — the same helper GeneralTab
  // renders inline, so the blocked Save and the field error always agree.
  const renameKeyBlocked =
    component !== undefined &&
    renameKeyCharsetError(form.watch('name'), component.name, form.watch('clientCode')) !== null

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

  // Re-baselines the form to the SAVED component — GeneralTab's re-hydration
  // guard skips while the form is dirty, so without the reset it would stay
  // dirty for the rest of the session. (`if (saved)` keeps tests whose
  // mutateAsync resolves undefined inert.) Returns the PATCH advisories.
  async function persistPatch(request: ComponentUpdateRequest): Promise<string[]> {
    const saved = await updateMutation.mutateAsync(request)
    if (saved) {
      form.reset(mapComponentToForm(saved))
      form.clearErrors()
    }
    return saved?.warnings ?? []
  }

  // 'partial' = the PATCH already landed and the failure is fully reported
  // here; a coverage-only failure rethrows into the shared rejection handling
  // below, so an in-place-fixable conflict keeps its banner routing.
  async function persistCoverage(
    meta: ConfirmMeta,
    patchDirty: boolean,
    showPatchWarnings: () => void,
  ): Promise<'saved' | 'partial'> {
    try {
      await supportedVersionsSection.save({
        jiraTaskKey: meta.jiraTaskKey,
        changeComment: meta.changeComment,
      })
      return 'saved'
    } catch (svErr) {
      // P2-1: the PATCH is already committed, so the save is only PARTLY done
      // and the combined diff can't be safely re-edited (its "from" values
      // are stale) — reset the part that landed and surface the failure
      // distinctly rather than as a misleading generic "Save failed".
      if (patchDirty) {
        const msg = svErr instanceof Error ? svErr.message : String(svErr)
        overridesSection.reset()
        setReviewOpen(false)
        toast({
          title: 'Partly saved',
          description: `Your other changes were saved, but updating supported versions failed: ${msg}`,
          variant: 'destructive',
        })
        // The PATCH did land, so its advisories still apply.
        showPatchWarnings()
        return 'partial'
      }
      throw svErr
    }
  }

  // `value` is fixable in place — keep the Review dialog open; `optimistic`
  // has already refetched, so the open diff's "from" values are stale — close it.
  function applySaveConflict(conflict: ClassifiedConflict) {
    toast({ title: conflict.title, description: conflict.description, variant: 'destructive' })
    if (conflict.kind === 'rms') {
      // The conflicting field (Java or Maven) isn't named in CRS's message, but
      // both live on the Build tab, so route there unconditionally (design.md
      // Decision 5). CRS refreshed its ACTUAL data when it rejected the write;
      // refetch so the display catches up — after the toast, never awaited
      // (Decision 6).
      setBuildConflict(conflict.description)
      setActiveTab('build')
      setReviewOpen(false)
      void refreshComponentIntoCache(queryClient, component.id, routeId)
      return
    }
    if (conflict.kind === 'value') {
      // Attribute a value-409 to the Jira (projectKey, versionPrefix) pair ONLY
      // when this save changed either AND the server message is about that pair
      // — the pair is edited on the Jira tab, so surface it inline there; the
      // message guard keeps an unrelated uniqueness conflict (e.g. a
      // distribution GAV) from being misrouted. Every other value conflict
      // stays a persistent Review-dialog banner.
      const jServer = selectBaseRow(component)?.jira
      const jiraPairChanged =
        (jiraSection.state.projectKey || '') !== (jServer?.projectKey ?? '') ||
        (jiraSection.state.versionPrefix || '') !== (jServer?.versionPrefix ?? '')
      if (jiraPairChanged && /jira|project\s*key/i.test(conflict.description)) {
        setJiraConflict(conflict.description)
        setActiveTab('jira')
        setReviewOpen(false)
      } else {
        setReviewError(conflict.description)
      }
      return
    }
    setReviewOpen(false)
  }

  // 'general' is normally not a target (RHF general fields render inline on
  // the default tab), but the Classification toggles mapped there have no
  // inline slot, so DO navigate for them.
  function pickErrorSection(fieldErrors: Map<string, string>): string | null {
    for (const field of fieldErrors.keys()) {
      const isGeneral = (GENERAL_TAB_FIELDS as ReadonlyArray<string>).includes(field)
      const isOtherTab = (MISC_TAB_FIELDS as ReadonlyArray<string>).includes(field) || field === 'autoRelease'
      if (isGeneral && !isOtherTab) continue
      const target = sectionForField(field)
      if (target && (target !== 'general' || !isGeneral)) return target
    }
    return null
  }

  // Returns true when at least one error landed inline — the caller then
  // skips the generic toast (it would be their only error surface otherwise).
  function applyFieldErrors(err: ApiError, sentOverrideIds: string[]): boolean {
    const fieldErrors = parseServerFieldErrors(err.rawBody)
    const hasGeneralError = [...fieldErrors.keys()].some((f) =>
      (GENERAL_TAB_FIELDS as ReadonlyArray<string>).includes(f),
    )
    let anyFieldMapped = vcsSection.applyServerErrors(fieldErrors, sentOverrideIds)
    const switchTo = pickErrorSection(fieldErrors)
    for (const [field, message] of fieldErrors) {
      const isGeneral = (GENERAL_TAB_FIELDS as ReadonlyArray<string>).includes(field)
      const isOtherTab = (MISC_TAB_FIELDS as ReadonlyArray<string>).includes(field) || field === 'autoRelease'
      // `labels` is a page-level RHF field edited in the always-visible header
      // (not a tab, not in GENERAL_TAB_FIELDS) — map it so HeaderLabelsEditor
      // shows it inline instead of the user getting only a toast.
      const isHeaderLabels = field === 'labels'
      if (isGeneral || isOtherTab || isHeaderLabels) {
        form.setError(field as keyof GeneralFormValues, { type: 'server', message })
        anyFieldMapped = true
      }
    }
    // Prefer keeping the user on General when a General field also errored.
    if (switchTo && !hasGeneralError) setActiveTab(switchTo)
    if (anyFieldMapped || switchTo) setReviewOpen(false)
    return anyFieldMapped
  }

  // A classified 409, a field-mapped 400, the RMS-unavailable 503 — anything
  // else degrades to the generic "Save failed" toast.
  async function applySaveRejection(err: unknown, sentOverrideIds: string[]) {
    const conflict = await handleConflict(err)
    if (conflict) {
      applySaveConflict(conflict)
      return
    }
    if (err instanceof ApiError && err.status === 400 && applyFieldErrors(err, sentOverrideIds)) return
    // CRS's write-time RMS gate fails closed with a 503 when it can't reach
    // RMS — decided by errorCode alone (design.md Decision 5).
    if (err instanceof ApiError && err.status === 503 && classifyConflictBody(err.rawBody).errorCode === 'RMS_UNAVAILABLE') {
      setReviewOpen(false)
      toast({
        title: 'Registered build data unavailable',
        description:
          'The registered build data could not be reached, so this save could not be checked against it. Try again shortly.',
        variant: 'destructive',
      })
      return
    }
    setReviewOpen(false)
    toast({
      title: 'Save failed',
      description: err instanceof Error ? err.message : String(err),
      variant: 'destructive',
    })
  }

  async function runCombinedSave(meta: ConfirmMeta = {}) {
    if (!canEdit || !dirty) return
    form.clearErrors()
    // Clear any prior conflict banner / inline jira conflict so a retry starts clean.
    setReviewError(null)
    setJiraConflict(null)
    setBuildConflict(null)
    vcsSection.clearServerErrors()

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
    // The override rows in the order sent as `fieldOverrides`, to route its indexed 400s.
    const sentOverrideIds = overridesSection.rowIds
    const request = {
      ...combineRequest(component.version, slices),
      jiraTaskKey: meta.jiraTaskKey,
      changeComment: meta.changeComment,
    }

    try {
      // The combined PATCH fires only when a PATCH-backed section is dirty — a
      // supported-versions-only save must not send an (essentially empty) PATCH.
      const saveWarnings = patchDirty ? await persistPatch(request) : []
      const showSaveWarnings = () => saveWarnings.forEach((warning) => toast({ title: 'Warning', description: warning }))
      if (supportedVersionsSection.isDirty) {
        const outcome = await persistCoverage(meta, patchDirty, showSaveWarnings)
        if (outcome === 'partial') return
      }
      // Clear the override draft after a successful save: useUpdateComponent
      // invalidates ['field-overrides', id], so OverridesDraftProvider re-seeds
      // from the refetched (authoritative) baseline and the section reads clean.
      overridesSection.reset()
      setReviewOpen(false)
      toast({ title: 'Component saved', description: 'Changes have been saved successfully.' })
      showSaveWarnings()
    } catch (err) {
      await applySaveRejection(err, sentOverrideIds)
    }
  }

  // PR-272: the retry after an OPTIMISTIC_LOCK 409 pairs the freshly refreshed
  // component version with whatever override baseline the draft still holds. A
  // baseline that predates the refresh (its refetch still in flight, or it
  // failed) would send the old desired-full-set with the new version and delete
  // a concurrently-added row, so Review — and with it the save — stays blocked
  // until the baseline matches the snapshot (a successful refetch at/after it).
  async function overridesBaselineReady(): Promise<boolean> {
    if (!overridesSection.slice.isDirty) return true
    const overridesState = queryClient.getQueryState(['field-overrides', component.id])
    // No live overrides query → the page renders with whatever baseline it has
    // and there is nothing to reconcile against.
    if (!overridesState) return true
    const componentState = queryClient.getQueryState(['component', routeId ?? component.id])
    const matchesSnapshot =
      overridesState.status === 'success' &&
      overridesState.dataUpdatedAt >= (componentState?.dataUpdatedAt ?? 0)
    if (matchesSnapshot) return true
    try {
      await queryClient.fetchQuery({
        queryKey: ['field-overrides', component.id],
        queryFn: () => fetchFieldOverrides(component.id),
      })
      return true
    } catch {
      return false
    }
  }

  async function handleOpenReview() {
    if (!component || !canEdit || !dirty) return
    // Gate for the required Build System (P1-3).
    if (buildSystemNeedsAttention) {
      setActiveTab('build')
      buildSection.setBuildSystemTouched(true)
      return
    }
    setReviewError(null)
    if (!(await overridesBaselineReady())) {
      toast({
        title: 'Cannot review changes',
        description:
          'The current override data could not be loaded from the server, so the save was blocked to protect concurrent changes. Try again in a moment.',
        variant: 'destructive',
      })
      return
    }
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

  const profilePct = completenessPercent(component)
  const warnings = component.warnings ?? []

  return (
    <Layout>
      <UnsavedChangesGuard when={dirty} />
      <div className="space-y-6">
        {/* Header */}
        <ComponentHeader
          component={component}
          canEdit={canEdit}
          canCreate={canCreate}
          canArchive={canArchive}
          canUnarchive={canUnarchive}
          systemsHidden={systemFc.visibility === 'hidden'}
          profilePct={profilePct}
          jiraBaseUrl={jiraBaseUrl}
          gitBaseUrl={gitBaseUrl}
          vcsProvider={vcsProvider}
          labelsValue={form.watch('labels')}
          labelsOptions={labelsDict.data}
          labelsLoading={labelsDict.isLoading}
          labelsVisibility={labelsFc.visibility}
          labelsError={form.formState.errors.labels?.message}
          onLabelsChange={(next) => form.setValue('labels', next, { shouldDirty: true, shouldTouch: true })}
          onClone={() => navigate(`/components/new?from=${component.id}`)}
          onArchiveClick={() => setDeleteDialogOpen(true)}
          onUnarchive={handleUnarchive}
          unarchivePending={updateMutation.isPending}
        />

        <TeamCityProjectsList projects={component.teamcityProjects} isAdmin={isAdmin} />

        {component.solution && (
          <StatusBanner variant="info" className="flex items-center gap-2" data-testid="solution-banner">
            <Boxes className="h-4 w-4 shrink-0" aria-hidden />
            <span>This component is a <span className="font-medium">Solution</span> — it groups and ships other components together.</span>
          </StatusBanner>
        )}

        {warnings.length > 0 && (
          <StatusBanner variant="warning" data-testid="component-warnings">
            <ul className="space-y-1">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
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
          <EditorSidebarNav
            sections={buildEditorNavSections({
              component,
              showSolutionToggle,
              releaseProcessVisible: autoReleaseFc.visibility !== 'hidden',
              isAdmin,
              teamCityIssueCount,
              hasProblems,
              componentValidation,
            })}
            activeValue={activeTab}
          />

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
                  <BuildTab
                    section={buildSection} canEdit={canEdit} conflictError={buildConflict}
                    buildWorkingDirectory={vcsSection.effectiveBuildWorkingDirectory}
                    onEditBuildWorkingDirectory={() => setActiveTab('vcs')}
                  />
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

            <TabsContent value="release-process">
              <EditSurface canEdit={canEdit} label="Release Process">
                <ReleaseProcessTab form={form} />
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

            <TabsContent value={AS_CODE_TAB}>
              <AsCodeTab key={asCodeKey} component={component} highlightLine={asCodeLine} />
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
              <UnregisteredReleaseContent
                hasProblems={hasProblems}
                componentValidation={componentValidation}
                onCopyVersions={handleCopyVersions}
              />
            </TabsContent>

            {/* Single sticky save bar — governs the WHOLE component (one combined
                PATCH), replacing the old per-tab Save buttons. Rendered for
                read-only viewers too (disabled, with the cannot-edit tooltip) so
                the save affordance is consistent. */}
            <SaveBar
              dirty={dirty}
              canEdit={canEdit}
              isSaving={updateMutation.isPending}
              blockedReason={saveBlockedReason(
                fieldConfigLoading,
                ownerValidating,
                ownershipIssues,
                mavenPrefixIssues,
                vcsHostIssues,
                renameKeyBlocked,
              )}
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

      <ArchiveComponentDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        componentName={component.name}
        componentOwner={component.componentOwner}
        readiness={archiveReadiness}
        canConfirm={canConfirmArchive}
        isPending={deleteMutation.isPending}
        jiraBaseUrl={jiraBaseUrl}
        currentUsername={user?.username}
        onArchive={handleArchive}
      />
    </Layout>
  )
}

/**
 * Route entry — the UUID resolver. The route segment is idOrName (UUID or key);
 * `useComponent(routeId)` is the only place a key may flow — everything UUID-only
 * mounts once `component.id` resolves (firing it with a key 400s). The page
 * stays subscribed to ['component', routeId], so the save hooks and 409
 * refetches take routeId as a cache-alias key.
 *
 * Baseline/version coupling: the combined PATCH sends component.version AND
 * the desired-full-set built from the override baseline — a stale baseline
 * paired with a fresh version could drop a concurrently-added row. The two
 * queries move in lockstep (shared invalidations + window-focus refetches),
 * so that pairing doesn't arise in practice.
 */
export function ComponentDetailPage() {
  const { id: routeId } = useParams<{ id: string }>()
  const { data: component, isLoading, error } = useComponent(routeId ?? '')
  const { data: serverOverrides = [], isLoading: overridesLoading } = useFieldOverrides(component?.id ?? '')

  // The error page is only for a component that never resolved — a failed
  // background refetch must not unmount the editor and discard unsaved work.
  if (!component) {
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
    <OverridesDraftProvider componentId={component.id} serverOverrides={serverOverrides} serverLoading={overridesLoading}>
      <ComponentDetailEditor component={component} routeId={routeId ?? ''} />
    </OverridesDraftProvider>
  )
}
