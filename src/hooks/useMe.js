/* Shared /api/me query — TanStack dedupes by ['me'] queryKey, so it's
   safe to call from many components. Stable for the whole session. */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { getMe } from '../marathonApi.js';

export function useMe() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !!isSignedIn,
    refetchInterval: false,
    staleTime: Infinity,
    retry: false,
  });
}
