import type { ReactNode } from 'react'

/**
 * SYS-062 "What's new" — config-as-code announcements shown to users on the first open
 * after a new version, plus on demand from the header. This is the ONLY source of
 * announcement content (no backend/admin CRUD).
 *
 * Authoring an entry:
 *  - `id` is a STABLE, unique key. It is what per-user "seen" state is keyed on, so never
 *    reuse or renumber an existing id.
 *  - Keep the list NEWEST FIRST. Auto-open shows only the single newest unseen entry.
 *  - `body` is JSX (no markdown renderer in the bundle — keep it simple/inline).
 *  - `spotlightTarget` (optional) points the one-time coach-mark at a UI element carrying
 *    `data-spotlight="<target>"` after the modal closes.
 *  - `video` (optional) embeds a SAME-ORIGIN `<video>` (external URLs won't embed). For
 *    the intro video, prefer `showIntroVideoButton` which reuses the onboarding player.
 */
export interface Announcement {
  id: string
  version?: string
  title: string
  body: ReactNode
  publishedAt: string
  spotlightTarget?: string
  video?: { src: string; poster?: string }
  /** Show a "Watch the intro" button that opens the existing onboarding video player. */
  showIntroVideoButton?: boolean
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'feedback-and-reports-2026-07',
    version: '1.1',
    title: 'New: send feedback & report problems',
    publishedAt: '2026-07-11',
    spotlightTarget: 'feedback',
    showIntroVideoButton: true,
    body: (
      <div className="space-y-2">
        <p>
          You can now tell us what&apos;s working and what isn&apos;t. Use the{' '}
          <strong>Feedback</strong> button in the top bar to report a problem, suggest an idea,
          or ask a question — and attach a screenshot if it helps.
        </p>
        <p className="text-muted-foreground">
          We read everything that comes in. Thanks for helping make the portal better.
        </p>
      </div>
    ),
  },
]
