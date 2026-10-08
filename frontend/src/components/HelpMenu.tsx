import { CircleHelp, Keyboard, MessageSquarePlus, PlayCircle } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { useOnboardingVideoStatus } from '@/hooks/useInfo'
import { useOnboardingVideo } from '@/lib/onboardingVideoStore'
import { useUiOverlay } from '@/lib/uiOverlayStore'

/**
 * Header "?" menu: the help and feedback entry points that used to be three labelled header
 * buttons/links — the intro video (only when the backend reports it `ready`), the keyboard
 * shortcuts panel, and SYS-062 feedback / report-a-problem. The trigger keeps
 * `data-spotlight="feedback"` so the feedback announcement's coach-mark still lands on a
 * visible element.
 */
export function HelpMenu() {
  const { data } = useOnboardingVideoStatus()
  const openVideo = useOnboardingVideo((s) => s.openVideo)
  const openShortcuts = useUiOverlay((s) => s.openShortcuts)
  const openModal = useUiOverlay((s) => s.openModal)
  const videoReady = data?.onboardingVideoStatus === 'ready'

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground"
          aria-label="Help and feedback"
          title="Help and feedback"
          data-spotlight="feedback"
        >
          <CircleHelp className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {videoReady && (
          <DropdownMenuItem onSelect={openVideo}>
            <PlayCircle />
            Watch the intro
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={openShortcuts}>
          <Keyboard />
          Keyboard shortcuts
          <kbd className="ml-auto rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ?
          </kbd>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openModal('feedback')}>
          <MessageSquarePlus />
          Send feedback or report a problem
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
