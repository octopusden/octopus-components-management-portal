import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Copy } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { PeopleInput } from './ui/PeopleInput'
import { PeopleListInput } from './ui/PeopleListInput'
import { InlineError } from './ui/inline-error'
import { SkeletonBlock } from './ui/skeleton-block'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './ui/dialog'
import { useFieldOptions } from '../hooks/useFieldOptions'
import { useFieldConfig } from '../hooks/useAdminConfig'
import { visibilityFor } from '../hooks/useFieldConfig'
import { useComponent, useCreateComponent } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { ApiError } from '../lib/api'
import { parseServerFieldErrors } from '../lib/serverErrors'
import { lookupEmployee, useEmployeeStatuses } from '../hooks/useEmployees'
import { selectBaseRow } from '../lib/api/baseRow'
import { buildCreateRequest, type CreateFormValues } from '../lib/component/buildCreateRequest'
import type { ComponentDetail } from '../lib/types'

const NAME_REGEX = /^[a-zA-Z0-9_\-./]+$/

// A single Zod object; the explicit+external block is enforced via superRefine
// (no discriminated union — the discriminant is a pair of booleans and only
// one combination gates extra fields). Copyright is intentionally NOT validated
// here: CRS only requires it when a copyright catalog is configured server-side,
// which the Portal can't detect — a server 400 is mapped inline instead, so we
// don't block valid creates in catalog-less environments.
// Schema is built per-render from field-config visibility: a field hidden/
// readonly in field-config is removed from the create form, so its
// requirement (e.g. RM/SC for explicit+external) must not fire. `editable`
// returns true when `component.<field>` is editable.
function makeCreateSchema(editable: (field: string) => boolean) {
  return z
  .object({
    name: z
      .string()
      .min(1, 'Component Key is required')
      .regex(NAME_REGEX, 'Component Key can only contain letters, digits, _, -, ., /'),
    // displayName is nullable server-side and required ONLY for explicit+external components
    // (mirrors EscrowConfigValidator). The EE-gated requirement is enforced in superRefine
    // below; otherwise it is optional (a blank value is stored as null, NOT the component key).
    displayName: z.string(),
    buildSystem: z.string().min(1, 'Build System is required'),
    componentOwner: z.string().trim().min(1, 'Component Owner is required'),
    distributionExplicit: z.boolean(),
    distributionExternal: z.boolean(),
    releaseManager: z.array(z.string()),
    securityChampion: z.array(z.string()),
    copyright: z.string(),
    jiraProjectKey: z.string(),
    versionPrefix: z.string(),
    coordinate: z.object({
      type: z.enum(['maven', 'docker', 'package']),
      groupPattern: z.string(),
      artifactPattern: z.string(),
      imageName: z.string(),
      packageType: z.enum(['DEB', 'RPM']),
      packageName: z.string(),
    }),
  })
  .superRefine((v, ctx) => {
    if (!(v.distributionExplicit && v.distributionExternal)) return
    if (editable('displayName') && !v.displayName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['displayName'],
        message: 'Display Name is required for an explicit + external component',
      })
    }
    if (editable('releaseManager') && v.releaseManager.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['releaseManager'],
        message: 'At least one Release Manager is required for an explicit + external component',
      })
    }
    if (editable('securityChampion') && v.securityChampion.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['securityChampion'],
        message: 'At least one Security Champion is required for an explicit + external component',
      })
    }
    const c = v.coordinate
    const missing = (field: string, msg: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['coordinate', field], message: msg })
    if (c.type === 'maven') {
      if (!c.groupPattern.trim()) missing('groupPattern', 'Group ID is required')
      if (!c.artifactPattern.trim()) missing('artifactPattern', 'Artifact ID is required')
    } else if (c.type === 'docker') {
      if (!c.imageName.trim()) missing('imageName', 'Image name is required')
    } else {
      if (!c.packageName.trim()) missing('packageName', 'Package name is required')
    }
  })
}

