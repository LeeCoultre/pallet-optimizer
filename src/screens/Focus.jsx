/* Focus-Modus — Schritt 03. Cinema mode: ein Artikel im Fokus.
   Design System v3 (siehe DESIGN.md). */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppState } from '../state.jsx';
import { focusItemView } from '../utils/auftragHelpers.js';
import { detectWiederholt } from '../utils/wiederholtLogic.js';
import { Page, Card, Badge, Button, Meta, T } from '../components/ui.jsx';

const CAT = {
  THERMO:     { color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8', name: 'Thermorollen' },
  PRODUKTION: { color: '#10B981', bg: '#ECFDF5', text: '#047857', name: 'Big Bags / Produktion' },
  HEIPA:      { color: '#06B6D4', bg: '#ECFEFF', text: '#0E7490', name: 'Heipa' },
  VEIT:       { color: '#A855F7', bg: '#FAF5FF', text: '#7E22CE', name: 'Veit' },
  TACHO:      { color: '#F97316', bg: '#FFF7ED', text: '#C2410C', name: 'Tachorollen' },
  SONSTIGE:   { color: '#71717A', bg: '#FAFAFA', text: '#3F3F46', name: 'Sonstige' },
};

/* ════════════════════════════════════════════════════════════════════════ */
export default function FocusScreen() {
  const {
    current,
    setCurrentPalletIdx, setCurrentItemIdx,
    completeCurrentItem, cancelCurrent, goToStep,
  } = useAppState();

  const rawPallets = current?.parsed?.pallets || [];
  const palletIdx  = Math.min(current?.currentPalletIdx ?? 0, Math.max(0, rawPallets.length - 1));
  const itemIdx    = current?.currentItemIdx ?? 0;
  const completedKeysObj = current?.completedKeys || {};

  const rawPallet = rawPallets[palletIdx];
  const rawItem   = rawPallet?.items?.[Math.min(itemIdx, rawPallet.items.length - 1)];

  const pallet = rawPallet ? {
    id: rawPallet.id,
    items: rawPallet.items.map(focusItemView),
  } : null;
  const item = rawItem ? focusItemView(rawItem) : null;

  const [wiederholt, setWiederholt] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);   // persistent until article changes
  const [flashUse,   setFlashUse]   = useState(null);   // short pulse on use-item copy

  /* Track which items have had their Artikel-Code copied during this
     session — keyed by `${palletIdx}|${itemIdx}` so going back to a
     previous pallet preserves the flags. Only an actual copy click
     turns a chip green; completion ("Artikel abschließen") doesn't. */
  const [copiedKeys, setCopiedKeys] = useState(() => new Set());

  const totalArticles = rawPallets.reduce((s, p) => s + p.items.length, 0);
  const completedCount = Object.keys(completedKeysObj).length;
  const overallPct = totalArticles > 0 ? completedCount / totalArticles : 0;

  let articlesBefore = 0;
  for (let i = 0; i < palletIdx; i++) articlesBefore += rawPallets[i].items.length;
  const overallPos = articlesBefore + itemIdx + 1;

  /* Returns the indices of items on the current pallet whose Artikel-
     Code has NOT been copied yet — used to gate pallet transitions. */
  const missingCopies = useMemo(() => {
    if (!rawPallet) return [];
    const out = [];
    for (let i = 0; i < rawPallet.items.length; i++) {
      if (!copiedKeys.has(`${palletIdx}|${i}`)) out.push(i);
    }
    return out;
  }, [rawPallet, palletIdx, copiedKeys]);
  const allPalletCopied = missingCopies.length === 0;
  const isLastItemOfPallet = rawPallet && itemIdx === rawPallet.items.length - 1;

  const blockMessage = () =>
    `Bitte zuerst alle Artikel-Codes der aktuellen Palette kopieren ` +
    `(${missingCopies.length} fehlen noch), bevor du diese Palette abschließt.`;

  const goNextItem = useCallback(() => {
    if (!rawPallet) return;
    if (itemIdx + 1 < rawPallet.items.length) {
      setCurrentItemIdx(itemIdx + 1);
    } else if (palletIdx + 1 < rawPallets.length) {
      if (!allPalletCopied) {
        alert(blockMessage());
        return;
      }
      setCurrentPalletIdx(palletIdx + 1);
    }
  }, [rawPallet, itemIdx, palletIdx, rawPallets, allPalletCopied, setCurrentItemIdx, setCurrentPalletIdx]);

  const goPrevItem = useCallback(() => {
    if (itemIdx > 0) setCurrentItemIdx(itemIdx - 1);
    else if (palletIdx > 0) {
      const prevLen = rawPallets[palletIdx - 1].items.length;
      setCurrentPalletIdx(palletIdx - 1);
      setTimeout(() => setCurrentItemIdx(prevLen - 1), 0);
    }
  }, [itemIdx, palletIdx, rawPallets, setCurrentItemIdx, setCurrentPalletIdx]);

  const handleFertig = useCallback(() => {
    if (!rawPallet || !rawItem) return;
    /* Block "Artikel abschließen" on the LAST item of a pallet until
       every item's code has been copied — completing the last item
       advances pallet and we don't want that without all codes. */
    if (isLastItemOfPallet && !allPalletCopied) {
      alert(blockMessage());
      return;
    }
    const hit = detectWiederholt(rawPallets, palletIdx, itemIdx);
    completeCurrentItem();
    if (hit) setWiederholt(hit);
  }, [rawPallet, rawItem, rawPallets, palletIdx, itemIdx, completeCurrentItem,
      isLastItemOfPallet, allPalletCopied]);

  /* Wiederholt auto-dismiss after 5s */
  useEffect(() => {
    if (!wiederholt) return;
    const t = setTimeout(() => setWiederholt(null), 5000);
    return () => clearTimeout(t);
  }, [wiederholt]);

  /* All-done detection */
  useEffect(() => {
    if (!rawPallets.length) return;
    const isLastPallet = palletIdx === rawPallets.length - 1;
    const lastP = rawPallets[rawPallets.length - 1];
    const isPastLast = itemIdx >= (lastP?.items?.length || 0);
    if (isLastPallet && isPastLast && !wiederholt) {
      const t = setTimeout(() => goToStep('abschluss'), 200);
      return () => clearTimeout(t);
    }
  }, [palletIdx, itemIdx, rawPallets, wiederholt, goToStep]);

  /* Keyboard */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (wiederholt) {
        if (['Escape', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          setWiederholt(null);
          const lastP = rawPallets[rawPallets.length - 1];
          const lastP_lastIdx = lastP ? lastP.items.length - 1 : 0;
          if (palletIdx === rawPallets.length - 1 && itemIdx === lastP_lastIdx
              && Object.keys(completedKeysObj).length >= totalArticles) {
            setTimeout(() => goToStep('abschluss'), 100);
          }
        }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleFertig(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNextItem(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrevItem(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wiederholt, goNextItem, goPrevItem, handleFertig, completedKeysObj, totalArticles, palletIdx, itemIdx, rawPallets, goToStep]);

  const copyCode = (text) => {
    if (!text) return;
    copyToClipboard(text);
    setCopiedCode(text);
    setCopiedKeys((prev) => {
      const next = new Set(prev);
      next.add(`${palletIdx}|${itemIdx}`);
      return next;
    });
  };

  const copyUseItem = (text) => {
    if (!text) return;
    copyToClipboard(text);
    setFlashUse(text);
    setTimeout(() => setFlashUse(null), 1200);
  };

  const onExit = () => {
    if (window.confirm('Auftrag verlassen? Fortschritt bleibt gespeichert.')) {
      cancelCurrent();
    }
  };

  if (!pallet || !item) {
    return (
      <Page>
        <SlimTop overallPct={0} overallPos={0} totalArticles={0} onExit={cancelCurrent} />
        <main style={{ padding: '64px 32px', textAlign: 'center', color: T.text.subtle }}>
          Kein Auftrag geladen.
        </main>
      </Page>
    );
  }

  const cat = CAT[item.category] || CAT.SONSTIGE;

  return (
    <Page>
      <SlimTop
        overallPct={overallPct}
        overallPos={overallPos}
        totalArticles={totalArticles}
        onExit={onExit}
      />

      <PalletFlow pallets={rawPallets} currentIdx={palletIdx} />

      <ItemFlow
        items={rawPallet.items}
        palletId={pallet.id}
        palletIdx={palletIdx}
        currentIdx={itemIdx}
        copiedKeys={copiedKeys}
        onPick={(i) => setCurrentItemIdx(i)}
      />

      <main style={{
        position: 'relative',
        maxWidth: 880,
        margin: '0 auto',
        padding: '32px 32px 140px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Position eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: T.text.subtle,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent.main }} />
            Palette
            <span style={{
              fontFamily: T.font.mono,
              color: T.text.primary,
              fontWeight: 500,
            }}>{pallet.id}</span>
            <span style={{ color: T.text.faint }}>·</span>
            Artikel
            <span style={{ color: T.text.primary, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {itemIdx + 1}
            </span>
            <span style={{ color: T.text.faint }}>von</span>
            <span style={{ color: T.text.primary, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {pallet.items.length}
            </span>
          </span>
          <span style={{ flex: 1 }} />
          <Badge color={cat.color} bg={cat.bg} text={cat.text}>
            {cat.name}
          </Badge>
        </div>

        {/* Hero — product name */}
        <div key={`name-${pallet.id}-${itemIdx}`} className="mr-rise">
          <h1 style={{
            fontFamily: T.font.ui,
            fontSize: 'clamp(32px, 4.4vw, 48px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            margin: 0,
            color: T.text.primary,
          }}>
            {item.name}
          </h1>

          {item.rollen && (
            <div style={{
              marginTop: 10,
              fontFamily: T.font.mono,
              fontSize: 'clamp(18px, 2vw, 22px)',
              fontWeight: 600,
              color: T.accent.main,
              letterSpacing: '-0.01em',
            }}>
              {item.rollen} {item.rollenUnit || 'Rollen'} / Karton
            </div>
          )}

          <div style={{
            marginTop: 14,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}>
            {item.lst && (
              <Badge tone={item.lst === 'mit LST' ? 'accent' : 'neutral'}>
                {item.lst}
              </Badge>
            )}
            {item.dim && (
              <ChipMono>Format · {item.dim}</ChipMono>
            )}
          </div>
        </div>

        {/* Menge card */}
        <Card key={`qty-${pallet.id}-${itemIdx}`} style={{
          padding: '28px 32px',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 36,
          alignItems: 'center',
        }} className="mr-rise mr-rise-1">
          <div>
            <div style={{
              fontSize: 11.5,
              fontWeight: 500,
              color: T.text.subtle,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 8,
            }}>
              Menge
            </div>
            <div style={{
              fontFamily: T.font.ui,
              fontSize: 'clamp(64px, 8vw, 96px)',
              fontWeight: 600,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
              color: T.text.primary,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {item.units}
            </div>
            <div style={{
              marginTop: 6,
              fontSize: 13,
              color: T.text.subtle,
            }}>
              Kartons
            </div>
          </div>

          <div style={{
            paddingLeft: 32,
            borderLeft: `1px solid ${T.border.primary}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            {item.rollen ? (
              <>
                <Meta label="Pro Karton" value={`${item.rollen} ${item.rollenUnit || 'Rollen'}`} mono />
                <Meta label={`${item.rollenUnit || 'Rollen'} gesamt`} value={(item.units * item.rollen).toLocaleString('de-DE')} mono />
              </>
            ) : (
              <Meta label="Einheiten" value={item.units} mono />
            )}
          </div>
        </Card>

        {/* Code cards */}
        <div key={`codes-${pallet.id}-${itemIdx}`} className="mr-rise mr-rise-2" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}>
          <CodeCard
            label="Artikel-Code"
            value={item.code}
            onCopy={() => copyCode(item.code)}
            copied={copiedCode != null && copiedCode === item.code}
          />
          <CodeCard
            label="Use-Item"
            value={item.useItem}
            onCopy={() => copyUseItem(item.useItem)}
            copied={flashUse != null && flashUse === item.useItem}
            accent
          />
        </div>
      </main>

      <ActionBar
        pallet={pallet}
        itemIdx={itemIdx}
        totalInPallet={pallet.items.length}
        overallPos={overallPos}
        totalArticles={totalArticles}
        onPrev={goPrevItem}
        onNext={goNextItem}
        onFertig={handleFertig}
        canPrev={!(palletIdx === 0 && itemIdx === 0)}
      />

      <WiederholtOverlay
        hit={wiederholt}
        onDismiss={() => {
          setWiederholt(null);
          if (completedCount >= totalArticles) {
            setTimeout(() => goToStep('abschluss'), 100);
          }
        }}
      />
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function PalletFlow({ pallets, currentIdx }) {
  return (
    <div style={{
      position: 'sticky',
      top: 55,                  // 52 (SlimTop body) + 3 (progress strip)
      zIndex: 9,
      background: T.bg.surface,
      borderBottom: `1px solid ${T.border.primary}`,
      padding: '10px 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}>
      {pallets.map((p, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
        return (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {i > 0 && (
              <span style={{
                width: 12,
                height: 1,
                background: state === 'todo' ? T.border.primary : T.status.success.main,
              }} />
            )}
            <PalletPill palletId={p.id} state={state} />
          </span>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ITEM FLOW — sticky strip listing every article of the current pallet.
   Green = the operator clicked "kopieren" on the Artikel-Code.
   Red   = code not copied yet (default state for every item).
   Completion via "Artikel abschließen" alone does NOT turn it green —
   only the explicit copy action does. Click a chip to jump to it. */
function ItemFlow({ items, palletIdx, currentIdx, copiedKeys, onPick }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{
      position: 'sticky',
      top: 99,                  /* SlimTop (55) + PalletFlow row (~44) */
      zIndex: 8,
      background: T.bg.surface,
      borderBottom: `1px solid ${T.border.primary}`,
      padding: '8px 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 11,
        color: T.text.subtle,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginRight: 4,
      }}>
        Artikel
      </span>
      {items.map((it, i) => {
        const isCopied = copiedKeys?.has?.(`${palletIdx}|${i}`);
        const isActive = i === currentIdx;
        return (
          <ItemChip
            key={i}
            idx={i + 1}
            isActive={isActive}
            isDone={isCopied}
            onClick={() => onPick(i)}
            title={
              `${it.title || it.fnsku || it.sku || ''}\n` +
              `${isCopied ? '✓ Code kopiert' : '✗ noch nicht kopiert'}` +
              `${isActive ? ' · aktiv' : ''}`
            }
          />
        );
      })}
    </div>
  );
}

function ItemChip({ idx, isActive, isDone, onClick, title }) {
  const c = isDone
    ? { bg: T.status.success.bg,  border: T.status.success.border, text: T.status.success.text }
    : { bg: T.status.danger.bg,   border: T.status.danger.border,  text: T.status.danger.text  };
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        minWidth: 30,
        height: 26,
        padding: '0 8px',
        background: c.bg,
        border: `${isActive ? 2 : 1}px solid ${isActive ? T.accent.main : c.border}`,
        borderRadius: T.radius.sm,
        color: c.text,
        fontFamily: T.font.mono,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontVariantNumeric: 'tabular-nums',
        transition: 'transform 120ms, box-shadow 120ms',
        transform: isActive ? 'translateY(-1px)' : 'none',
        boxShadow: isActive ? `0 2px 8px ${T.accent.main}40` : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {idx}
    </button>
  );
}

function PalletPill({ palletId, state }) {
  const styles = {
    done:    { bg: T.status.success.bg, border: T.status.success.border, color: T.status.success.text },
    current: { bg: T.accent.bg,         border: T.accent.main,           color: T.accent.text },
    todo:    { bg: T.bg.surface2,       border: T.border.primary,        color: T.text.faint },
  }[state];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: T.radius.full,
      background: styles.bg,
      border: `1px solid ${styles.border}`,
      color: styles.color,
      fontFamily: T.font.mono,
      fontSize: 12,
      fontWeight: state === 'current' ? 600 : 500,
      letterSpacing: '-0.005em',
    }}>
      {state === 'done' && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {state === 'current' && (
        <span className="mr-pulse" style={{
          width: 6, height: 6, borderRadius: '50%',
          background: T.accent.main,
        }} />
      )}
      {palletId}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function SlimTop({ overallPct, overallPos, totalArticles, onExit }) {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.border.primary}`,
    }}>
      {/* Progress strip — 3px hairline */}
      <div style={{ height: 3, background: T.bg.surface3 }}>
        <div style={{
          width: `${overallPct * 100}%`,
          height: '100%',
          background: T.accent.main,
          transition: 'width 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }} />
      </div>

      <div style={{
        height: 52,
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 13, color: T.text.subtle, fontWeight: 500 }}>Workspace</span>
        <Sep />
        <span style={{ fontSize: 13, color: T.text.subtle, fontWeight: 500 }}>Workflow</span>
        <Sep />
        <span style={{ fontSize: 13, color: T.text.primary, fontWeight: 500 }}>Focus-Modus</span>

        <span style={{ flex: 1 }} />

        <span style={{ fontSize: 12.5, color: T.text.subtle, fontVariantNumeric: 'tabular-nums' }}>
          Auftrag <span style={{ color: T.text.primary, fontWeight: 500 }}>{overallPos}</span>
          <span style={{ color: T.text.faint }}> / {totalArticles}</span>
        </span>

        <Button variant="ghost" size="sm" onClick={onExit} title="Focus-Modus verlassen (Esc)">
          Verlassen
          <Kbd>Esc</Kbd>
        </Button>
      </div>
    </div>
  );
}

function Sep() {
  return <span style={{ color: T.border.strong, fontSize: 12 }}>/</span>;
}

/* ════════════════════════════════════════════════════════════════════════ */
function ChipMono({ children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: T.radius.md,
      background: T.bg.surface3,
      color: T.text.secondary,
      fontFamily: T.font.mono,
      fontSize: 12,
      letterSpacing: '0.01em',
    }}>
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function CodeCard({ label, value, onCopy, copied, accent }) {
  const borderColor = copied ? T.status.success.border
    : accent ? T.accent.border
    : T.border.primary;
  const bgColor = copied ? T.status.success.bg
    : accent ? T.accent.bg
    : T.bg.surface;
  const valueColor = copied ? T.status.success.text
    : accent ? T.accent.text
    : T.text.primary;

  return (
    <button
      onClick={onCopy}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '18px 20px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: T.radius.lg,
        boxShadow: T.shadow.card,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 200ms, border-color 200ms, box-shadow 200ms',
        fontFamily: T.font.ui,
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.borderColor = T.accent.main;
          e.currentTarget.style.boxShadow = T.shadow.raised;
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.borderColor = accent ? T.accent.border : T.border.primary;
          e.currentTarget.style.boxShadow = T.shadow.card;
        }
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        marginBottom: 10,
        gap: 8,
      }}>
        <span style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: copied ? T.status.success.text : T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {label}
        </span>
        <span style={{ flex: 1 }} />
        {copied ? (
          <Badge tone="success">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Kopiert
            </span>
          </Badge>
        ) : (
          <span style={{ fontSize: 11.5, color: T.text.faint }}>
            Klick zum Kopieren
          </span>
        )}
      </div>

      <div style={{
        fontFamily: T.font.mono,
        fontSize: 24,
        fontWeight: 500,
        color: valueColor,
        letterSpacing: '-0.01em',
        wordBreak: 'break-word',
        lineHeight: 1.15,
      }}>
        {value || '—'}
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function ActionBar({ pallet, itemIdx, totalInPallet, overallPos, totalArticles, onPrev, onNext, onFertig, canPrev }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      padding: '14px 32px',
      background: 'rgba(255, 255, 255, 0.92)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: `1px solid ${T.border.primary}`,
      display: 'flex',
      marginLeft: 'var(--sidebar-width)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        maxWidth: 880,
        margin: '0 auto',
        width: '100%',
      }}>
        <Button variant="ghost" size="sm" onClick={onPrev} disabled={!canPrev} title="Vorheriger Artikel (←)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L4 7l5-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Zurück
        </Button>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          lineHeight: 1.2,
          minWidth: 180,
          marginLeft: 8,
        }}>
          <span style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: T.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            Position
          </span>
          <span style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: T.text.primary,
            marginTop: 2,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {pallet.id} · Artikel {itemIdx + 1} / {totalInPallet}
          </span>
        </div>

        <span style={{ flex: 1 }} />

        <span style={{
          fontSize: 12.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {overallPos} / {totalArticles} insgesamt
        </span>

        <Button variant="primary" onClick={onFertig} title="Artikel abschließen (Space oder Enter)">
          Artikel abschließen
          <Kbd onPrimary>Space</Kbd>
        </Button>

        <Button variant="ghost" size="sm" onClick={onNext} title="Nächster Artikel (→)">
          Weiter
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function WiederholtOverlay({ hit, onDismiss }) {
  if (!hit) return null;
  return (
    <div onClick={onDismiss} style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 24, 39, 0.45)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      cursor: 'pointer',
    }} className="mr-rise">
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
          width: '100%',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.lg,
          boxShadow: T.shadow.modal,
          padding: '32px 36px',
          cursor: 'default',
        }}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20,
        }}>
          <span style={{
            width: 36, height: 36,
            borderRadius: '50%',
            background: T.status.warn.bg,
            color: T.status.warn.main,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${T.status.warn.border}`,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <Badge tone="warn">Wiederholung erkannt</Badge>
        </div>

        <h2 style={{
          fontSize: 22,
          fontWeight: 600,
          color: T.text.primary,
          letterSpacing: '-0.015em',
          margin: 0,
        }}>
          Dieser Artikel kommt erneut vor
        </h2>
        <p style={{
          marginTop: 8,
          fontSize: 14,
          lineHeight: 1.55,
          color: T.text.muted,
        }}>
          Auf der nächsten Palette taucht derselbe Artikel mit einer größeren Stückzahl auf.
        </p>

        <div style={{
          marginTop: 24,
          padding: '18px 20px',
          background: T.bg.surface2,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.md,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr auto 1fr',
          gap: 16,
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11.5, color: T.text.subtle, fontWeight: 500, marginBottom: 4 }}>
              Code
            </div>
            <div style={{
              fontFamily: T.font.mono,
              fontSize: 16,
              fontWeight: 500,
              color: T.text.primary,
              letterSpacing: '-0.01em',
            }}>
              {hit.code}
            </div>
          </div>
          <span style={{ width: 1, height: 36, background: T.border.primary }} />
          <div>
            <div style={{ fontSize: 11.5, color: T.text.subtle, fontWeight: 500, marginBottom: 4 }}>
              Nächste Palette
            </div>
            <div style={{
              fontFamily: T.font.mono,
              fontSize: 16,
              fontWeight: 500,
              color: T.text.primary,
            }}>
              {hit.palletId}
            </div>
          </div>
          <span style={{ width: 1, height: 36, background: T.border.primary }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11.5, color: T.text.subtle, fontWeight: 500, marginBottom: 4 }}>
              Menge dort
            </div>
            <div style={{
              fontSize: 22,
              fontWeight: 600,
              color: T.status.warn.main,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>
              {hit.units}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
        }}>
          <span style={{
            fontSize: 12,
            color: T.text.subtle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Kbd>Esc</Kbd> oder <Kbd>↵</Kbd> zum Schließen
          </span>
          <Button variant="primary" onClick={onDismiss}>
            Verstanden
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function Kbd({ children, onPrimary }) {
  return (
    <kbd style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 22,
      height: 20,
      padding: '0 6px',
      background: onPrimary ? 'rgba(255,255,255,0.18)' : T.bg.surface3,
      border: onPrimary ? '1px solid rgba(255,255,255,0.3)' : `1px solid ${T.border.primary}`,
      borderRadius: T.radius.sm,
      fontFamily: T.font.mono,
      fontSize: 11,
      fontWeight: 500,
      color: onPrimary ? '#fff' : T.text.secondary,
      lineHeight: 1,
    }}>
      {children}
    </kbd>
  );
}

/* ─── Clipboard with legacy fallback (für iframe / non-secure contexts) ─── */
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    /* ignore */
  }
}
