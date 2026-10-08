import type { ReactNode } from 'react'

/**
 * SYS-062 "What's new" — config-as-code announcements shown to users on the first open
 * after a new version, plus on demand from the header. This is the ONLY source of
 * announcement content (no backend/admin CRUD).
 *
 * Authoring an entry:
 *  - `id` is a STABLE, unique key. It is what per-user "seen" state is keyed on, so never
 *    reuse or renumber an existing id.
 *  - Keep the list NEWEST FIRST. Auto-open shows every unseen entry (newest first).
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
    id: 'as-code-search-2026-10',
    version: '1.3',
    title: 'New: search across all components, like grepping the old Groovy files',
    publishedAt: '2026-10-08',
    spotlightTarget: 'as-code-search',
    body: (
      <div className="space-y-2">
        <p>
          Type into <strong>Global search…</strong> in the header (or press <strong>/</strong>) to
          search the as-code text of <strong>every</strong> component at once — artifact and group
          patterns, version ranges, VCS URLs, Jira keys, docker images, owners. The first matches
          show right under the field; click one to jump straight to that line in the
          component&apos;s <strong>As Code</strong> tab.
        </p>
        <p className="text-muted-foreground">
          Press <strong>Enter</strong> (or <strong>See all</strong>) for the full results page with
          extended search: regular expressions and archived components. To jump to a component by
          name, use <strong>Go to…</strong> (⌘K).
        </p>
      </div>
    ),
  },
  {
    id: 'lighter-ui-2026-10',
    version: '1.3',
    title: 'A lighter, tidier interface',
    publishedAt: '2026-10-08',
    body: (
      <div className="space-y-2">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Header:</strong> Admin settings, Validations and Admin mode moved to your
            avatar menu; help and feedback to the <strong>?</strong> menu.
          </li>
          <li>
            <strong>Components list:</strong> <strong>Status</strong> (Active / Archived / All) and{' '}
            <strong>Mine</strong> (owner, release manager, security champion) replace the preset
            tabs; rarer filters live under <strong>+ Filter</strong>, active ones show as chips.
          </li>
          <li>
            <strong>Audit log:</strong> the same compact filter row, with a single{' '}
            <strong>period</strong> picker.
          </li>
        </ul>
        <p className="text-muted-foreground">Old bookmarks and links keep working.</p>
      </div>
    ),
  },
  {
    id: 'owner-manager-can-edit-2026-07',
    version: '1.2',
    title: "New: a component owner's manager can now edit it too",
    publishedAt: '2026-07-24',
    body: (
      <div className="space-y-2">
        <p>
          A component owner's <strong>manager</strong> now always has edit rights on that
          component, alongside the owner. The <strong>Who can edit</strong> panel on each
          component page lists everyone with edit access, including the owner's manager.
        </p>
        <p className="text-muted-foreground">
          This is in addition to the existing owner, release manager, and security champion
          permissions.
        </p>
      </div>
    ),
  },
  {
    id: 'feedback-and-reports-2026-07',
    version: '1.1',
    title: 'New: send feedback & report problems',
    publishedAt: '2026-07-11',
    spotlightTarget: 'feedback',
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
