import { MessageSquarePlus } from 'lucide-react'
import { Button } from '../ui/button'
import { useUiOverlay } from '@/lib/uiOverlayStore'

/**
 * SYS-062 header entry point for feedback / report-a-problem. Carries
 * `data-spotlight="feedback"` so the What's-new feature spotlight can point at it.
 * Opening routes through the shared overlay coordinator (closes palette/shortcuts).
 */
export function FeedbackButton() {
  const openModal = useUiOverlay((s) => s.openModal)
  return (
    <Button
      variant="ghost"
      size="sm"
      data-spotlight="feedback"
      onClick={() => openModal('feedback')}
      className="gap-2 text-muted-foreground"
      aria-label="Send feedback or report a problem"
      title="Send feedback"
    >
      <MessageSquarePlus className="h-4 w-4" />
      <span className="hidden md:inline">Feedback</span>
    </Button>
  )
}
