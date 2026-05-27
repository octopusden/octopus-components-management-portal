import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './ui/dialog'
import { EnumSelect } from './ui/EnumSelect'
import { useCreateComponent } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { useFieldConfigEntry } from '../hooks/useFieldConfig'
import { useSupportedGroups } from '../hooks/useSupportedGroups'
import { ApiError } from '../lib/api'
import { suggestGroupId } from '../lib/groupId'

// Maven groupId charset — exactly what `suggestGroupId` emits. PR #44 review
// (Copilot): tightened from `[a-zA-Z0-9._-]+` to `[a-z0-9.]+` so the
// validation regex matches the helper's output and rejects shapes the helper
// would have collapsed (uppercase / `_` / `-`). Users who type a value with
// rejected characters get a deterministic error instead of submitting a
// groupId that doesn't round-trip through suggestGroupId.
const GROUP_ID_PATTERN = /^[a-z0-9.]+$/

const createSchema = z.object({
  name: z
    .string()
    .min(1, 'Component Key is required')
    .regex(/^[a-zA-Z0-9_\-./]+$/, 'Component Key can only contain letters, digits, _, -, ., /'),
  displayName: z.string().optional(),
  groupId: z
    .string()
    .min(1, 'Group ID is required')
    .regex(GROUP_ID_PATTERN, 'Group ID can only contain lowercase letters, digits, and dots'),
  buildSystem: z.string().min(1, 'Build System is required'),
  componentOwner: z.string().optional(),
  distributionExplicit: z.boolean(),
  distributionExternal: z.boolean(),
})

type CreateFormValues = z.infer<typeof createSchema>

interface CreateComponentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateComponentDialog({ open, onOpenChange }: CreateComponentDialogProps) {
  const navigate = useNavigate()
  const createMutation = useCreateComponent()
  const { toast } = useToast()

  // Field-config defaultValue is the source of the parent prefix used for
  // groupId auto-suggest. Locked + required server-side, so we treat
  // missing defaultValue as "no suggestion" (admin hasn't configured).
  const {
    entry: groupIdConfig,
    isLoading: groupIdConfigLoading,
    isError: groupIdConfigError,
  } = useFieldConfigEntry('component.groupId')
  // PR #44 review (Sonnet): lowercase the admin-configured parent before
  // baking it into the auto-suggested groupId. The Zod regex (line 30)
  // enforces lowercase-only output of `suggestGroupId`; if an admin
  // configured `component.groupId.defaultValue` as e.g. `Org.Example`,
  // the un-lowercased suggestion would auto-fill a value that fails the
  // form-level regex, blocking submit on a value the user never typed.
  // The supported-prefix check is already case-insensitive, so dropping
  // case here only affects the visible suggestion, not the prefix match.
  const parentGroup = (groupIdConfig.defaultValue ?? '').toLowerCase()

  // Allowed groupId prefixes — loud error policy: do NOT swallow failures.
  // While `isLoading` or `isError`, we keep Submit disabled and surface a
  // visible reason; validating against an empty allowed list would silently
  // reject every valid groupId.
  const supportedGroups = useSupportedGroups()
  const supportedGroupsList = supportedGroups.data ?? []

