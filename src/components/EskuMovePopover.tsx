// @ts-nocheck — reuse the ad-hoc style approach of sibling components
/* ─────────────────────────────────────────────────────────────────────────
   EskuMovePopover — reusable pallet picker for manual ESKU rerouting.

   Used by both Pruefen (every ESKU row gets a "verschieben" button) and
   Focus (the current item, when it's an ESKU, gets the same picker in
   the action bar).

   Anchored to its trigger via fixed positioning + getBoundingClientRect
   (avoids portal complexity — the popover is a sibling rendered
   conditionally). Click outside / Escape closes. Pallets are listed
   with id, level chip, current fill%, and how many ESKU items are
   already on them. H7 pallets (hasFourSideWarning) are visible but
   disabled — Single-SKU rule is absolute. The current target is
   highlighted; if a manual override is active, "Auto-Ziel" reverts.
   ───────────────────────────────────────────────────────────────────── */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LEVEL_META } from '@/utils/auftragHelpers.js';
import { T } from './ui.jsx';

export default function EskuMovePopover({
  open,
  anchorEl,
  pallets,            // enriched pallets [{ id, level, hasFourSideWarning }]
  palletStates,       // distribution.palletStates — { [id]: { volCm3, fillPct, ... } }
  byPalletId,         // distribution.byPalletId — { [id]: ESKU items[] }
  currentPalletId,    // pid the ESKU is currently on (post-override)
  isOverridden,       // true if the active assignment is a manual override
  onPick,             // (palletId | null) => void   — null = revert to auto
  onClose,
}) {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'below' });

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popH = 360;
    const popW = 320;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const below = rect.bottom + popH < vh - 16;
    let left = rect.right - popW;
    if (left < 16) left = Math.min(rect.left, vw - popW - 16);
    if (left + popW > vw - 16) left = vw - popW - 16;
    const top = below ? rect.bottom + 8 : Math.max(16, rect.top - popH - 8);
    setPos({ top, left, placement: below ? 'below' : 'above' });
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    function onClick(e) {
      if (popRef.current?.contains(e.target)) return;
      if (anchorEl?.contains(e.target)) return;
      onClose?.();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open, anchorEl, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const sorted = [...(pallets || [])].sort((a, b) => {
    // Eligible first, then by current fill ASC (least-filled = best target)
    const aBlock = a.hasFourSideWarning ? 1 : 0;
    const bBlock = b.hasFourSideWarning ? 1 : 0;
    if (aBlock !== bBlock) return aBlock - bBlock;
    const af = palletStates?.[a.id]?.fillPct ?? 0;
    const bf = palletStates?.[b.id]?.fillPct ?? 0;
    return af - bf;
  });

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label="ESKU auf andere Palette verschieben"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: 320,
        maxHeight: 360,
        background: T.bg.surface,
        border: `1px solid ${T.border.strong}`,
        borderRadius: 14,
        boxShadow: '0 12px 32px -8px rgba(17,24,39,0.18), 0 4px 12px rgba(17,24,39,0.08)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'mp-esku-pop 160ms cubic-bezier(0.16,1,0.3,1)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <style>{`@keyframes mp-esku-pop {
        0%   { opacity: 0; transform: translateY(${pos.placement === 'below' ? '-4px' : '4px'}); }
        100% { opacity: 1; transform: translateY(0); }
      }`}</style>

      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${T.border.subtle}`,
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{
          fontSize: 11,
          fontFamily: T.font.mono,
          fontWeight: 700,
          color: T.text.faint,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}>
          ESKU verschieben
        </div>
        {isOverridden && (
          <button
            type="button"
            onClick={() => { onPick?.(null); onClose?.(); }}
            style={{
              fontSize: 10.5,
              fontFamily: T.font.mono,
              fontWeight: 700,
              color: T.accent.text,
              background: T.accent.bg,
              border: `1px solid ${T.accent.border}`,
              padding: '3px 8px',
              borderRadius: 999,
              cursor: 'pointer',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Auto-Ziel
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sorted.map((p) => {
          const meta = LEVEL_META[p.level] || LEVEL_META[1];
          const ps = palletStates?.[p.id];
          const fillPct = Math.round(((ps?.fillPct ?? 0)) * 100);
          const eskuCount = byPalletId?.[p.id]?.length || 0;
          const isCurrent = p.id === currentPalletId;
          const disabled = !!p.hasFourSideWarning;
          const overload = ps?.overloadFlags?.size > 0;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled || isCurrent}
              onClick={() => { onPick?.(p.id); onClose?.(); }}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '14px 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '10px 16px',
                background: isCurrent ? T.accent.bg : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${T.border.subtle}`,
                textAlign: 'left',
                cursor: disabled || isCurrent ? 'default' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                transition: 'background 120ms',
              }}
              onMouseEnter={(e) => {
                if (disabled || isCurrent) return;
                e.currentTarget.style.background = T.bg.surface2;
              }}
              onMouseLeave={(e) => {
                if (disabled || isCurrent) return;
                e.currentTarget.style.background = 'transparent';
              }}
              title={
                disabled ? '4-Seiten-Warnung: Single-SKU-Palette, ESKU nicht erlaubt'
                : isCurrent ? 'Aktuelle Palette'
                : `${p.id} · L${p.level} ${meta.shortName} · ${fillPct}% gefüllt`
              }
            >
              <span style={{
                width: 10, height: 10,
                background: meta.color,
                borderRadius: 2,
                flexShrink: 0,
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: T.text.primary,
                  fontFamily: T.font.mono,
                  letterSpacing: '-0.005em',
                }}>
                  {p.id}
                  {isCurrent && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 9.5,
                      color: T.accent.text,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}>
                      aktuell
                    </span>
                  )}
                  {disabled && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 9.5,
                      color: T.status.danger.text,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}>
                      4-Seiten
                    </span>
                  )}
                </div>
                <div style={{
                  marginTop: 2,
                  fontSize: 10,
                  fontFamily: T.font.mono,
                  color: T.text.faint,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}>
                  L{p.level} {meta.shortName} · {fillPct}% · {eskuCount} ESKU
                  {overload && (
                    <span style={{ color: T.status.warn.text, marginLeft: 6 }}>
                      · OVERLOAD
                    </span>
                  )}
                </div>
              </div>
              <span style={{
                fontSize: 11,
                fontFamily: T.font.mono,
                color: fillPct >= 95 ? T.status.warn.text : T.text.faint,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fillPct}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '8px 16px',
        borderTop: `1px solid ${T.border.subtle}`,
        fontSize: 10,
        fontFamily: T.font.mono,
        color: T.text.faint,
        letterSpacing: '0.04em',
      }}>
        Esc schließen · Gruppe verschiebt sich komplett
      </div>
    </div>,
    document.body,
  );
}
