/* Lightweight API health probe — feeds the WorkspaceHeader pulse dot.

   Polls /api/health every 20s. The endpoint is process-only (no DB
   ping), so this is cheap. If we want a DB-aware probe we can switch
   to /api/health (sic — the api_health route in main.py).

   Status mapping:
     'ok'        → server replied 2xx within timeout
     'degraded'  → DB is down but the FastAPI process is alive
                   (only when we choose to call /api/health, not /health)
     'offline'   → fetch threw or non-2xx

   The query is lightweight enough to keep refetchInterval permanently;
   we don't gate it on signed-in because the pulse dot is a global
   indicator and useful even on the sign-in screen. */

import { useQuery } from '@tanstack/react-query';

const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined;
const BASE = envUrl ?? '';

async function probe() {
  const start = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BASE}/api/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    const elapsedMs = Math.round(performance.now() - start);
    if (!res.ok) return { status: 'offline', elapsedMs };
    return {
      status: data.db === 'ok' ? 'ok' : 'degraded',
      elapsedMs,
    };
  } catch {
    return { status: 'offline', elapsedMs: null };
  }
}

export function useApiHealth() {
  return useQuery({
    queryKey: ['api-health'],
    queryFn: probe,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    retry: false,
  });
}