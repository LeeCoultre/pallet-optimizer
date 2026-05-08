/* Shared /api/me query — TanStack dedupes by ['me'] queryKey, so it's
   safe to call from many components. Stable for the whole session. */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { getMe } from '@/marathonApi';
import type { UserResponse } from '@/types/api';

export function useMe(): UseQueryResult<UserResponse, Error> {
  const { isSignedIn } = useAuth();
  return useQuery<UserResponse, Error>({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !!isSignedIn,
    refetchInterval: false,
    staleTime: Infinity,
    retry: false,
  });
}
