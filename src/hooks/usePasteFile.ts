// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
/* Listens for a window-level paste event and forwards any files in
   the clipboard to the consumer.

   Behaviour:
     • Only triggers when paste happens OUTSIDE an editable element
       (inputs, textareas, contenteditable). We don't want to steal
       paste from a real text input.
     • Filters by .docx extension OR known MIME type — usePasteFile
       is reused only by Upload, which only accepts .docx, but the
       filtering happens here to keep the hook self-contained.
     • Hands the file list to the callback unchanged; the consumer
       handles the actual upload pipeline. */

import { useEffect } from 'react';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function looksLikeDocx(file) {
  if (!file) return false;
  if (file.type === DOCX_MIME) return true;
  return /\.docx$/i.test(file.name || '');
}

export function usePasteFile(onPaste) {
  useEffect(() => {
    if (typeof onPaste !== 'function') return undefined;
    const handler = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const editable = t?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;

      const files = Array.from(e.clipboardData?.files || []).filter(looksLikeDocx);
      if (files.length === 0) return;
      e.preventDefault();
      onPaste(files);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [onPaste]);
}