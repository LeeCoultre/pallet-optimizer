/* Working-day window for the calling user — drives the shift timer
   in WorkspaceHeader.

   Backend computes started_at + duration_sec on every call. The
   refetchInterval is 60s (cheap query, but polling more often is
   pointless — display ticks locally between fetches via a useEffect
   in the header).

   `enabled` requires a Clerk session because /api/activity/shift is
   auth-only; calling it pre-sign-in just 401s. */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { getMyShift } from '@/marathonApi';
import type { ShiftInfo } from '@/types/api';

export function useMyShift(): UseQueryResult<ShiftInfo, Error> {
  const { isSignedIn } = useAuth();
  return useQuery<ShiftInfo, Error>({
    queryKey: ['my-shift'],
    queryFn: getMyShift,
    enabled: !!isSignedIn,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}