const EMPTY_COORDINATE: CreateFormValues['coordinate'] = {
  type: 'maven',
  groupPattern: '',
  artifactPattern: '',
  imageName: '',
  packageType: 'DEB',
  packageName: '',
}

const SCRATCH_DEFAULTS: CreateFormValues = {
  name: '',
  displayName: '',
  buildSystem: '',
  componentOwner: '',
  distributionExplicit: false,
  distributionExternal: true,
  releaseManager: [],
  securityChampion: [],
  copyright: '',
  jiraProjectKey: '',
  versionPrefix: '',
  coordinate: EMPTY_COORDINATE,
}

// Initial form values, computed synchronously from the source (copy mode) or
// the scratch defaults. Component Key + coordinate are never seeded (unique per
// component). Building defaultValues at mount — rather than syncing async via
// reset/`values` after the source arrives — keeps the buildSystem EnumSelect in
// step with the form from its first render and sidesteps a browser-only race
// where a post-load reset left the field empty.
function initialValues(source: ComponentDetail | null): CreateFormValues {
  if (!source) return SCRATCH_DEFAULTS
  return {
    ...SCRATCH_DEFAULTS,
    // displayName is NOT prefilled from the source: it is unique, so copying it would always
    // collide. The user supplies a fresh one (or, when the field is hidden, CRS defaults to key).
    buildSystem: selectBaseRow(source)?.build?.buildSystem ?? '',
    componentOwner: source.componentOwner ?? '',
    distributionExplicit: source.distributionExplicit ?? false,
    distributionExternal: source.distributionExternal ?? false,
    releaseManager: [...(source.releaseManager ?? [])],
    securityChampion: [...(source.securityChampion ?? [])],
    copyright: source.copyright ?? '',
    // jiraProjectKey is unique per component → never copied (left blank). versionPrefix is a
    // reusable format, so it IS prefilled from the source's BASE jira config.
    versionPrefix: selectBaseRow(source)?.jira?.versionPrefix ?? '',
  }
}

interface CreateComponentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * When set, the dialog runs in "Create Similar" mode: it fetches the source
   * component and pre-fills the form from it (the new component is NOT an exact
   * copy — unique fields and overrides are excluded; see buildCreateRequest).
   * Absent → create-from-scratch.
   */
  sourceId?: string
}

