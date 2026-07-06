import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  useForm,
  useFieldArray,
  Controller,
  type UseFormRegisterReturn,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronLeft, ChevronRight, Plus, X, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { PeopleInput } from '../components/ui/PeopleInput'
import { PeopleListInput } from '../components/ui/PeopleListInput'
import { ModeSelect } from '../components/ui/ModeSelect'
import { ArtifactTokensInput } from '../components/ui/ArtifactTokensInput'
import { InlineError } from '../components/ui/inline-error'
import { StatusBanner } from '../components/ui/status-banner'
import { SkeletonBlock } from '../components/ui/skeleton-block'
import { FieldLabelText } from '../components/ui/FieldLabelText'
import { FieldInfo } from '../components/ui/FieldInfo'
import { JiraVersionPreview } from '../components/editor/JiraVersionPreview'
import { UnsavedChangesGuard } from '../components/editor/UnsavedChangesGuard'
import { cn } from '../lib/utils'
import { hostOf } from '../lib/vcsHost'
import { useFieldOptions } from '../hooks/useFieldOptions'
import { useSupportedGroups } from '../hooks/useSupportedGroups'
import { usePortalLinks, usePortalConfig } from '../hooks/useInfo'
import { useFieldConfig, useComponentDefaults } from '../hooks/useAdminConfig'
import { isFieldEditableFor, useFieldEditable, useFieldConfigEntry } from '../hooks/useFieldConfig'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useComponent, useCreateComponent } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { ApiError } from '../lib/api'
import { classifyConflictBody } from '../lib/conflict'
import { parseServerFieldErrors } from '../lib/serverErrors'
import { lookupEmployee, useEmployeeStatuses } from '../hooks/useEmployees'
import {
  buildCreateRequest,
  vcsBlockApplies,
  DEPRECATED_BUILD_SYSTEMS,
  type CreateFormValues,
} from '../lib/component/buildCreateRequest'
import {
  makeCreateSchema,
  initialValues,
  flagsForProfile,
  profileFromSource,
  PROFILE_META,
  DEFAULT_SCRATCH_PROFILE,
  type ComponentProfile,
  type ComponentDefaults,
} from '../lib/component/createFormModel'
import type { ComponentDetail } from '../lib/types'
import { OWNERSHIP_MODES } from '../lib/artifactOwnership'
import { validateJiraKey, normalizeJiraKey, normalizeChangeComment } from '../lib/editor/jiraKey'

type StepId = 'profile' | 'general' | 'build' | 'vcs' | 'jira' | 'distribution' | 'escrow' | 'review'

const STEP_LABELS: Record<StepId, string> = {
  profile: 'Profile',
  general: 'General',
  build: 'Build',
  vcs: 'VCS',
  jira: 'Jira',
  distribution: 'Distribution',
  escrow: 'Escrow',
  review: 'Review & create',
}

const STEP_SUBTITLES: Record<StepId, string> = {
  profile: 'What are you creating?',
  general: 'Identity & ownership',
  build: 'Build system & artifacts',
  vcs: 'Repository & branch',
  jira: 'Project & versions',
  distribution: 'Docker & coordinate',
  escrow: 'Source escrow generation',
  review: 'Summary & save',
}

const SCRATCH_STEPS: StepId[] = ['profile', 'general', 'build', 'vcs', 'jira', 'distribution', 'escrow', 'review']
// Clone keeps the Profile step too: the profile is pre-derived from the source
// but stays editable (changing it resets the Component Key + recomputes flags),
// per the brief. It is not a gate in clone (a profile is always pre-selected).
const CLONE_STEPS: StepId[] = ['profile', 'general', 'build', 'vcs', 'jira', 'distribution', 'escrow', 'review']

// Map a zod-issue / RHF-error field path to the wizard step that owns it.
function stepOfField(path: string): StepId {
  const head = path.split('.')[0]
  switch (head) {
    case 'buildSystem':
    case 'ownership':
      return 'build'
    case 'vcsUrl':
    case 'vcsTag':
    case 'vcsBranch':
      return 'vcs'
    case 'jiraProjectKey':
    case 'versionPrefix':
    case 'versionFormat':
    case 'lineVersionFormat':
    case 'minorVersionFormat':
    case 'releaseVersionFormat':
    case 'buildVersionFormat':
      return 'jira'
    case 'coordinate':
      return 'distribution'
    // Both the RHF field name (`escrowGeneration`) and the CRS aspect path head
    // (`escrow` from `escrow.generation`) route to the Escrow step.
    case 'escrowGeneration':
    case 'escrow':
      return 'escrow'
    default:
      return 'general'
  }
}

/** Entry button on the component list — navigates to the wizard route. */
export function CreateComponentButton() {
  const navigate = useNavigate()
  return (
    <Button onClick={() => navigate('/components/new')}>
      <Plus className="h-4 w-4" />
      New Component
    </Button>
  )
}

/**
 * Full-page create/clone wizard at `/components/new` (scratch) and
 * `/components/new?from={id}` (clone). Replaces the old modal. Reuses the shared
 * create form model (schema, defaults, buildCreateRequest) and shared controls.
 */
// The wizard is presented as a near-fullscreen dialog over a dimmed backdrop.
// `/components/new` is its own route (the list is not mounted behind it), so the
// backdrop is neutral rather than the live list. The width override drops the
// global `sm:max-w-lg` at the call site only.
const DIALOG_CLASS =
  'w-[96vw] max-w-[1560px] h-[96vh] p-0 overflow-hidden flex flex-col gap-0 rounded-[14px]'

