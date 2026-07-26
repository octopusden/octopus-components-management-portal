import { Megaphone } from 'lucide-react'
import { Button } from '../ui/button'
import { ANNOUNCEMENTS } from '@/announcements/announcements'
import { useAnnouncementsStore } from '@/lib/announcementsStore'
import { useUiOverlay } from '@/lib/uiOverlayStore'

/**
 * SYS-062 permanent "What's new" entry point in the header. Opens the modal showing ALL
 * announcements (newest first) on demand, via the shared overlay coordinator.
 */
export function AnnouncementsButton() {
  const present = useAnnouncementsStore((s) => s.present)
  const openModal = useUiOverlay((s) => s.openModal)

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        present(ANNOUNCEMENTS)
        openModal('announcement')
      }}
      className="gap-2 text-muted-foreground"
      aria-label="What's new"
      title="What's new"
    >
      <Megaphone className="h-4 w-4" />
      <span className="hidden md:inline">What&apos;s new</span>
    </Button>
  )
}
