import { useRef, useState, type ClipboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, Loader2, ImagePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { InlineError } from '../ui/inline-error'
import { useToast } from '@/hooks/use-toast'
import { usePortalInfo } from '@/hooks/useInfo'
import { useSubmitFeedback } from '@/hooks/useFeedback'
import { ApiError } from '@/lib/api'
import { useUiOverlay } from '@/lib/uiOverlayStore'
import {
  MAX_ATTACHMENTS,
  isAcceptedImage,
  readFileAsAttachment,
  toPayload,
  type PendingAttachment,
} from '@/lib/feedbackAttachments'
import type { FeedbackType } from '@/lib/types'

const schema = z.object({
  type: z.enum(['BUG', 'IDEA', 'QUESTION']),
  title: z.string().max(200, 'Keep the title under 200 characters').optional(),
  message: z.string().trim().min(1, 'Please describe the issue or idea'),
})

type FormValues = z.infer<typeof schema>

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'BUG', label: 'Report a problem' },
  { value: 'IDEA', label: 'Suggest an idea' },
  { value: 'QUESTION', label: 'Ask a question' },
]

/**
 * SYS-062 feedback / report-a-problem form. Globally mounted; open state is driven by
 * the shared overlay coordinator (`activeModal === 'feedback'`). Screenshots (PNG/JPEG,
 * ≤2 MB, ≤3) can be picked or pasted and ride base64-in-JSON; `pageUrl`/`appVersion`
 * are attached automatically for diagnostics.
 */
export function FeedbackDialog() {
  const open = useUiOverlay((s) => s.activeModal === 'feedback')
  const openModal = useUiOverlay((s) => s.openModal)
  const closeModal = useUiOverlay((s) => s.closeModal)
  const { data: portalInfo } = usePortalInfo()
  const { toast } = useToast()
  const submit = useSubmitFeedback()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { type: 'BUG', title: '', message: '' },
  })

  function setOpen(next: boolean) {
    if (next) {
      openModal('feedback')
    } else {
      closeModal('feedback')
      reset()
      setAttachments([])
      setAttachmentError(null)
    }
  }

  async function addFiles(files: FileList | File[]) {
    setAttachmentError(null)
    const incoming = Array.from(files).filter((f) => isAcceptedImage(f.type))
    if (incoming.length === 0) return
    const room = MAX_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setAttachmentError(`You can attach at most ${MAX_ATTACHMENTS} screenshots`)
      return
    }
    const accepted: PendingAttachment[] = []
    for (const file of incoming.slice(0, room)) {
      try {
        accepted.push(await readFileAsAttachment(file))
      } catch (e) {
        setAttachmentError(e instanceof Error ? e.message : 'Could not read file')
      }
    }
    // De-dupe by client id so re-picking the same file doesn't double it.
    setAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.id))
      return [...prev, ...accepted.filter((a) => !seen.has(a.id))]
    })
  }

  function onPaste(e: ClipboardEvent) {
    const images = Array.from(e.clipboardData.files).filter((f) => isAcceptedImage(f.type))
    if (images.length > 0) {
      e.preventDefault()
      void addFiles(images)
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await submit.mutateAsync({
        type: values.type,
        title: values.title?.trim() || null,
        message: values.message.trim(),
        pageUrl: window.location.pathname + window.location.search,
        appVersion: portalInfo?.version ?? null,
        attachments: attachments.length > 0 ? attachments.map(toPayload) : null,
      })
      toast({ title: 'Thanks for the feedback', description: 'Your report has been sent.' })
      setOpen(false)
    } catch (err) {
      const description =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Please try again.'
      toast({ title: 'Could not send feedback', description, variant: 'destructive' })
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg" onPaste={onPaste}>
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
          <DialogDescription>
            Report a problem, suggest an idea, or ask a question. You can attach screenshots.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="feedback-type">Type</Label>
            <select
              id="feedback-type"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              {...register('type')}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-title">Title (optional)</Label>
            <Input id="feedback-title" placeholder="Short summary" {...register('title')} />
            {errors.title?.message && <InlineError message={errors.title.message} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">Details</Label>
            <textarea
              id="feedback-message"
              rows={5}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="What happened? What did you expect?"
              {...register('message')}
            />
            {errors.message?.message && <InlineError message={errors.message.message} />}
          </div>

          <div className="space-y-1.5">
            <Label>Screenshots (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {attachments.map((a) => (
                <div key={a.id} className="relative">
                  <img
                    src={a.previewUrl}
                    alt={a.filename}
                    className="h-16 w-16 rounded border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    aria-label={`Remove ${a.filename}`}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {attachments.length < MAX_ATTACHMENTS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded border border-dashed text-muted-foreground hover:bg-accent/50"
                  aria-label="Add screenshot"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span className="text-[10px]">Add</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <p className="text-xs text-muted-foreground">
              PNG or JPEG, up to 2 MB each, {MAX_ATTACHMENTS} max. You can paste an image too.
            </p>
            {attachmentError && <InlineError message={attachmentError} />}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send feedback
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
