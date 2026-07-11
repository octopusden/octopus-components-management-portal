# Feedback & "What's new" announcements

Two paired surfaces (SYS-062):

1. **Feedback / report-a-problem** — any authenticated user can file a report (bug / idea /
   question) with optional screenshots; admins triage it.
2. **"What's new" announcements** — a first-open modal + one-time feature spotlight that
   tells users about new capabilities.

The backend (storage, API, admin gating, retention, size limits, screenshot security) is
owned by CRS — see CRS `docs/registry/adr/019-feedback.md` and `SYS-062` in
`requirements-common.md`. This doc covers the **portal** side.

## Feedback (portal)

- **Entry point:** the `Feedback` button in the header ([`FeedbackButton.tsx`](../../frontend/src/components/feedback/FeedbackButton.tsx)),
  carrying `data-spotlight="feedback"` so the announcement spotlight can point at it.
- **Form:** [`FeedbackDialog.tsx`](../../frontend/src/components/feedback/FeedbackDialog.tsx)
  (react-hook-form + zod). Screenshots are picked or **pasted**, validated client-side
  (PNG/JPEG, ≤2 MB, ≤3 — [`feedbackAttachments.ts`](../../frontend/src/lib/feedbackAttachments.ts)),
  and sent **base64-in-JSON** via [`useFeedback.ts`](../../frontend/src/hooks/useFeedback.ts).
  `pageUrl` and `appVersion` (from `usePortalInfo().data.version`) are attached automatically.
- **Admin view:** a **Feedback tab** on the Admin page ([`FeedbackPanel.tsx`](../../frontend/src/components/admin/FeedbackPanel.tsx)),
  gated by `IMPORT_DATA` like the rest of that page. Filter by type/status, view screenshots
  (rendered by `<img>` against the admin attachment-bytes endpoint), and advance status.
- **Gateway body-size guard:** [`FeedbackRequestSizeWebFilter.kt`](../../src/main/kotlin/org/octopusden/octopus/components/portal/configuration/FeedbackRequestSizeWebFilter.kt)
  rejects an oversized feedback POST with `413` (primary limit; CRS carries a second-line
  guard). Cap: `portal.feedback.max-request-bytes` (default 12 MiB).

## Announcements ("What's new")

- **Content is config-as-code** in [`announcements.tsx`](../../frontend/src/announcements/announcements.tsx)
  — a newest-first list of `{ id, title, body (JSX), spotlightTarget?, video?, showIntroVideoButton? }`.
  There is no backend/admin CRUD. To announce something, add an entry with a new stable `id`.
- **Seen-state is per-user localStorage** ([`announcementsSeen.ts`](../../frontend/src/lib/announcementsSeen.ts),
  keys `octopus.portal.seenAnnouncements.<username>` / `…seenSpotlight.<username>`), matching
  the onboarding-video convention.
- **Auto-open shows only the single newest UNSEEN entry** ([`Announcements.tsx`](../../frontend/src/components/announcements/Announcements.tsx)) —
  a brand-new user is never flooded with history. The header **What's new** button
  ([`AnnouncementsButton.tsx`](../../frontend/src/components/announcements/AnnouncementsButton.tsx))
  reopens the modal ([`WhatsNewModal.tsx`](../../frontend/src/components/announcements/WhatsNewModal.tsx))
  with all entries on demand.
- **Feature spotlight** ([`FeatureSpotlight.tsx`](../../frontend/src/components/announcements/FeatureSpotlight.tsx)) —
  after the modal closes, a one-time coach-mark highlights the `data-spotlight` element named
  by the entry, then persists its per-announcement seen flag.
- **Video** is served **same-origin** (external URLs can't embed). The intro video reuses the
  existing onboarding player (`showIntroVideoButton` opens it); an entry may also embed a
  same-origin `<video>` via `video.src`. Serving additional named media assets from the
  onboarding media repo is a follow-up if per-announcement videos are needed.

## Overlay coordination (no stacking)

All app-global overlays route through the shared coordinator
[`uiOverlayStore.ts`](../../frontend/src/lib/uiOverlayStore.ts): the ⌘K palette, the `?`
shortcuts panel, and the two "big" modals (`activeModal` = `feedback` | `announcement`).
Opening any one closes the others. The auto-announcement additionally **yields** to a pending
onboarding nudge/player, and the spotlight only appears once **every** overlay is closed —
so first-run popups never stack.
