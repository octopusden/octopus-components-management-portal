import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AdminModeState {
  enabled: boolean
  toggle: () => void
  set: (enabled: boolean) => void
}

export const useAdminMode = create<AdminModeState>()(
  persist(
    (set) => ({
      enabled: false,
      toggle: () => set((s) => ({ enabled: !s.enabled })),
      set: (enabled) => set({ enabled }),
    }),
    { name: 'octopus.portal.adminMode' },
  ),
)