export function CreateComponentDialog({ open, onOpenChange, sourceId }: CreateComponentDialogProps) {
  const isCopy = !!sourceId
  // Copy mode owns the source fetch (the list entry point only has a summary).
  // useComponent('') is disabled, so scratch mode and the closed dialog issue
  // no request.
  const { data: source, error } = useComponent(open && sourceId ? sourceId : '')
  const ready = !isCopy || (!!source && !error)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCopy ? 'Create Similar Component' : 'Create Component'}</DialogTitle>
          <DialogDescription>
            {isCopy ? (
              <>
                Create a new component pre-filled from{' '}
                {source ? <span className="font-medium">{source.name}</span> : 'the selected component'}.
              </>
            ) : (
              <>
                Add a new component to the registry. Renaming the component key later requires the
                Rename Components permission.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isCopy && error ? (
          <>
            <InlineError
              message={
                <>Failed to load the source component: {error instanceof Error ? error.message : String(error)}</>
              }
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="button" disabled>
                <Copy className="h-4 w-4" />
                Create
              </Button>
            </DialogFooter>
          </>
        ) : !ready ? (
          // Copy mode, source still loading: skeleton + disabled Create so the
          // form mounts only once its initial values are known.
          <div className="space-y-4">
            <SkeletonBlock className="h-9 w-full" />
            <SkeletonBlock className="h-9 w-full" />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="button" disabled>
                <Copy className="h-4 w-4" />
                Create
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Mount the form once values are known. Keyed by source id (or
          // 'scratch') so switching the copy source remounts with fresh
          // defaults; a same-id background refetch does NOT remount, so it
          // never clobbers fields the user already edited.
          <CreateComponentForm
            key={source?.id ?? 'scratch'}
            source={source ?? null}
            isCopy={isCopy}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface CreateComponentFormProps {
  source: ComponentDetail | null
  isCopy: boolean
  onClose: () => void
}

function CreateComponentForm({ source, isCopy, onClose }: CreateComponentFormProps) {
  const navigate = useNavigate()
  const createMutation = useCreateComponent()
  const { toast } = useToast()

  // Field-config visibility (code-as-config): a field that is hidden/readonly is
  // removed from the create form and never sent. One read drives both the schema
  // and the conditional renders below (generic — no per-field special-casing).
  const { data: fieldConfigData } = useFieldConfig()
  const editable = useCallback(
    (field: string) => visibilityFor(fieldConfigData, `component.${field}`) === 'editable',
    [fieldConfigData],
  )
  const schema = useMemo(() => makeCreateSchema(editable), [editable])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues(source),
  })

  const { options: buildSystems } = useFieldOptions('buildSystem')
  const componentOwnerValue = watch('componentOwner')
  const explicit = watch('distributionExplicit')
  const external = watch('distributionExternal')
  const gated = explicit && external
  const releaseManager = watch('releaseManager')
  const securityChampion = watch('securityChampion')
  const coordinateType = watch('coordinate.type')
  const nameValue = watch('name')

  // versionPrefix derived-default: in scratch mode mirror the component key until the user
  // edits the field. Copy mode prefills from the source (initialValues), so skip mirroring there.
  const [versionPrefixEdited, setVersionPrefixEdited] = useState(false)
  useEffect(() => {
    if (isCopy || versionPrefixEdited) return
    setValue('versionPrefix', nameValue, { shouldValidate: false })
  }, [nameValue, isCopy, versionPrefixEdited, setValue])

  const { data: employeeStatuses } = useEmployeeStatuses([...releaseManager, ...securityChampion])

  function selectCoordinateType(type: CreateFormValues['coordinate']['type']) {
    // Reset sibling fields so a stale value from another type never leaks into
    // the submitted payload.
    setValue('coordinate', { ...EMPTY_COORDINATE, type }, { shouldValidate: false })
    clearErrors('coordinate')
  }

  // Hold Create while the typed owner's async directory validation is in
  // flight: the value only commits to the form after the lookup resolves, so
  // a fast submit would read componentOwner='' and block on a misleading
  // "required" error.
  const [ownerValidating, setOwnerValidating] = useState(false)

  const submitDisabled = isSubmitting || createMutation.isPending || ownerValidating

  async function onSubmit(values: CreateFormValues) {
    try {
      const component = await createMutation.mutateAsync(buildCreateRequest(values, source ?? undefined, editable))
      toast({ title: 'Component created', description: `"${component.name}" was created.` })
      onClose()
      navigate(`/components/${component.id}`)
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err)
      if (err instanceof ApiError && err.status === 409) {
        message = 'A component with this name already exists.'
      }
      if (err instanceof ApiError && err.status === 400) {
        const fieldErrors = parseServerFieldErrors(err.rawBody)
        // Route recognized field errors inline; if anything was routed to a
        // VISIBLE field, skip the toast. componentOwner is always shown; RM /
        // SC / copyright / coordinate live in the explicit+external block, so
        // only route them inline when that block is rendered — otherwise the
        // message would land on a hidden field and silently vanish, so we let
        // it fall through to the toast instead.
        let routed = false
        // A duplicate component key comes back keyed `name`; a duplicate (non-null) display
        // name comes back keyed `displayName` — route both onto the inputs the user controls.
        if (fieldErrors.get('name')) {
          setError('name', { type: 'server', message: fieldErrors.get('name')! })
          routed = true
        }
        if (editable('displayName') && fieldErrors.get('displayName')) {
          setError('displayName', { type: 'server', message: fieldErrors.get('displayName')! })
          routed = true
        }
        if (fieldErrors.get('componentOwner')) {
          setError('componentOwner', { type: 'server', message: fieldErrors.get('componentOwner')! })
          routed = true
        }
        if (gated) {
          for (const field of ['copyright', 'releaseManager', 'securityChampion'] as const) {
            const msg = fieldErrors.get(field)
            if (msg) {
              setError(field, { type: 'server', message: msg })
              routed = true
            }
          }
          const distributionMsg = fieldErrors.get('distribution')
          if (distributionMsg) {
            setError('coordinate', { type: 'server', message: distributionMsg })
            routed = true
          }
        }
        if (routed) return
      }
      toast({ title: 'Failed to create component', description: message, variant: 'destructive' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="create-name">
          Component Key <span className="text-destructive">*</span>
        </Label>
        <Input id="create-name" placeholder="my-component" autoFocus {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {editable('displayName') && (
        <div className="space-y-1.5">
          <Label htmlFor="create-displayName">
            Display Name{explicit && external && <span className="text-destructive"> *</span>}
          </Label>
          <Input id="create-displayName" placeholder="My Component" {...register('displayName')} />
          {errors.displayName && (
            <p className="text-xs text-destructive">{errors.displayName.message}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="create-buildSystem">
          Build System <span className="text-destructive">*</span>
        </Label>
        {/* Native <select> registered directly with RHF. A register'd form
            element reflects the form's defaultValue reliably (same as the
            displayName input) — unlike the Radix EnumSelect, whose async
            option load raced the programmatic prefill in the browser and left
            the value empty. The native dropdown also closes cleanly, so it
            never leaves an overlay intercepting later clicks. */}
        <select
          id="create-buildSystem"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          aria-required
          aria-invalid={Boolean(errors.buildSystem)}
          aria-describedby={errors.buildSystem ? 'create-buildSystem-error' : undefined}
          {...register('buildSystem')}
        >
          <option value="">Select build system</option>
          {buildSystems.map((bs) => (
            <option key={bs} value={bs}>
              {bs}
            </option>
          ))}
        </select>
        {errors.buildSystem && (
          <p id="create-buildSystem-error" className="text-xs text-destructive">
            {errors.buildSystem.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="create-componentOwner">
          Component Owner <span className="text-destructive">*</span>
        </Label>
        <PeopleInput
          id="create-componentOwner"
          value={componentOwnerValue}
          onChange={(value) =>
            setValue('componentOwner', value, { shouldValidate: true, shouldDirty: true })
          }
          placeholder="AD userkey"
          lookupFn={lookupEmployee}
          onValidatingChange={setOwnerValidating}
        />
        {errors.componentOwner && (
          <p className="text-xs text-destructive">{errors.componentOwner.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="create-jiraProjectKey">Jira Project Key</Label>
          <Input id="create-jiraProjectKey" placeholder="JIRA project key" {...register('jiraProjectKey')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="create-versionPrefix">Version Prefix</Label>
          <Input
            id="create-versionPrefix"
            placeholder="e.g. the component key"
            {...register('versionPrefix', { onChange: () => setVersionPrefixEdited(true) })}
          />
        </div>
      </div>

      {editable('distributionExplicit') && (
        <div className="flex items-center gap-2">
          <input
            id="create-distributionExplicit"
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            {...register('distributionExplicit')}
          />
          <Label htmlFor="create-distributionExplicit">Explicit</Label>
        </div>
      )}

      {editable('distributionExternal') && (
        <div className="flex items-center gap-2">
          <input
            id="create-distributionExternal"
            type="checkbox"
            className="h-4 w-4 rounded border-input accent-primary"
            {...register('distributionExternal')}
          />
          <Label htmlFor="create-distributionExternal">External</Label>
        </div>
      )}

      {/* Required-for-explicit+external block. CRS rejects an explicit+
          external component without release managers, security champions,
          and at least one distribution coordinate; surface those fields
          here so the create doesn't bounce on a server 400. */}
      {gated && (
        <fieldset className="space-y-4 rounded-md border border-border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Required for explicit + external
          </legend>

          {editable('releaseManager') && (
            <div className="space-y-1.5">
              <Label htmlFor="create-releaseManager">
                Release Managers <span className="text-destructive">*</span>
              </Label>
              <PeopleListInput
                value={releaseManager}
                onChange={(val) =>
                  setValue('releaseManager', val, { shouldValidate: true, shouldDirty: true })
                }
                lookupFn={lookupEmployee}
                statuses={employeeStatuses}
              />
              {errors.releaseManager && (
                <p className="text-xs text-destructive">{errors.releaseManager.message}</p>
              )}
            </div>
          )}

          {editable('securityChampion') && (
            <div className="space-y-1.5">
              <Label htmlFor="create-securityChampion">
                Security Champions <span className="text-destructive">*</span>
              </Label>
              <PeopleListInput
                value={securityChampion}
                onChange={(val) =>
                  setValue('securityChampion', val, { shouldValidate: true, shouldDirty: true })
                }
                lookupFn={lookupEmployee}
                statuses={employeeStatuses}
              />
              {errors.securityChampion && (
                <p className="text-xs text-destructive">{errors.securityChampion.message}</p>
              )}
            </div>
          )}

          {editable('copyright') && (
            <div className="space-y-1.5">
              <Label htmlFor="create-copyright">Copyright</Label>
              <Input id="create-copyright" placeholder="(c) 2026 Acme Inc." {...register('copyright')} />
              <p className="text-xs text-muted-foreground">Required if a copyright catalog is configured.</p>
              {errors.copyright && (
                <p className="text-xs text-destructive">{errors.copyright.message}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="create-coordinate-type">
              Distribution coordinate <span className="text-destructive">*</span>
            </Label>
            <select
              id="create-coordinate-type"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={coordinateType}
              onChange={(e) =>
                selectCoordinateType(e.target.value as CreateFormValues['coordinate']['type'])
              }
            >
              <option value="maven">Maven GAV</option>
              <option value="docker">Docker image</option>
              <option value="package">Package</option>
            </select>

            {coordinateType === 'maven' && (
              <div className="flex gap-2">
                <Input placeholder="groupId" aria-label="Group ID" {...register('coordinate.groupPattern')} />
                <Input placeholder="artifactId" aria-label="Artifact ID" {...register('coordinate.artifactPattern')} />
              </div>
            )}
            {coordinateType === 'docker' && (
              <Input placeholder="image name" aria-label="Image name" {...register('coordinate.imageName')} />
            )}
            {coordinateType === 'package' && (
              <div className="flex gap-2">
                <Controller
                  control={control}
                  name="coordinate.packageType"
                  render={({ field }) => (
                    <select
                      aria-label="Package type"
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={field.value}
                      onChange={field.onChange}
                    >
                      <option value="DEB">DEB</option>
                      <option value="RPM">RPM</option>
                    </select>
                  )}
                />
                <Input placeholder="package name" aria-label="Package name" {...register('coordinate.packageName')} />
              </div>
            )}
            {errors.coordinate && (
              <p className="text-xs text-destructive">
                {/* RHF nests field-level messages; surface whichever fired. */}
                {errors.coordinate.message ??
                  errors.coordinate.groupPattern?.message ??
                  errors.coordinate.artifactPattern?.message ??
                  errors.coordinate.imageName?.message ??
                  errors.coordinate.packageName?.message}
              </p>
            )}
          </div>
        </fieldset>
      )}

      {isCopy && (
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">Included:</span> general details, people,
            labels, docs, security groups, and the base build / escrow / Jira configuration.
          </p>
          <p>
            <span className="font-medium text-foreground">Excluded:</span> VCS entries, other
            artifacts, TeamCity projects, configuration overrides, and the Jira project key — set
            these on the new component afterwards.
          </p>
        </div>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={submitDisabled}>
          {isCopy ? <Copy className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          Create
        </Button>
      </DialogFooter>
    </form>
  )
}

export function CreateComponentButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New Component
      </Button>
      <CreateComponentDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
