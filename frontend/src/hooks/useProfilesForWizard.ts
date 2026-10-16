import { useState } from 'react'
import { useComponentProfiles, type ComponentProfile } from './useComponentProfiles'

/**
 * The profiles the wizard opens with: a listing fetched after the page mounted, never a cached
 * one, kept from then on so a later refetch that fails cannot tear down a form in progress.
 * `unavailable` holds only while no listing has arrived and the fetch failed.
 */
export function useProfilesForWizard() {
  const profiles = useComponentProfiles()
  const [openedWith, setOpenedWith] = useState<ComponentProfile[] | null>(null)
  const fresh = profiles.isSuccess && profiles.isFetchedAfterMount && !profiles.isFetching
  if (openedWith === null && fresh) setOpenedWith(profiles.data ?? [])
  return {
    openedWith,
    unavailable: openedWith === null && profiles.isError,
    retry: () => void profiles.refetch(),
  }
}
