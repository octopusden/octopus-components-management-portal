import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Copy } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { InlineError } from './ui/inline-error'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './ui/dialog'
import { useComponent, useCreateComponent } from '../hooks/useComponent'
import { useToast } from '../hooks/use-toast'
import { ApiError } from '../lib/api'
import { buildCopyRequest } from '../lib/component/buildCopyRequest'

// Mini-dialog for "create as a copy of an existing component": new Component
// Key (required, same regex as the create dialog) + Display Name (prefilled
// from the source, editable). Everything else is copied by buildCopyRequest —
// see that module for the exact copied/excluded field semantics.
const copySchema = z.object({
  name: z
    .string()
    .min(1, 'Component Key is required')
    .regex(/^[a-zA-Z0-9_\-./]+$/, 'Component Key can only contain letters, digits, _, -, ., /'),
  displayName: z.string().optional(),
})

type CopyFormValues = z.infer<typeof copySchema>

interface CopyComponentDialogProps {
  /** Id of the component to copy from. The dialog fetches the full detail itself. */
  sourceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CopyComponentDialog({ sourceId, open, onOpenChange }: CopyComponentDialogProps) {
  const navigate = useNavigate()
  const createMutation = useCreateComponent()
  const { toast } = useToast()

  // The list entry point only has a ComponentSummary, so the dialog owns the
  // full-detail fetch. `useComponent('')` is disabled (enabled: !!id), so the
  // query only runs while the dialog is open; on the detail page the result
  // is already cached under ['component', id].
  const { data: source, isLoading, error } = useComponent(open ? sourceId : '')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CopyFormValues>({
    resolver: zodResolver(copySchema),
    defaultValues: { name: '', displayName: '' },
  })

  // Prefill Display Name once the source detail arrives. Component Key stays
  // empty — it must be a new unique value.
  useEffect(() => {
    if (source) reset({ name: '', displayName: source.displayName ?? '' })
  }, [source, reset])

  function handleOpenChange(open: boolean) {
    if (!open) {
      reset()
    }
    onOpenChange(open)
  }

  const submitDisabled = isSubmitting || createMutation.isPending || isLoading || !!error

  async function onSubmit(values: CopyFormValues) {
    if (!source) return
    try {
      const component = await createMutation.mutateAsync(
        buildCopyRequest(source, {
          name: values.name,
          displayName: values.displayName || undefined,
        }),
      )
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Component</DialogTitle>
          <DialogDescription>
            Create a new component pre-filled from{' '}
            {source ? <span className="font-medium">{source.name}</span> : 'the selected component'}.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <InlineError
            message={
              <>Failed to load the source component: {error instanceof Error ? error.message : String(error)}</>
            }
          />
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="copy-name">
              Component Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="copy-name"
              placeholder="my-component"
              autoFocus
              disabled={isLoading || !!error}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="copy-displayName">Display Name</Label>
            <Input
              id="copy-displayName"
              placeholder="My Component"
              disabled={isLoading || !!error}
              {...register('displayName')}
            />
          </div>

          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground">Copied:</span> general details, people,
              labels, docs, security groups, and the base build / escrow / Jira configuration.
            </p>
            <p>
              <span className="font-medium text-foreground">Not copied:</span> VCS entries,
              artifacts (Maven, Docker, files, packages), TeamCity projects, configuration
              overrides, and the Jira project key — set these on the new component afterwards.
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={submitDisabled}>
              <Copy className="h-4 w-4" />
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
