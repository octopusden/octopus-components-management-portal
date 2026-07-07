import { create } from 'zustand'

/**
 * Ephemeral open-state for the onboarding-video modal (NOT persisted). A tiny shared
 * store so the header button, the first-login coachmark, and any future entry point can
 * open the same globally-mounted dialog without threading callbacks through the tree —
 * same pattern as uiOverlayStore for the command palette / shortcuts panel.
 */
interface OnboardingVideoState {
  open: boolean
  openVideo: () => void
  closeVideo: () => void
  setOpen: (open: boolean) => void
}

export const useOnboardingVideo = create<OnboardingVideoState>((set) => ({
  open: false,
  openVideo: () => set({ open: true }),
  closeVideo: () => set({ open: false }),
  setOpen: (open) => set({ open }),
}))
