import { create } from 'zustand'

/**
 * Ephemeral (NOT persisted) state for the onboarding video, shared across the header
 * button, the first-login banner, and the globally-mounted dialog — same pattern as
 * uiOverlayStore.
 *
 * `bannerDismissed` lives here (not in the banner's local state) on purpose: each page
 * mounts its own Layout instance, so a per-component flag would reset on every navigation
 * and the banner would pop back up on the next page. A store flag survives navigation and
 * only resets on a full reload (= a new session), which is exactly the "hide for this
 * session" semantics we want after Later/×/Don't-show-again.
 */
interface OnboardingVideoState {
  open: boolean
  openVideo: () => void
  closeVideo: () => void
  setOpen: (open: boolean) => void
  bannerDismissed: boolean
  dismissBanner: () => void
}

export const useOnboardingVideo = create<OnboardingVideoState>((set) => ({
  open: false,
  // Opening the player (from ANY entry point — header button or banner) also dismisses the
  // banner for this session via the shared store flag, so it can't linger behind the modal
  // or reappear after close even though each component has its own useOnboardingSeen state.
  openVideo: () => set({ open: true, bannerDismissed: true }),
  closeVideo: () => set({ open: false }),
  setOpen: (open) => set({ open }),
  bannerDismissed: false,
  dismissBanner: () => set({ bannerDismissed: true }),
}))