  // Tracks whether the user has manually edited the groupId field. Once
  // flipped to `true`, name watcher stops overwriting groupId. The blur
  // handler with empty value resets it to `false` so renaming the component
  // starts re-suggesting again.
  const userEditedGroupId = useRef(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      displayName: '',
      groupId: '',
      buildSystem: '',
      componentOwner: '',
      distributionExplicit: false,
      distributionExternal: true,
    },
  })

  const name = watch('name')
  const groupIdValue = watch('groupId')
  const buildSystemValue = watch('buildSystem')

  // Auto-suggest groupId from the component key while:
  //   - the user hasn't manually edited the groupId,
  //   - field-config has resolved (not loading / errored) — that's where
  //     the parent prefix lives,
  //   - the configured parent prefix is non-empty.
  // Note we deliberately do NOT gate on supportedGroups loading state — the
  // suggested value is independent of the allowed-prefix list (validation
  // runs separately and Submit is gated on both). Filling the field while
  // the prefix list is still in flight is harmless.
  // `suggestGroupId('', parent)` returns `parent` itself; we suppress that
  // to keep the field empty until the user actually starts typing a name.
  const canAutoSuggest =
    !groupIdConfigLoading && !groupIdConfigError && parentGroup.trim().length > 0
  useEffect(() => {
    if (!canAutoSuggest) return
    if (userEditedGroupId.current) return
    if (!name) {
      // User hasn't typed a name yet — don't pre-fill with the bare parent.
      if (groupIdValue !== '') setValue('groupId', '', { shouldValidate: false })
      return
    }
    const suggested = suggestGroupId(name, parentGroup)
    if (suggested !== groupIdValue) {
      setValue('groupId', suggested, { shouldValidate: false })
    }
  }, [name, canAutoSuggest, parentGroup, groupIdValue, setValue])

  function handleOpenChange(open: boolean) {
    if (!open) {
      reset()
      userEditedGroupId.current = false
    }
    onOpenChange(open)
  }

  // Prefix validation: lowercased both sides, `.` boundary so
  // `com.exampleextra.foo` does NOT pass when only `com.example` is allowed.
  function isGroupIdAllowed(value: string): boolean {
    if (supportedGroupsList.length === 0) return true // no list → don't reject here; Submit is gated elsewhere
    const v = value.toLowerCase()
    return supportedGroupsList.some((p) => {
      const lp = p.toLowerCase()
      return v === lp || v.startsWith(lp + '.')
    })
  }

  const groupIdPrefixError =
    groupIdValue && supportedGroupsList.length > 0 && !isGroupIdAllowed(groupIdValue)
      ? `Group ID must start with one of: ${supportedGroupsList.join(', ')}`
      : null

  // Combined gating reasons — surfaced under the Submit button so the user
  // sees WHY the form is locked instead of guessing.
  const submitDisabledReason = (() => {
    if (groupIdConfigLoading) return 'Loading default group configuration…'
    if (groupIdConfigError) return 'Failed to load default group configuration.'
    if (supportedGroups.isLoading) return 'Loading allowed groups…'
    if (supportedGroups.isError) return 'Failed to load allowed groups. Reload the page and try again.'
    return null
  })()

  const submitDisabled =
    isSubmitting ||
    createMutation.isPending ||
    submitDisabledReason !== null ||
    // Disabled-mirror for the prefix gate so the button reflects the same
    // truth as the `onSubmit` early-return — otherwise a user clicks a
    // visually-enabled button and nothing happens, which reads as a bug.
    groupIdPrefixError !== null

  async function onSubmit(values: CreateFormValues) {
    // Belt-and-braces — should never trigger because Submit is disabled
    // while the supported-groups list is unavailable, but guards against a
    // race where the user mashes Enter mid-load.
    if (submitDisabledReason !== null) return
    if (!isGroupIdAllowed(values.groupId)) {
      // Mirror the inline error path; don't fall through to a network call
      // that would 400 server-side.
      return
    }

    try {
      const component = await createMutation.mutateAsync({
        name: values.name,
        displayName: values.displayName || undefined,
        componentOwner: values.componentOwner || undefined,
        group: { groupKey: values.groupId, isFake: false },
        baseConfiguration: { build: { buildSystem: values.buildSystem } },
        // CRS PR #301: System is scalar `string | null`. The Create
        // dialog doesn't expose the field yet (deferred per the original
        // ui-swift-sloth plan); send `null` so the component starts
        // without a system and the editor can set it later.
        system: null,
        labels: [],
        docs: [],
        artifactIds: [],
        securityGroups: [],
        teamcityProjects: [],
        archived: false,
        distributionExplicit: values.distributionExplicit,
        distributionExternal: values.distributionExternal,
      })
      toast({ title: 'Component created', description: `"${component.name}" was created.` })
      handleOpenChange(false)
      navigate(`/components/${component.id}`)
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err)
      if (err instanceof ApiError && err.status === 409) {
        message = 'A component with this name already exists.'
      }
      toast({
        title: 'Failed to create component',
        description: message,
        variant: 'destructive',
      })
    }
  }

  // RHF `register('groupId')` — we wrap onChange/onBlur so the manual-edit
  // ref and the empty-blur reset behave correctly without losing RHF's
  // change tracking.
  const groupIdReg = register('groupId')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Component</DialogTitle>
          <DialogDescription>
            Add a new component to the registry. Renaming the component key
            later requires the Rename Components permission.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-name">
              Component Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="create-name"
              placeholder="my-component"
              autoFocus
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-displayName">Display Name</Label>
            <Input
              id="create-displayName"
              placeholder="My Component"
              {...register('displayName')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-groupId">
              Group ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="create-groupId"
              placeholder="com.example.my.component"
              aria-required
              aria-invalid={Boolean(errors.groupId || groupIdPrefixError)}
              aria-describedby={
                errors.groupId
                  ? 'create-groupId-error'
                  : groupIdPrefixError
                    ? 'create-groupId-prefix-error'
                    : undefined
              }
              {...groupIdReg}
              onChange={(e) => {
                userEditedGroupId.current = true
                groupIdReg.onChange(e)
              }}
              onBlur={(e) => {
                // Empty value on blur → resume auto-suggesting on the next
                // name edit. Matches the plan's "renaming the component
                // starts re-suggesting" rule.
                if (e.target.value.trim() === '') {
                  userEditedGroupId.current = false
                }
                groupIdReg.onBlur(e)
              }}
            />
            {errors.groupId && (
              <p id="create-groupId-error" className="text-xs text-destructive">
                {errors.groupId.message}
              </p>
            )}
            {!errors.groupId && groupIdPrefixError && (
              <p id="create-groupId-prefix-error" className="text-xs text-destructive">
                {groupIdPrefixError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-buildSystem">
              Build System <span className="text-destructive">*</span>
            </Label>
            <EnumSelect
              fieldPath="buildSystem"
              value={buildSystemValue}
              onValueChange={(v) =>
                setValue('buildSystem', v, { shouldValidate: true, shouldDirty: true })
              }
              placeholder="Select build system"
              id="create-buildSystem"
              aria-required
              aria-invalid={Boolean(errors.buildSystem)}
              aria-describedby={errors.buildSystem ? 'create-buildSystem-error' : undefined}
            />
            {errors.buildSystem && (
              <p id="create-buildSystem-error" className="text-xs text-destructive">
                {errors.buildSystem.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-componentOwner">Component Owner</Label>
            <Input
              id="create-componentOwner"
              placeholder="owner@example.com"
              {...register('componentOwner')}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="create-distributionExplicit"
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              {...register('distributionExplicit')}
            />
            <Label htmlFor="create-distributionExplicit">Explicit</Label>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="create-distributionExternal"
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              {...register('distributionExternal')}
            />
            <Label htmlFor="create-distributionExternal">External</Label>
          </div>

          {submitDisabledReason && (
            // `alert` for errors (assertive — screen readers announce
            // immediately), `status` for the pending-fetch hints.
            <p
              className={
                submitDisabledReason.startsWith('Failed')
                  ? 'text-xs text-destructive'
                  : 'text-xs text-muted-foreground'
              }
              role={submitDisabledReason.startsWith('Failed') ? 'alert' : 'status'}
            >
              {submitDisabledReason}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={submitDisabled}>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
