import { Megaphone } from 'lucide-react'
import { Button } from '../ui/button'
import { ANNOUNCEMENTS } from '@/announcements/announcements'
import { useAnnouncementsStore } from '@/lib/announcementsStore'
import { useAnnouncementsSeen } from '@/lib/announcementsSeen'
import { useUiOverlay } from '@/lib/uiOverlayStore'

/**
 * SYS-062 permanent "What's new" entry point in the header: an icon button (label in the tooltip
 * and accessible name) with a dot while this user has unseen announcements. Opens the modal
 * showing ALL announcements (newest first) on demand, via the shared overlay coordinator.
 */
export function AnnouncementsButton() {
  const present = useAnnouncementsStore((s) => s.present)
  const openModal = useUiOverlay((s) => s.openModal)
  const { ready, seenAnnouncements } = useAnnouncementsSeen()
  const hasUnseen = ready && ANNOUNCEMENTS.some((a) => !seenAnnouncements.includes(a.id))

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        present(ANNOUNCEMENTS)
        openModal('announcement')
      }}
      className="relative h-9 w-9 text-muted-foreground"
      aria-label={hasUnseen ? "What's new (unread)" : "What's new"}
      title="What's new"
    >
      <Megaphone className="h-4 w-4" />
      {hasUnseen && (
        <span
          data-testid="whats-new-dot"
          aria-hidden
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card"
        />
      )}
    </Button>
  )
}
