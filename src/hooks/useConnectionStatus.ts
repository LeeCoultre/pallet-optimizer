/* ─────────────────────────────────────────────────────────────────────────
   useConnectionStatus — derives a coarse online/offline/reconnecting
   signal from two independent sources:

     1. navigator.onLine                   — browser-level (WiFi, cellular)
     2. backend health probe (every 30s)   — pings /openapi.json with a
                                             3s timeout. Catches the case
                                             where the network is up but
                                             the FastAPI server is down.

   Returned `state` field uses three values so the UI can distinguish
   "everything OK" from "trying to reach the server" from "definitely
   offline":
     • 'online'        — both signals green
     • 'reconnecting'  — navigator.onLine but the last probe was
                          mid-flight or just failed and we're retrying
     • 'offline'       — navigator says offline OR the last 2 probes
                          failed in a row

   Polling backs off when offline (60s) to avoid wasted network on
   captive-portals, and accelerates when the navigator transitions
   back online (probe immediately).
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env?.VITE_API_URL || '';
const PROBE_PATH = '/openapi.json';
const PROBE_TIMEOUT_MS = 3000;
const PROBE_INTERVAL_OK_MS = 30_000;
const PROBE_INTERVAL_OFFLINE_MS = 60_000;
const FAILURES_BEFORE_OFFLINE = 2;

export function useConnectionStatus() {
  const [navOnline, setNavOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [backendOk, setBackendOk] = useState(true);
  const [probing, setProbing] = useState(false);
  const [hasFailures, setHasFailures] = useState(false);     // surfaced for render
  const [lastError, setLastError] = useState<string | null>(null);
  const consecutiveFailures = useRef(0);

  /* ── Browser-level online/offline events ───────────────────────── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => setNavOnline(navigator.onLine);
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  /* ── Backend probe loop ────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    let timer;

    const probe = async () => {
      if (cancelled) return;
      setProbing(true);
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
        const res = await fetch(`${API_BASE}${PROBE_PATH}`, {
          signal: ctrl.signal,
          method: 'GET',
          // Health probe — never cache
          cache: 'no-store',
        });
        clearTimeout(timeout);
        if (cancelled) return;
        if (res.ok) {
          consecutiveFailures.current = 0;
          setHasFailures(false);
          setBackendOk(true);
          setLastError(null);
        } else {
          consecutiveFailures.current += 1;
          setHasFailures(true);
          if (consecutiveFailures.current >= FAILURES_BEFORE_OFFLINE) {
            setBackendOk(false);
          }
          setLastError(`HTTP ${res.status}`);
        }
      } catch (err) {
        if (cancelled) return;
        consecutiveFailures.current += 1;
        setHasFailures(true);
        if (consecutiveFailures.current >= FAILURES_BEFORE_OFFLINE) {
          setBackendOk(false);
        }
        setLastError(err?.message || 'fetch failed');
      } finally {
        if (!cancelled) {
          setProbing(false);
          const nextDelay = backendOk ? PROBE_INTERVAL_OK_MS : PROBE_INTERVAL_OFFLINE_MS;
          timer = setTimeout(probe, nextDelay);
        }
      }
    };

    probe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // We deliberately do NOT depend on backendOk here — that would
    // restart the loop on every transition. The interval pacing is
    // recomputed inside the loop via the latest setState value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Re-probe immediately on navigator-online transition ──────── */
  useEffect(() => {
    if (!navOnline) return;
    // Force a probe when network comes back online so the UI doesn't
    // wait up to 30/60s for the next scheduled probe.
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        const ctrl = new AbortController();
        const tt = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
        const r = await fetch(`${API_BASE}${PROBE_PATH}`, {
          signal: ctrl.signal,
          method: 'GET',
          cache: 'no-store',
        });
        clearTimeout(tt);
        if (cancelled) return;
        if (r.ok) {
          consecutiveFailures.current = 0;
          setHasFailures(false);
          setBackendOk(true);
          setLastError(null);
        }
      } catch {
        // probe loop will handle it
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [navOnline]);

  /* ── Compose final state — derived purely from state values ──── */
  let state = 'online';
  if (!navOnline) state = 'offline';
  else if (!backendOk) state = 'offline';
  else if (probing && hasFailures) state = 'reconnecting';

  return {
    state,        // 'online' | 'reconnecting' | 'offline'
    navOnline,
    backendOk,
    probing,
    lastError,
  };
}