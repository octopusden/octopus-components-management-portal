import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { PeopleInput } from './ui/PeopleInput'
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
import { ApiError } from '../lib/api'
import { parseServerFieldErrors } from '../lib/serverErrors'
import { lookupEmployee } from '../hooks/useEmployees'

// R1 (aggregator/parentComponent decouple): a component's `group` is migration-owned
// aggregator membership (a DSL `components { }` owner + its sub-components) and is NOT
// assignable via the API — the server accepts-and-ignores any `group` sent on create,
// and an API-created component is standalone (null group). So the Create dialog no
// longer collects, validates (supported-group prefixes), auto-suggests, or sends a
// Group ID. Build system stays the only hard requirement.
const createSchema = z.object({
  name: z
    .string()
    .min(1, 'Component Key is required')
    .regex(/^[a-zA-Z0-9_\-./]+$/, 'Component Key can only contain letters, digits, _, -, ., /'),
  displayName: z.string().optional(),
  buildSystem: z.string().min(1, 'Build System is required'),
  componentOwner: z.string().trim().min(1, 'Component Owner is required'),
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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      displayName: '',
      buildSystem: '',
      componentOwner: '',
      distributionExplicit: false,
      distributionExternal: true,
    },
  })

  const buildSystemValue = watch('buildSystem')
  const componentOwnerValue = watch('componentOwner')

  function handleOpenChange(open: boolean) {
    if (!open) {
      reset()
    }
    onOpenChange(open)
  }

  const submitDisabled = isSubmitting || createMutation.isPending

  async function onSubmit(values: CreateFormValues) {
    try {
      const component = await createMutation.mutateAsync({
        name: values.name,
        displayName: values.displayName || undefined,
        componentOwner: values.componentOwner,
        // No `group`: it is migration-owned and ignored by the API on create.
        baseConfiguration: { build: { buildSystem: values.buildSystem } },
        // CRS PR #301: System is scalar `string | null`. The Create dialog
        // doesn't expose the field yet (deferred per the original
        // ui-swift-sloth plan); send `null` so the component starts without
        // a system and the editor can set it later.
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
      if (err instanceof ApiError && err.status === 400) {
        const componentOwnerError = parseServerFieldErrors(err.rawBody).get('componentOwner')
        if (componentOwnerError) {
          setError('componentOwner', { type: 'server', message: componentOwnerError })
          return
        }
      }
      toast({
        title: 'Failed to create component',
        description: message,
        variant: 'destructive',
      })
    }
  }

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
            <Label htmlFor="create-componentOwner">
              Component Owner <span className="text-destructive">*</span>
            </Label>
            <PeopleInput
              id="create-componentOwner"
              value={componentOwnerValue}
              onChange={(value) =>
                setValue('componentOwner', value, { shouldValidate: true, shouldDirty: true })
              }
              placeholder="owner@example.com"
              lookupFn={lookupEmployee}
            />
            {errors.componentOwner && (
              <p className="text-xs text-destructive">{errors.componentOwner.message}</p>
            )}
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
