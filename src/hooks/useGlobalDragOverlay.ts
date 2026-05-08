/* Detects drag-over the entire window so an overlay can render.

   Browser quirks:
     • dragenter/dragleave fire for every element transition — we use
       a ref counter so the overlay only hides when ALL nested
       enter/leave pairs balance out.
     • dragend doesn't fire reliably when the user drops outside the
       window — we also reset on `drop` (handled by the consumer).
     • Files don't appear in dataTransfer.items until drop in some
       browsers — we sniff types instead, falling back to "any drag
       is fine" so we don't accidentally hide the overlay.

   Returns `{ over, ref }`. The consumer renders the overlay when
   `over === true` and binds `ref` to the same element where it wants
   drops accepted. Drops outside that element fall through normally.
*/

import { useEffect, useRef, useState } from 'react';

function hasFiles(e) {
  const types = e?.dataTransfer?.types;
  if (!types) return true;
  if (types.contains) return types.contains('Files');
  return Array.prototype.indexOf.call(types, 'Files') !== -1;
}

export function useGlobalDragOverlay() {
  const [over, setOver] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    const onEnter = (e) => {
      if (!hasFiles(e)) return;
      counter.current += 1;
      setOver(true);
    };
    const onLeave = (e) => {
      if (!hasFiles(e)) return;
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setOver(false);
    };
    const onDrop = () => {
      counter.current = 0;
      setOver(false);
    };
    /* Suppress browser default behaviour (open file in tab) on drops
       outside our drop-zone — otherwise a stray miss reloads the page. */
    const onDragOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onWinDrop = (e) => {
      if (!hasFiles(e)) return;
      /* If the drop target wasn't our overlay (no preventDefault was
         called on this specific event by anything in the bubble), the
         browser would navigate — block. */
      e.preventDefault();
      counter.current = 0;
      setOver(false);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onWinDrop);
    document.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onWinDrop);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  return over;
}