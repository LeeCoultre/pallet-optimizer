// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
/* Last N successfully-parsed uploads, persisted in localStorage.

   Each entry:
     { id, fileName, fbaCode, palletCount, articleCount, ts }

   • `id` is the auftrag UUID, so clicks can navigate to its detail.
   • `ts` lets us format "vor X min" relative to now.

   Capped at MAX (default 5) — older entries fall off the tail. We
   de-dupe by id: re-uploading the same auftrag bumps it to the top
   instead of creating a second row.

   No auto-cleanup of completed/deleted Aufträge — the recent list is
   purely a UX shortcut, dead links just open a 404 detail. We could
   prune via /api/auftraege?ids=... but it's not worth the complexity
   for a list of 5. */

import { useCallback, useEffect, useState } from 'react';

const KEY = 'marathon.recent_uploads.v1';
const MAX = 5;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export function useRecentUploads() {
  const [items, setItems] = useState(read);

  /* Keep multiple tabs/sessions in sync — storage event fires when
     another window writes the same key. */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setItems(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((entry) => {
    if (!entry?.id) return;
    setItems((prev) => {
      const next = [
        { ...entry, ts: entry.ts ?? Date.now() },
        ...prev.filter((e) => e.id !== entry.id),
      ].slice(0, MAX);
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => {
      const next = prev.filter((e) => e.id !== id);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    write([]);
    setItems([]);
  }, []);

  return { items, add, remove, clear };
}