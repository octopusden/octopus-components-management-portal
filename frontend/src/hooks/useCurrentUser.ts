import { useQuery } from '@tanstack/react-query'
import { fetchCurrentUser } from '@/lib/auth'

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
    retry: false,
  })
}