export function CreateComponentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sourceId = searchParams.get('from') ?? ''
  const isClone = !!sourceId
  // Bumped by the wizard's "Create another" to remount it with a fresh blank form.
  const [remountKey, setRemountKey] = useState(0)

  const { data: source, error } = useComponent(sourceId)
  const defaults = useComponentDefaults({ retry: false })
  const componentDefaults = (defaults.data ?? {}) as ComponentDefaults
  const ready = (!isClone || (!!source && !error)) && (defaults.isSuccess || defaults.isError)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // The dialog is always open; closing it (Cancel / ✕ / Esc / backdrop)
        // navigates back to the list. The UnsavedChangesGuard still intercepts a
        // dirty form because the navigation goes through the router.
        if (!next) navigate('/components')
      }}
    >
      <DialogContent className={DIALOG_CLASS}>
        <DialogDescription className="sr-only">
          Fill in the steps to create a new component.
        </DialogDescription>
        {isClone && error ? (
          <div className="flex flex-1 flex-col gap-4 p-6">
            <DialogTitle>Clone component</DialogTitle>
            <InlineError
              message={
                <>
                  Failed to load the source component:{' '}
                  {error instanceof Error ? error.message : String(error)}
                </>
              }
            />
          </div>
        ) : !ready ? (
          <div className="flex flex-1 flex-col gap-4 p-6">
            <DialogTitle className="sr-only">Create component</DialogTitle>
            <SkeletonBlock className="h-9 w-64" />
            <SkeletonBlock className="h-9 w-full" />
            <SkeletonBlock className="h-9 w-full" />
          </div>
        ) : (
          <CreateComponentWizard
            key={`${source?.id ?? 'scratch'}-${remountKey}`}
            source={source ?? null}
            isClone={isClone}
            defaults={componentDefaults}
            onCreateAnother={() => setRemountKey((k) => k + 1)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface WizardProps {
  source: ComponentDetail | null
  isClone: boolean
  defaults: ComponentDefaults
  /** Reset the wizard to a blank scratch form (remount) after a successful create. */
  onCreateAnother: () => void
}

function CreateComponentWizard({ source, isClone, defaults, onCreateAnother }: WizardProps) {
  const navigate = useNavigate()
  const createMutation = useCreateComponent()
  const { toast } = useToast()

  const { data: fieldConfigData, isLoading: fcLoading, isError: fcError } = useFieldConfig()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const editable = useCallback(
    (field: string) => {
      if (fcLoading || fcError || userLoading) return false
      return isFieldEditableFor(fieldConfigData, `component.${field}`, currentUser)
    },
    [fieldConfigData, fcLoading, fcError, currentUser, userLoading],
  )
  const { groups: supportedGroups } = useSupportedGroups()
  const { data: portalLinks } = usePortalLinks()
  const { data: portalConfig } = usePortalConfig()
  const solutionPatterns = portalConfig?.solutionKeyPatterns
  const gitBaseUrl = portalLinks?.gitBaseUrl

  // Profile (brief "Choose component profile"). Scratch pre-selects the most
  // common profile ("Regular external component") so the step is ready to go;
  // clone derives it from the source (editable afterwards).
  const derived = useMemo(
    () => (source ? profileFromSource(source, solutionPatterns) : null),
    [source, solutionPatterns],
  )
  const [profile, setProfile] = useState<ComponentProfile | null>(
    derived?.profile ?? DEFAULT_SCRATCH_PROFILE,
  )
  const [explicitAnswer, setExplicitAnswer] = useState<boolean>(derived?.explicit ?? false)
  // The clone profile/explicit are seeded once from `derived`, but `derived` is
  // recomputed when solutionKeyPatterns arrive after mount (portal-config loads
  // async), which can change the derived profile (e.g. solution → dmp-bundle).
  // Re-seed from `derived` until the user actually picks a profile, so a late
  // config load never looks like an unsaved edit.
  const userPickedProfile = useRef(false)
  useEffect(() => {
    if (userPickedProfile.current || !derived) return
    setProfile(derived.profile)
    setExplicitAnswer(derived.explicit)
  }, [derived])
  // A profile is needed for the (profile-dependent) key rule even before the
  // scratch gate is passed; fall back to the base-regex profile for the schema.
  const effectiveProfile: ComponentProfile = profile ?? 'regular-external'

  const schema = useMemo(
    () => makeCreateSchema(editable, supportedGroups, gitBaseUrl, effectiveProfile, solutionPatterns),
    [editable, supportedGroups, gitBaseUrl, effectiveProfile, solutionPatterns],
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    control,
    trigger,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(schema),
    // Live validation so inline field errors surface as the user types (the
    // stepper's cross-step markers use an independent safeParse).
    mode: 'onChange',
    defaultValues: initialValues(source, defaults),
  })

  const values = watch()

  const { options: buildSystems, isLoading: buildSystemsLoading } = useFieldOptions('buildSystem')
  const offeredBuildSystems = useMemo(
    () => buildSystems.filter((bs) => !DEPRECATED_BUILD_SYSTEMS.has(bs)),
    [buildSystems],
  )

  // Escrow · Generation: the only escrow field exposed on the wizard. Its enum
  // vocabulary comes from the same meta endpoint the editor's EscrowTab uses
  // (/components/meta/escrow-generations). Visibility/editability are gated on
  // the field-config key `escrow.generation` (NOT `component.escrow.generation`),
  // mirroring EscrowTab; `useFieldEditable` fails closed while field-config
  // loads, consistent with the wizard's `editable()`.
  const {
    entry: escrowGenerationEntry,
    isLoading: escrowFcLoading,
    isError: escrowFcError,
  } = useFieldConfigEntry('escrow.generation')
  // Fail closed: while field-config is loading/errored the entry defaults to
  // `editable`, so treat generation as hidden until we actually know — otherwise a
  // truly-hidden field flashes visible on load. Mirrors useFieldEditable's fail-closed.
  const escrowGenerationHidden =
    escrowFcLoading || escrowFcError || escrowGenerationEntry.visibility === 'hidden'
  const escrowGenerationEditable = useFieldEditable('escrow.generation')
  // Skip the escrow-generations meta fetch when the field is hidden — the control
  // isn't rendered and generation isn't sent, so the vocabulary is never needed.
  const { options: escrowGenerations } = useFieldOptions('generation', {
    enabled: !escrowGenerationHidden,
  })
  // Show the Generation control only when its value is actually created: editable
  // (form value) or a clone (seeded source value, copied). Otherwise — hidden, or
  // scratch + readonly (a seeded default that scratch never sends) — show the info
  // note instead, keeping the step UI in sync with the Review summary + payload.
  const showEscrowGeneration = !escrowGenerationHidden && (escrowGenerationEditable || isClone)

  const explicit = values.distributionExplicit
  const external = values.distributionExternal
  const gated = explicit && external
  const coordinateType = values.coordinate.type
  const buildSystemValue = values.buildSystem
  const vcsApplies = vcsBlockApplies(buildSystemValue)

  const ownershipRows = useFieldArray({ control, name: 'ownership' })
  const ownershipValues = values.ownership
  const lastOwnershipRow = ownershipValues[ownershipValues.length - 1]
  const canAddOwnershipRow =
    !!lastOwnershipRow &&
    lastOwnershipRow.groupId.trim() !== '' &&
    (lastOwnershipRow.mode !== 'EXPLICIT' || lastOwnershipRow.tokens.length > 0)

  const { data: employeeStatuses } = useEmployeeStatuses([
    ...values.releaseManager,
    ...values.securityChampion,
  ])

  // Apply the chosen profile: set the derived flags and (on a real change) reset
  // the Component Key so the profile-dependent rule is re-entered (brief).
  const applyProfile = useCallback(
    (next: ComponentProfile, nextExplicit: boolean) => {
      userPickedProfile.current = true
      const changed = next !== profile
      setProfile(next)
      setExplicitAnswer(nextExplicit)
      const flags = flagsForProfile(next, nextExplicit)
      // Mark the form dirty when the profile OR its derived distribution flags
      // change — e.g. toggling the explicit-distribution answer for the SAME
      // profile still changes submitted values. A profile-only change that leaves
      // the RHF flags at their defaults is caught separately by `profileTouched`
      // (see the UnsavedChangesGuard), since the profile also drives non-RHF
      // submitted values such as the `solution` flag.
      const flagsChanged =
        flags.distributionExternal !== getValues('distributionExternal') ||
        flags.distributionExplicit !== getValues('distributionExplicit')
      const markDirty = changed || flagsChanged
      setValue('distributionExternal', flags.distributionExternal, { shouldValidate: false, shouldDirty: markDirty })
      setValue('distributionExplicit', flags.distributionExplicit, { shouldValidate: false, shouldDirty: markDirty })
      if (changed) {
        setValue('name', '', { shouldValidate: false })
        clearErrors('name')
      }
      void trigger('name')
    },
    [profile, setValue, getValues, clearErrors, trigger],
  )

  // Scratch: seed the owner from the current user once (brief §Ownership).
  const ownerSeeded = useRef(false)
  useEffect(() => {
    if (isClone || ownerSeeded.current) return
    if (!getValues('componentOwner') && currentUser?.username) {
      setValue('componentOwner', currentUser.username, { shouldValidate: false })
      ownerSeeded.current = true
    }
  }, [isClone, currentUser, getValues, setValue])

  // Drop a prefilled default build system no longer offered (config drift).
  useEffect(() => {
    if (buildSystemsLoading || offeredBuildSystems.length === 0) return
    if (buildSystemValue && !offeredBuildSystems.includes(buildSystemValue)) {
      setValue('buildSystem', '', { shouldValidate: false })
    }
  }, [buildSystemsLoading, offeredBuildSystems, buildSystemValue, setValue])

  // versionPrefix mirrors the key in scratch until edited.
  const [versionPrefixEdited, setVersionPrefixEdited] = useState(false)
  useEffect(() => {
    if (isClone || versionPrefixEdited) return
    setValue('versionPrefix', values.name, { shouldValidate: false })
  }, [values.name, isClone, versionPrefixEdited, setValue])

  // When Maven/Package coordinates are not available (not explicit+external),
  // keep the single coordinate on Docker so the gated sub-fields never linger.
  useEffect(() => {
    if (!gated && coordinateType !== 'docker') {
      setValue('coordinate.type', 'docker', { shouldValidate: false })
    }
  }, [gated, coordinateType, setValue])

  const setMinorSeparate = (separate: boolean) => {
    setValue('minorSeparate', separate, { shouldValidate: false })
    setValue(
      'minorVersionFormat',
      separate ? getValues('minorVersionFormat') || getValues('lineVersionFormat') : '',
      { shouldValidate: false },
    )
  }
  const setBuildSeparate = (separate: boolean) => {
    setValue('buildSeparate', separate, { shouldValidate: false })
    setValue(
      'buildVersionFormat',
      separate ? getValues('buildVersionFormat') || getValues('releaseVersionFormat') : '',
      { shouldValidate: false },
    )
  }

  const vcsHost = hostOf(gitBaseUrl)
  const vcsUrlPlaceholder = vcsHost
    ? `ssh://git@${vcsHost}/PROJECT/repo.git`
    : 'ssh://git@host/path/repo.git'

  // Change metadata (outside RHF — recorded on the audit row). Jira key REQUIRED
  // at create (required-guard over the shared validateJiraKey).
  const [jiraTaskKey, setJiraTaskKey] = useState('')
  const [changeComment, setChangeComment] = useState('')
  // Cross-highlight link between the Jira version-format fields and the live
  // Version Preview rows (same control the editor uses).
  const [jiraHoveredField, setJiraHoveredField] = useState<string | null>(null)
  const jiraFormatError = validateJiraKey(jiraTaskKey)
  const jiraKeyError = jiraFormatError ?? (jiraTaskKey.trim() === '' ? 'Jira task key is required' : null)

  // Server error, routed to its step (banner + stepper marker + click-to-step).
  const [serverError, setServerError] = useState<{ message: string; stepId: StepId } | null>(null)

  // ---- Steps + cross-step validity ------------------------------------------
  const steps = isClone ? CLONE_STEPS : SCRATCH_STEPS
  const [current, setCurrent] = useState<StepId>(isClone ? 'general' : 'profile')
  // Steps the user has landed on, plus whether a Create was attempted. Together
  // they gate the rail's invalid/done markers so nothing is flagged eagerly on
  // first load — only after a step is visited (and left) or a submit is tried.
  const [visitedSteps, setVisitedSteps] = useState<Set<StepId>>(
    () => new Set<StepId>([isClone ? 'general' : 'profile']),
  )
  const [attempted, setAttempted] = useState(false)
  const enterStep = (step: StepId) => {
    setCurrent(step)
    setVisitedSteps((prev) => (prev.has(step) ? prev : new Set(prev).add(step)))
  }

  // Cross-step validity from a full parse (independent of RHF's touched state) so
  // the stepper can mark ANY step invalid, not just the current one.
  const parseIssues = useMemo(() => {
    const result = schema.safeParse(values)
    if (result.success) return [] as { message: string; step: StepId }[]
    return result.error.issues.map((issue) => ({
      message: issue.message,
      step: stepOfField(issue.path.join('.')),
    }))
  }, [schema, values])

  const invalidSteps = useMemo(() => {
    const set = new Set<StepId>()
    for (const issue of parseIssues) set.add(issue.step)
    if (!isClone && profile === null) set.add('profile')
    if (jiraKeyError) set.add('review')
    if (serverError) set.add(serverError.stepId)
    return set
  }, [parseIssues, isClone, profile, jiraKeyError, serverError])

  // Invalid steps actually shown as such: only those visited (or all, once a
  // Create was attempted), and never the step you are currently on until you
  // leave it or submit. This is the eager-validation fix.
  const shownInvalidSteps = useMemo(() => {
    const set = new Set<StepId>()
    for (const step of invalidSteps) {
      if (!attempted && !visitedSteps.has(step)) continue
      if (step === current && !attempted) continue
      set.add(step)
    }
    return set
  }, [invalidSteps, visitedSteps, attempted, current])

  const currentIndex = steps.indexOf(current)
  const isLast = currentIndex === steps.length - 1
  const currentValid = !invalidSteps.has(current)

  // Cross-step "another step is broken" banner, shown above every step's body so
  // a late-gate break is noticeable while you browse (not only on Review). On the
  // Review step use the raw invalid set — it explains a disabled Create even for
  // steps never visited; elsewhere use the eager-validation-gated set so a
  // pristine wizard stays quiet. Never lists the step you are currently on.
  const crossStepInvalid = [...(current === 'review' ? invalidSteps : shownInvalidSteps)].filter(
    (s) => s !== current,
  )

  const goToStep = (step: StepId) => {
    if (steps.includes(step)) enterStep(step)
  }
  const goNext = () => {
    if (!currentValid) return
    const next = steps[currentIndex + 1]
    if (next) enterStep(next)
  }
  const goBack = () => {
    const prev = steps[currentIndex - 1]
    if (prev) enterStep(prev)
  }

  // On a successful create, flip `submitted` (releases the unsaved-changes guard)
  // and swap the wizard body for a success panel (below) offering "Go to
  // component" / "Create another" — rather than redirecting immediately.
  const [submitted, setSubmitted] = useState(false)
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null)

  async function onSubmit(formValues: CreateFormValues) {
    setAttempted(true)
    if (jiraKeyError) return
    setServerError(null)
    try {
      const base = buildCreateRequest(
        formValues,
        source ?? undefined,
        editable,
        escrowGenerationEditable,
        escrowGenerationHidden,
      )
      const flags = flagsForProfile(effectiveProfile, explicitAnswer)
      const request = {
        ...base,
        // Solution comes from the profile (scratch has no source to copy it
        // from; a clone may have changed profile). Only sent when the field is
        // editable — otherwise the builder already stripped it.
        ...(editable('solution') ? { solution: flags.solution } : {}),
        jiraTaskKey: normalizeJiraKey(jiraTaskKey),
        changeComment: normalizeChangeComment(changeComment),
      }
      const component = await createMutation.mutateAsync(request)
      toast({ title: 'Component created', description: `"${component.name}" was created.` })
      setSubmitted(true)
      setCreated({ id: component.id, name: component.name })
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err)
      let stepId: StepId = 'review'
      if (err instanceof ApiError && err.status === 409) {
        message = classifyConflictBody(err.rawBody).errorMessage
          ?? 'A component with this name already exists.'
        // A save-time uniqueness / data-integrity conflict on Produced Artifacts
        // routes to the Build step (same as the 400 field-error case), not the
        // Review banner.
        const cf = parseServerFieldErrors(err.rawBody)
        if (cf.get('artifactIds') || cf.get('ownership')) stepId = 'build'
      }
      if (err instanceof ApiError && err.status === 400) {
        const fieldErrors = parseServerFieldErrors(err.rawBody)
        if (fieldErrors.get('name')) {
          setError('name', { type: 'server', message: fieldErrors.get('name')! })
          stepId = 'general'
        }
        if (editable('displayName') && fieldErrors.get('displayName')) {
          setError('displayName', { type: 'server', message: fieldErrors.get('displayName')! })
          stepId = 'general'
        }
        if (fieldErrors.get('componentOwner')) {
          setError('componentOwner', { type: 'server', message: fieldErrors.get('componentOwner')! })
          stepId = 'general'
        }
        if (gated) {
          for (const field of ['copyright', 'releaseManager', 'securityChampion'] as const) {
            const msg = fieldErrors.get(field)
            if (msg) {
              setError(field, { type: 'server', message: msg })
              stepId = 'general'
            }
          }
          const distributionMsg = fieldErrors.get('distribution')
          if (distributionMsg) {
            setError('coordinate', { type: 'server', message: distributionMsg })
            stepId = 'distribution'
          }
        }
        // A Produced-Artifacts value conflict routes to the Build step.
        if (fieldErrors.get('artifactIds') || fieldErrors.get('ownership')) {
          stepId = 'build'
        }
        // A rejected escrow generation (stale/invalid enum value) routes to the
        // Escrow step AND surfaces inline under the field (like the other mapped
        // fields), so the reason survives the toast. CRS reports the aspect scalar
        // as the bare `generation` field name (parseServerFieldErrors never emits
        // dotted keys).
        const generationMsg = fieldErrors.get('generation')
        if (generationMsg) {
          setError('escrowGeneration', { type: 'server', message: generationMsg })
          stepId = 'escrow'
        }
      }
      setServerError({ message, stepId })
      enterStep(stepId)
      toast({ title: 'Failed to create component', description: message, variant: 'destructive' })
    }
  }

  // Hold Create while the typed owner's async directory validation is in flight.
  const [ownerValidating, setOwnerValidating] = useState(false)
  const submitDisabled =
    isSubmitting ||
    createMutation.isPending ||
    ownerValidating ||
    !!jiraKeyError ||
    fcLoading ||
    userLoading ||
    // Client-side blocking issues: any invalid field (schema parse) or, in
    // scratch, an unchosen Profile. Excludes serverError (so a failed submit can
    // be retried after the user edits). Prevents bypassing the Profile gate by
    // jumping straight to Review via the stepper.
    parseIssues.length > 0 ||
    (!isClone && profile === null)

  // ---- Rendering helpers ----------------------------------------------------

  // Amber input border + associated "Re-enter" pill for the unique-per-component
  // fields the user must re-enter in clone mode. Each pill gets a stable id so the
  // matching input can reference it via aria-describedby.
  const reenterBorder = isClone ? 'border-amber-400 focus-visible:ring-amber-400' : ''
  const reenterId = (field: string) => (isClone ? `${field}-reenter` : undefined)
  const reenterBadgeFor = (field: string) => {
    const id = reenterId(field)
    return id ? <ReenterPill id={id} /> : undefined
  }

  // Roving-radio arrow-key navigation, shared by the profile tiles and the
  // explicit-distribution segment.
  const moveRadio = (
    e: React.KeyboardEvent,
    count: number,
    index: number,
    select: (i: number) => void,
  ) => {
    const delta =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : 0
    if (!delta) return
    e.preventDefault()
    const next = (index + delta + count) % count
    select(next)
    // Roving tabindex: carry keyboard focus to the newly selected radio in the
    // same group so it doesn't stay stranded on the previous (now tabIndex=-1)
    // one. The radio nodes persist across the re-render (keyed).
    const group = e.currentTarget.closest('[role="radiogroup"]')
    group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
  }

  const renderProfileStep = () => (
    <div className="space-y-6">
      <StepHeading
        title="Choose component profile"
        subtitle="The profile sets how the component is classified and how its key is named."
      />
      <div role="radiogroup" aria-label="Component profile" className="grid gap-3 sm:grid-cols-2">
        {PROFILE_META.map((p, idx) => {
          const selected = profile === p.id
          const tabbable = selected || (profile === null && idx === 0)
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={p.label}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => applyProfile(p.id, explicitAnswer)}
              onKeyDown={(e) =>
                moveRadio(e, PROFILE_META.length, idx, (i) => {
                  const next = PROFILE_META[i]
                  if (next) applyProfile(next.id, explicitAnswer)
                })
              }
              className={cn(
                'flex gap-3 rounded-md border p-3 text-left transition-colors',
                selected ? 'border-ring bg-muted' : 'border-border hover:bg-muted/50',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-ring' : 'border-muted-foreground/40',
                )}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-foreground" />}
              </span>
              <span className="flex flex-col">
                <span className="font-medium">{p.label}</span>
                <span className="mt-1 text-sm text-muted-foreground">{p.description}</span>
              </span>
            </button>
          )
        })}
      </div>
      {profile && (
        <p className="text-sm text-muted-foreground">
          This component will be:{' '}
          <span className="font-medium text-foreground">{external ? 'External' : 'Internal'}</span>
          {' · '}
          <span className="font-medium text-foreground">
            {explicit ? 'Explicit' : 'Not explicit'}
          </span>
        </p>
      )}
      {profile && PROFILE_META.find((p) => p.id === profile)?.asksExplicit && (
        <fieldset className="space-y-2 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium">Has explicit distribution?</legend>
          <p className="text-sm text-muted-foreground">
            Does the component have its own distribution — can it be shipped as a separate unit? No
            → it is shipped inside a packaging component&apos;s distribution.
          </p>
          <div role="radiogroup" aria-label="Has explicit distribution" className="flex gap-2 pt-1">
            {[
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ].map((opt, idx, arr) => {
              const selected = explicitAnswer === opt.value
              return (
                <Button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  variant={selected ? 'default' : 'outline'}
                  size="sm"
                  onKeyDown={(e) =>
                    moveRadio(e, arr.length, idx, (i) => {
                      const opt = arr[i]
                      if (opt) applyProfile(profile, opt.value)
                    })
                  }
                  onClick={() => applyProfile(profile, opt.value)}
                >
                  {opt.label}
                </Button>
              )
            })}
          </div>
        </fieldset>
      )}
    </div>
  )

  const classificationRecap = () => {
    const parts = [
      external ? 'External' : 'Internal',
      explicit ? 'explicit distribution' : 'implicit distribution',
    ]
    if (flagsForProfile(effectiveProfile, explicitAnswer).solution) parts.push('solution')
    return parts.join(', ')
  }

  const renderGeneralStep = () => (
    <div className="space-y-6">
      <StepHeading title="General" subtitle="Identity, ownership, and classification." />
      <SectionHeader title="Identity" />
      <Field label="Component Key" htmlFor="create-name" path="component.name" required badge={reenterBadgeFor('create-name')}>
        <Input id="create-name" className={reenterBorder} placeholder="my-component" autoFocus aria-describedby={reenterId('create-name')} {...register('name')} />
        <FieldError message={errors.name?.message} />
      </Field>
      {editable('displayName') && (
        <Field
          label="Display Name"
          htmlFor="create-displayName"
          path="component.displayName"
          required={gated}
        >
          <Input id="create-displayName" placeholder="My Component" {...register('displayName')} />
          <FieldError message={errors.displayName?.message} />
        </Field>
      )}

      <SectionHeader title="Ownership" />
      <Field label="Component Owner" htmlFor="create-componentOwner" path="component.componentOwner" required>
        <PeopleInput
          id="create-componentOwner"
          value={values.componentOwner}
          onChange={(value) =>
            setValue('componentOwner', value, { shouldValidate: true, shouldDirty: true })
          }
          placeholder="AD userkey"
          lookupFn={lookupEmployee}
          onValidatingChange={setOwnerValidating}
        />
        <FieldError message={errors.componentOwner?.message} />
      </Field>
      {editable('releaseManager') && (
        <Field label="Release Managers" path="component.releaseManager" required={gated}>
          <PeopleListInput
            value={values.releaseManager}
            onChange={(val) => setValue('releaseManager', val, { shouldValidate: true, shouldDirty: true })}
            lookupFn={lookupEmployee}
            statuses={employeeStatuses}
          />
          <FieldError message={errors.releaseManager?.message} />
        </Field>
      )}
      {editable('securityChampion') && (
        <Field label="Security Champions" path="component.securityChampion" required={gated}>
          <PeopleListInput
            value={values.securityChampion}
            onChange={(val) => setValue('securityChampion', val, { shouldValidate: true, shouldDirty: true })}
            lookupFn={lookupEmployee}
            statuses={employeeStatuses}
          />
          <FieldError message={errors.securityChampion?.message} />
        </Field>
      )}

      {editable('copyright') && (
        <>
          <SectionHeader title="Metadata" />
          <Field label="Copyright" htmlFor="create-copyright" path="component.copyright">
            <Input id="create-copyright" placeholder="(c) 2026 Acme Inc." {...register('copyright')} />
            <p className="text-xs text-muted-foreground">Required if a copyright catalog is configured.</p>
            <FieldError message={errors.copyright?.message} />
          </Field>
        </>
      )}

      <SectionHeader title="Classification" />
      <p className="text-sm text-muted-foreground">
        Derived from the profile: <span className="font-medium text-foreground">{classificationRecap()}</span>.
      </p>
      {external && editable('clientCode') && (
        <Field label="Client Code" htmlFor="create-clientCode" path="component.clientCode">
          <Input id="create-clientCode" placeholder="CLIENT_CODE" {...register('clientCode')} />
          <FieldError message={errors.clientCode?.message} />
        </Field>
      )}
    </div>
  )

  const renderBuildStep = () => (
    <div className="space-y-6">
      <StepHeading title="Build" subtitle="The build system determines whether a VCS root is required." />
      <SectionHeader title="Build System" />
      <Field label="Build System" htmlFor="create-buildSystem" path="build.buildSystem" required>
        <select
          id="create-buildSystem"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          aria-required
          aria-invalid={Boolean(errors.buildSystem)}
          {...register('buildSystem')}
        >
          <option value="">Select build system</option>
          {offeredBuildSystems.map((bs) => (
            <option key={bs} value={bs}>
              {bs}
            </option>
          ))}
        </select>
        <FieldError message={errors.buildSystem?.message} />
      </Field>

      <SectionHeader title="Produced Artifacts" subtitle="Artifacts this component produces." />
      <div className="space-y-2" data-testid="create-ownership">
        {ownershipRows.fields.map((row, i) => {
          const rowMode = ownershipValues[i]?.mode
          return (
            <div key={row.id} className="space-y-1.5 rounded-md border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <Input
                    aria-label={`Group ID ${i + 1}`}
                    className="font-mono"
                    placeholder={supportedGroups[0] ?? 'com.example.foo'}
                    aria-invalid={Boolean(errors.ownership?.[i]?.groupId)}
                    {...register(`ownership.${i}.groupId` as const)}
                  />
                  {errors.ownership?.[i]?.groupId && (
                    <p className="text-xs text-destructive">{errors.ownership[i]!.groupId!.message}</p>
                  )}
                </div>
                {ownershipRows.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove group ${i + 1}`}
                    onClick={() => ownershipRows.remove(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Controller
                control={control}
                name={`ownership.${i}.mode` as const}
                render={({ field }) => (
                  <ModeSelect value={field.value} id={`create-mode-${i}`} onChange={field.onChange} />
                )}
              />
              {rowMode === 'EXPLICIT' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Specific artifacts <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    control={control}
                    name={`ownership.${i}.tokens` as const}
                    render={({ field }) => (
                      <ArtifactTokensInput
                        tokens={field.value}
                        ariaLabel="Specific artifacts"
                        onChange={field.onChange}
                      />
                    )}
                  />
                  {errors.ownership?.[i]?.tokens && (
                    <p className="text-xs text-destructive">{errors.ownership[i]!.tokens!.message}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAddOwnershipRow}
          onClick={() => ownershipRows.append({ groupId: '', mode: 'ALL', tokens: [] })}
        >
          <Plus className="h-4 w-4" />
          Add one more groupId
        </Button>
        <p className="text-xs text-muted-foreground">
          Add one Group ID per row; per-range rules are added later in the editor.
        </p>
      </div>
    </div>
  )

  const renderVcsStep = () => (
    <div className="space-y-6">
      <StepHeading title="VCS" subtitle="Where the component's source is tracked." />
      {vcsApplies ? (
        <>
          <Field label="VCS Path" htmlFor="create-vcsUrl" path="vcs.vcsPath" required badge={reenterBadgeFor('create-vcsUrl')}>
            <Input
              id="create-vcsUrl"
              className={cn('font-mono text-xs', reenterBorder)}
              placeholder={vcsUrlPlaceholder}
              aria-required
              aria-invalid={Boolean(errors.vcsUrl)}
              aria-describedby={reenterId('create-vcsUrl')}
              {...register('vcsUrl')}
            />
            <FieldError message={errors.vcsUrl?.message} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Production branch" htmlFor="create-vcsBranch" path="vcs.branch" required>
              <Input
                id="create-vcsBranch"
                className="font-mono text-xs"
                aria-required
                aria-invalid={Boolean(errors.vcsBranch)}
                {...register('vcsBranch')}
              />
              <FieldError message={errors.vcsBranch?.message} />
            </Field>
            <Field label="Tag" htmlFor="create-vcsTag" path="vcs.tag" required>
              <Input
                id="create-vcsTag"
                className="font-mono text-xs"
                aria-required
                aria-invalid={Boolean(errors.vcsTag)}
                {...register('vcsTag')}
              />
              <FieldError message={errors.vcsTag?.message} />
            </Field>
          </div>
        </>
      ) : (
        <StatusBanner variant="info">
          {buildSystemValue
            ? `No VCS root required for ${buildSystemValue}.`
            : 'VCS fields are not required for some build systems; the step shows a note.'}
        </StatusBanner>
      )}
    </div>
  )

  const renderJiraStep = () => (
    <div className="space-y-6">
      <StepHeading title="Jira" subtitle="Project key and how versions are formatted." />
      <SectionHeader title="Jira project" />
      <Field label="Jira Project Key" htmlFor="create-jiraProjectKey" path="jira.projectKey" required badge={reenterBadgeFor('create-jiraProjectKey')}>
        <Input
          id="create-jiraProjectKey"
          className={reenterBorder}
          placeholder="JIRA project key"
          aria-required
          aria-invalid={Boolean(errors.jiraProjectKey)}
          aria-describedby={reenterId('create-jiraProjectKey')}
          {...register('jiraProjectKey')}
        />
        <FieldError message={errors.jiraProjectKey?.message} />
      </Field>

      <SectionHeader title="Version formats" />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Jira Version Prefix" htmlFor="create-versionPrefix" path="jira.versionPrefix">
            <Input
              id="create-versionPrefix"
              placeholder="e.g. the component key"
              {...register('versionPrefix', { onChange: () => setVersionPrefixEdited(true) })}
            />
          </Field>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="create-versionFormat">
                <FieldLabelText path="jira.versionFormat" fallback="Full Version Format in Jira" />
                <span className="ml-1 text-destructive">*</span>
              </Label>
              <FieldInfo path="jira.versionFormat" label="Full Version Format in Jira" />
            </div>
            <Input
              id="create-versionFormat"
              className="font-mono text-xs"
              placeholder="$versionPrefix-$baseVersionFormat"
              aria-required
              aria-invalid={Boolean(errors.versionFormat)}
              {...register('versionFormat')}
            />
            <FieldError message={errors.versionFormat?.message} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="create-lineVersionFormat">
                  <FieldLabelText path="jira.lineVersionFormat" fallback="Line Version Format" />
                  <span className="ml-1 font-normal text-muted-foreground">(Major)</span>
                </Label>
                <FieldInfo path="jira.lineVersionFormat" label="Line Version Format" />
              </div>
              <Input id="create-lineVersionFormat" className="font-mono text-xs" placeholder="e.g. $major.$minor" {...register('lineVersionFormat')} />
            </div>
            <CreateMirrorField
              path="jira.minorVersionFormat"
              fallback="Minor Version Format"
              pill="from Line"
              setLabel="Set separate minor format"
              placeholder="e.g. $major.$minor"
              inputId="create-minorVersionFormat"
              separate={values.minorSeparate}
              leadingValue={values.lineVersionFormat}
              onSetSeparate={() => setMinorSeparate(true)}
              onRemoveSeparate={() => setMinorSeparate(false)}
              inputProps={register('minorVersionFormat')}
            />
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="create-releaseVersionFormat">
                  <FieldLabelText path="jira.releaseVersionFormat" fallback="Release Version Format" />
                </Label>
                <FieldInfo path="jira.releaseVersionFormat" label="Release Version Format" />
              </div>
              <Input id="create-releaseVersionFormat" className="font-mono text-xs" placeholder="$major.$minor.$service" {...register('releaseVersionFormat')} />
            </div>
            <CreateMirrorField
              path="jira.buildVersionFormat"
              fallback="Build Version Format"
              pill="same as release"
              setLabel="Set separate build format"
              placeholder="e.g. $major.$minor.$service.$fix"
              inputId="create-buildVersionFormat"
              separate={values.buildSeparate}
              leadingValue={values.releaseVersionFormat}
              onSetSeparate={() => setBuildSeparate(true)}
              onRemoveSeparate={() => setBuildSeparate(false)}
              inputProps={register('buildVersionFormat')}
            />
          </div>
        </div>
      {/* Live version-ladder preview — same control as the editor's Jira tab,
          stacked below the fields (the wizard column is too narrow for a side
          panel). Create has no per-range overrides and never sets a hotfix
          format (hotfixes are disabled at creation), so overrides=[] / hotfix off. */}
      <aside data-testid="version-preview-slot" className="w-full">
        <JiraVersionPreview
          versionPrefix={values.versionPrefix}
          versionFormat={values.versionFormat}
          lineVersionFormat={values.lineVersionFormat}
          minorVersionFormat={values.minorVersionFormat}
          minorSeparate={values.minorSeparate}
          releaseVersionFormat={values.releaseVersionFormat}
          buildVersionFormat={values.buildVersionFormat}
          buildSeparate={values.buildSeparate}
          hotfixVersionFormat=""
          technical={false}
          hotfixEnabled={false}
          hoveredField={jiraHoveredField}
          onHoverField={setJiraHoveredField}
          overrides={[]}
        />
      </aside>
    </div>
  )

  const selectCoordinateType = (type: CreateFormValues['coordinate']['type']) => {
    setValue(
      'coordinate',
      { type, groupPattern: '', artifactPattern: '', imageName: '', flavor: '', packageType: 'DEB', packageName: '' },
      { shouldValidate: false },
    )
    clearErrors('coordinate')
  }

  const renderDistributionStep = () => (
    <div className="space-y-6">
      <StepHeading title="Distribution" subtitle="How the component's artifacts are published." />
      <SectionHeader title="Docker" subtitle="A Docker image can be published regardless of distribution type." />
      {gated ? (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <Label htmlFor="create-coordinate-type">
                Distribution coordinate <span className="text-destructive">*</span>
              </Label>
              {reenterBadgeFor('create-coordinate-type')}
            </div>
            <select
              id="create-coordinate-type"
              aria-describedby={reenterId('create-coordinate-type')}
              className={cn('h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm', reenterBorder)}
              value={coordinateType}
              onChange={(e) => selectCoordinateType(e.target.value as CreateFormValues['coordinate']['type'])}
            >
              <option value="maven">Maven GAV</option>
              <option value="docker">Docker image</option>
              <option value="package">Package</option>
            </select>
            {coordinateType === 'maven' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-coordinate-groupId" className="text-xs">groupId</Label>
                  <Input id="create-coordinate-groupId" className="font-mono text-xs"
                    placeholder="org.example.alpha" aria-label="groupId"
                    {...register('coordinate.groupPattern')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-coordinate-artifactId" className="text-xs">artifactId</Label>
                  <Input id="create-coordinate-artifactId" className="font-mono text-xs"
                    placeholder="my-component" aria-label="artifactId"
                    {...register('coordinate.artifactPattern')} />
                </div>
              </div>
            )}
            {coordinateType === 'docker' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-coordinate-imageName" className="text-xs">Image Name</Label>
                  <Input
                    id="create-coordinate-imageName"
                    className="font-mono text-xs"
                    placeholder="acme/my-service"
                    aria-label="Image name"
                    {...register('coordinate.imageName')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-coordinate-flavor" className="text-xs">
                    Flavor <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="create-coordinate-flavor"
                    className="font-mono text-xs"
                    placeholder="e.g. alpine"
                    aria-label="Flavor"
                    {...register('coordinate.flavor')}
                  />
                </div>
              </div>
            )}
            {coordinateType === 'package' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="create-coordinate-packageType" className="text-xs">Package Type</Label>
                  <Controller
                    control={control}
                    name="coordinate.packageType"
                    render={({ field }) => (
                      <select
                        id="create-coordinate-packageType"
                        aria-label="Package Type"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={field.value}
                        onChange={field.onChange}
                      >
                        <option value="DEB">DEB</option>
                        <option value="RPM">RPM</option>
                      </select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-coordinate-packageName" className="text-xs">Package Name</Label>
                  <Input id="create-coordinate-packageName" className="font-mono text-xs"
                    placeholder="my-package" aria-label="Package Name"
                    {...register('coordinate.packageName')} />
                </div>
              </div>
            )}
            {errors.coordinate && (
              <p className="text-xs text-destructive">
                {errors.coordinate.message ??
                  errors.coordinate.groupPattern?.message ??
                  errors.coordinate.artifactPattern?.message ??
                  errors.coordinate.imageName?.message ??
                  errors.coordinate.packageName?.message}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="create-imageName">Image Name</Label>
                {reenterBadgeFor('create-imageName')}
              </div>
              <Input id="create-imageName" className={cn('font-mono text-xs', reenterBorder)} placeholder="acme/my-service" aria-label="Image name" aria-describedby={reenterId('create-imageName')} {...register('coordinate.imageName')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-flavor">
                Flavor <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="create-flavor" className="font-mono text-xs" placeholder="e.g. alpine" aria-label="Flavor" {...register('coordinate.flavor')} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Maven / Package distribution coordinates are available only for an explicit external
            component.
          </p>
        </>
      )}
    </div>
  )

  const renderEscrowStep = () => (
    <div className="space-y-6">
      <SectionHeader
        title="Escrow"
        subtitle="Escrow generation for the source archive. The remaining escrow settings are configured later in the editor."
      />
      {escrowFcLoading ? (
        <p className="text-sm text-muted-foreground">Loading escrow generation…</p>
      ) : !showEscrowGeneration ? (
        <StatusBanner variant="info">Escrow generation isn&apos;t configurable here.</StatusBanner>
      ) : (
        <Field label="Generation" htmlFor="create-escrowGeneration" path="escrow.generation">
          <select
            id="create-escrowGeneration"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            disabled={!escrowGenerationEditable}
            {...register('escrowGeneration')}
          >
            <option value="">Select generation</option>
            {escrowGenerations.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <FieldError message={errors.escrowGeneration?.message} />
        </Field>
      )}
    </div>
  )

  const renderReviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title="Review & create" subtitle="Everything below will be created." />
        {/* Reserved view switch: only Summary works today. The As-code (DSL) view
            arrives once CRS exposes a server-side create-preview endpoint. */}
        <div
          role="group"
          aria-label="Review view"
          className="inline-flex shrink-0 rounded-md border border-input p-0.5 text-xs"
        >
          <span className="rounded-[5px] bg-primary px-2.5 py-1 font-medium text-primary-foreground">
            Summary
          </span>
          <span
            className="cursor-not-allowed px-2.5 py-1 text-muted-foreground/70"
            aria-disabled="true"
            aria-label="As code — available once a server-side create-preview renders the DSL"
            title="Available once a server-side create-preview renders the DSL"
          >
            As code
          </span>
        </div>
      </div>
      {serverError && (
        <InlineError message={serverError.message} />
      )}

      <SummaryDiff
        values={values}
        gated={gated}
        vcsApplies={vcsApplies}
        classification={classificationRecap()}
        // Surface the escrow generation exactly when it will actually be sent, so
        // the "everything below will be created" summary matches the payload:
        //  - hidden → never (the builder strips it; the field isn't shown);
        //  - editable → the form value (what the builder overlays);
        //  - clone + readonly → the seeded source value is copied with the rest of
        //    the source escrow aspect, so show it too;
        //  - scratch + non-editable → nothing is sent (no source escrow to copy).
        escrowGeneration={
          !escrowGenerationHidden && (escrowGenerationEditable || isClone) ? values.escrowGeneration : ''
        }
      />

      <fieldset className="space-y-4 rounded-md border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Change metadata</legend>
        <div className="space-y-1.5">
          <Label htmlFor="create-jira-key">
            Jira task key <span className="text-destructive">*</span>
          </Label>
          <Input
            id="create-jira-key"
            placeholder="ABC-123"
            value={jiraTaskKey}
            onChange={(e) => setJiraTaskKey(e.target.value)}
            aria-invalid={!!jiraKeyError}
            aria-describedby={jiraKeyError ? 'create-jira-key-error' : undefined}
          />
          {jiraKeyError && (
            <p id="create-jira-key-error" className="text-xs text-destructive">
              {jiraFormatError ?? jiraKeyError}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-change-comment">Comment (optional)</Label>
          <textarea
            id="create-change-comment"
            placeholder="What changed and why"
            value={changeComment}
            onChange={(e) => setChangeComment(e.target.value)}
            rows={3}
            className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </fieldset>
    </div>
  )

  const stepBody: Record<StepId, () => React.ReactNode> = {
    profile: renderProfileStep,
    general: renderGeneralStep,
    build: renderBuildStep,
    vcs: renderVcsStep,
    jira: renderJiraStep,
    distribution: renderDistributionStep,
    escrow: renderEscrowStep,
    review: renderReviewStep,
  }

  const headerTitle = isClone
    ? `Clone ${source?.name ?? 'component'}`
    : 'Create component'

  // The profile lives outside RHF and drives submitted flags (incl. `solution`,
  // which is not an RHF field), so isDirty alone misses a profile-only change. In
  // clone mode compare against the source-derived profile/explicit; in scratch
  // compare against the pre-selected default — since the profile is never null in
  // scratch, "!== null" would make this always true and fire a spurious
  // unsaved-changes prompt on a pristine wizard.
  const profileTouched = isClone
    ? profile !== (derived?.profile ?? null) || explicitAnswer !== (derived?.explicit ?? false)
    : profile !== DEFAULT_SCRATCH_PROFILE || explicitAnswer !== false

  // Post-create success panel — replaces the wizard body once the component is
  // created. `submitted` is already true, so no unsaved-changes guard is needed.
  if (created) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          <Check className="h-7 w-7" aria-hidden />
        </div>
        <div className="space-y-1">
          <DialogTitle className="text-xl font-semibold">Component created</DialogTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{created.name}</span> was added to the registry.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="outline" onClick={onCreateAnother}>
            <Plus className="h-4 w-4" />
            Create another
          </Button>
          <Button type="button" onClick={() => navigate(`/components/${created.id}`)}>
            Go to component
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col overflow-hidden">
      <UnsavedChangesGuard when={(isDirty || profileTouched) && !submitted} />

      {/* Header bar */}
      <div className="flex items-center gap-3 border-b px-6 py-4 pr-12">
        <DialogTitle className="text-lg font-semibold tracking-tight">{headerTitle}</DialogTitle>
        {isClone && <Badge variant="secondary">Clone</Badge>}
      </div>

      {/* Body row: vertical stepper rail + scrollable content */}
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Wizard steps"
          className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-card p-4"
        >
          {steps.map((step, i) => {
            const active = step === current
            const showInvalid = shownInvalidSteps.has(step)
            const done = !active && visitedSteps.has(step) && !invalidSteps.has(step)
            // `invalid` wins over `active`: the current step can also be invalid
            // once a Create attempt marks every step attempted, and that must stay
            // distinguishable (data-status + destructive styling). aria-current
            // still conveys "active" independently.
            const status = showInvalid ? 'invalid' : active ? 'active' : done ? 'done' : 'todo'
            // Announce the icon-only status to assistive tech (the circle is
            // aria-hidden). `active` is already conveyed by aria-current="step".
            const statusText = showInvalid ? 'has errors' : done ? 'completed' : null
            return (
              <button
                key={step}
                type="button"
                aria-label={STEP_LABELS[step]}
                aria-describedby={statusText ? `step-status-${step}` : undefined}
                data-status={status}
                onClick={() => goToStep(step)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-start gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-muted font-medium' : 'hover:bg-muted',
                  showInvalid && 'text-destructive',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                    showInvalid
                      ? 'border-destructive/50 text-destructive'
                      : active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : done
                          ? 'border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                          : 'border-border text-muted-foreground',
                  )}
                >
                  {showInvalid ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="flex flex-col">
                  <span>{STEP_LABELS[step]}</span>
                  <span className="text-xs font-normal text-muted-foreground">{STEP_SUBTITLES[step]}</span>
                </span>
                {statusText && (
                  <span id={`step-status-${step}`} className="sr-only">
                    {statusText}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            {isClone && source && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">Included:</span> general details, people,
                  labels, docs, security groups, and the base build / escrow / Jira configuration
                  {vcsApplies && ', plus the VCS tag / production branch formats'}.
                </p>
                <p>
                  <span className="font-medium text-foreground">Excluded (re-enter):</span> the Component
                  Key, {vcsApplies && 'VCS Path, '}Jira project key, and distribution coordinate are unique
                  per component — enter new values.
                </p>
              </div>
            )}
            {crossStepInvalid.length > 0 && (
              <StatusBanner variant="warning">
                <div className="font-semibold">Other steps need attention before you can create</div>
                <ul className="mt-1 space-y-0.5">
                  {crossStepInvalid.map((step) => (
                    <li key={step}>
                      <button type="button" className="underline" onClick={() => goToStep(step)}>
                        Go to {STEP_LABELS[step]}
                      </button>
                    </li>
                  ))}
                </ul>
              </StatusBanner>
            )}
            {stepBody[current]()}
          </div>
        </div>
      </div>

      {/* Sticky footer inside the card */}
      <div className="flex items-center justify-between border-t bg-background px-6 py-3">
        <Button type="button" variant="outline" onClick={goBack} disabled={currentIndex === 0}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-sm text-muted-foreground">
          Step {currentIndex + 1} of {steps.length}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/components')}>
            Cancel
          </Button>
          {isLast ? (
            <Button type="submit" disabled={submitDisabled}>
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create component
            </Button>
          ) : (
            <Button type="button" onClick={goNext} disabled={!currentValid}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

// ---- Small presentational helpers -------------------------------------------

// Step-level heading (one per wizard step), above the step's sub-sections —
// mirrors the Profile step's header and the approved mockup's per-step intro.
function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  path,
  required,
  badge,
  children,
}: {
  label: string
  htmlFor?: string
  path?: string
  required?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={htmlFor}>
          {path ? <FieldLabelText path={path} fallback={label} /> : label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        {path && <FieldInfo path={path} label={label} />}
        {badge && <span className="ml-1">{badge}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * Amber "re-enter" pill shown on the unique-per-component fields in clone mode
 * (Component Key, VCS Path, Jira project key, distribution coordinate) so the
 * user sees which values must be new.
 */
function ReenterPill({ id }: { id?: string }) {
  return (
    <span
      id={id}
      className="inline-flex items-center rounded-full border border-amber-400/60 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-300"
    >
      Re-enter
    </span>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}

/** Green-`+` summary of the fields that will be created (brief §5/§7). */
function SummaryDiff({
  values,
  gated,
  vcsApplies,
  classification,
  escrowGeneration,
}: {
  values: CreateFormValues
  gated: boolean
  vcsApplies: boolean
  classification: string
  escrowGeneration: string
}) {
  const groups: { heading: string; rows: [string, string][] }[] = []
  const push = (heading: string, rows: [string, string | undefined][]) => {
    const filled = rows.filter(([, v]) => v && v.trim() !== '') as [string, string][]
    if (filled.length) groups.push({ heading, rows: filled })
  }

  push('General', [
    ['Component Key', values.name],
    ['Display Name', values.displayName],
    ['Component Owner', values.componentOwner],
    ['Release Managers', values.releaseManager.join(', ')],
    ['Security Champions', values.securityChampion.join(', ')],
    ['Copyright', values.copyright],
    ['Classification', classification],
  ])
  const ownershipSummary = values.ownership
    .filter((r) => r.groupId.trim())
    .map((r) => {
      const mode = OWNERSHIP_MODES.find((m) => m.key === r.mode)?.label ?? r.mode
      return `${r.groupId} — ${mode}${r.mode === 'EXPLICIT' ? ` (${r.tokens.join(', ')})` : ''}`
    })
    .join('\n')
  push('Build', [
    ['Build System', values.buildSystem],
    ['Produced Artifacts', ownershipSummary],
  ])
  if (vcsApplies) {
    push('VCS', [
      ['VCS Path', values.vcsUrl],
      ['Production branch', values.vcsBranch],
      ['Tag', values.vcsTag],
    ])
  }
  push('Jira', [
    ['Jira Project Key', values.jiraProjectKey],
    ['Version Prefix', values.versionPrefix],
    ['Full Version Format', values.versionFormat],
    ['Line Version Format', values.lineVersionFormat],
    ['Minor Version Format', values.minorSeparate ? values.minorVersionFormat : values.lineVersionFormat],
    ['Release Version Format', values.releaseVersionFormat],
    ['Build Version Format', values.buildSeparate ? values.buildVersionFormat : values.releaseVersionFormat],
  ])
  const coord = values.coordinate
  const coordSummary =
    coord.type === 'maven'
      ? gated && coord.groupPattern
        ? `${coord.groupPattern}:${coord.artifactPattern}`
        : ''
      : coord.type === 'docker'
        ? coord.imageName
        : gated && coord.packageName
          ? `${coord.packageType} ${coord.packageName}`
          : ''
  push('Distribution', [[coord.type === 'docker' ? 'Docker image' : 'Distribution coordinate', coordSummary]])
  push('Escrow', [['Generation', escrowGeneration]])

  return (
    <div className="rounded-md border">
      <div className="divide-y text-sm">
        {groups.map((g) => (
          <div key={g.heading} className="p-3">
            <div className="mb-2 font-medium text-foreground">{g.heading}</div>
            <div className="space-y-1">
              {g.rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[10rem_1fr] gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="whitespace-pre-wrap font-mono text-xs text-[var(--color-badge-green-fg,#16a34a)]">
                    + {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mirror (derived) version-format field — Minor mirrors Line, Build mirrors Release. */
function CreateMirrorField({
  path,
  fallback,
  pill,
  setLabel,
  placeholder,
  inputId,
  separate,
  leadingValue,
  onSetSeparate,
  onRemoveSeparate,
  inputProps,
}: {
  path: string
  fallback: string
  pill: string
  setLabel: string
  placeholder?: string
  inputId: string
  separate: boolean
  leadingValue: string
  onSetSeparate: () => void
  onRemoveSeparate: () => void
  inputProps: UseFormRegisterReturn
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={separate ? inputId : undefined}>
          <FieldLabelText path={path} fallback={fallback} />
        </Label>
        <FieldInfo path={path} label={fallback} />
        {!separate && (
          <Badge variant="secondary" className="ml-auto font-normal">
            {pill}
          </Badge>
        )}
      </div>
      {!separate ? (
        <>
          <div className="flex h-9 items-center rounded-md border bg-muted px-3">
            <input
              readOnly
              tabIndex={-1}
              aria-label={`${fallback} (mirrored)`}
              value={leadingValue}
              className="w-full bg-transparent font-mono text-xs text-muted-foreground outline-none"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onSetSeparate}>
            {setLabel}
          </Button>
        </>
      ) : (
        <>
          <Input id={inputId} className="font-mono text-xs" placeholder={placeholder} {...inputProps} />
          <Button type="button" variant="outline" size="sm" onClick={onRemoveSeparate}>
            Remove separate format
          </Button>
        </>
      )}
    </div>
  )
}
