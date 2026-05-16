/* CancelAuftragModal — "Auftrag stornieren" dialog launched from Focus.
   The worker can optionally flag one or more articles plus a per-article
   reason, then confirm. On confirm the active Auftrag flips to status
   `cancelled` and lands in Historie with a red border. */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { T, Button } from './ui';
import type { ParsedItem, ParsedPallet, WorkflowAbortPayload } from '../types/api';

interface CancelAuftragModalProps {
  open: boolean;
  fbaCode?: string | null;
  pallets: ParsedPallet[];
  eskuItems?: ParsedItem[];
  onClose: () => void;
  onConfirm: (payload: WorkflowAbortPayload) => void;
}

interface FlatItem {
  key: string;            // unique row key
  palletId: string | null;
  palletLabel: string;
  itemIdx: number | null; // index inside parsed.pallets[].items, null for ESKU
  title: string;
  code: string;           // fnsku || sku || ean || '—'
  units: number;
}

function itemCode(it: ParsedItem): string {
  return it.fnsku || it.sku || it.ean || '—';
}

function itemTitle(it: ParsedItem): string {
  const t = (it.title || '').trim();
  return t || itemCode(it);
}

export default function CancelAuftragModal({
  open, fbaCode, pallets, eskuItems = [], onClose, onConfirm,
}: CancelAuftragModalProps) {
  /* selection state: rowKey → reason string. Absence = unchecked. */
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  /* Reset on close so reopening starts clean. */
  useEffect(() => {
    if (!open) {
      setSelected({});
      setNote('');
    }
  }, [open]);

  /* Esc closes. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: FlatItem[] }> = [];
    pallets.forEach((p, pi) => {
      const label = `P${pi + 1} · ${p.id}`;
      const items: FlatItem[] = (p.items || []).map((it, ii) => ({
        key: `${p.id}|${ii}`,
        palletId: p.id,
        palletLabel: label,
        itemIdx: ii,
        title: itemTitle(it),
        code: itemCode(it),
        units: Number(it.units) || 0,
      }));
      if (items.length) out.push({ label, items });
    });
    if (eskuItems.length) {
      const items: FlatItem[] = eskuItems.map((it, ii) => ({
        key: `esku|${itemCode(it)}|${ii}`,
        palletId: null,
        palletLabel: 'Einzelne SKU',
        itemIdx: null,
        title: itemTitle(it),
        code: itemCode(it),
        units: Number(it.units) || 0,
      }));
      out.push({ label: 'Einzelne SKU', items });
    }
    return out;
  }, [pallets, eskuItems]);

  if (!open) return null;

  const flagged = Object.keys(selected).length;
  const toggle = (row: FlatItem) => {
    setSelected((s) => {
      const next = { ...s };
      if (row.key in next) delete next[row.key];
      else next[row.key] = '';
      return next;
    });
  };
  const setReason = (key: string, val: string) =>
    setSelected((s) => (key in s ? { ...s, [key]: val } : s));

  const handleConfirm = () => {
    const allRows = groups.flatMap((g) => g.items);
    const items = allRows
      .filter((r) => r.key in selected)
      .map((r) => ({
        palletId: r.palletId,
        itemIdx: r.itemIdx,
        code: r.code,
        title: r.title,
        reason: (selected[r.key] || '').trim() || null,
      }));
    const payload: WorkflowAbortPayload = {
      items,
      note: note.trim() || null,
    };
    onConfirm(payload);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(17, 24, 39, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 'min(10vh, 80px)',
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(92vw, 720px)',
          maxHeight: 'min(86vh, 820px)',
          display: 'flex',
          flexDirection: 'column',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 14,
          boxShadow: T.shadow.modal,
          fontFamily: T.font.ui,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${T.border.primary}`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          background: T.status.danger.bg,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: T.status.danger.text,
              marginBottom: 4,
            }}>
              Auftrag stornieren
            </div>
            <div style={{
              fontFamily: T.font.mono,
              fontSize: 15,
              fontWeight: 500,
              color: T.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {fbaCode || '—'}
            </div>
            <div style={{ fontSize: 12.5, color: T.text.subtle, marginTop: 6 }}>
              Wähle die problematischen Artikel aus und füge optional einen Grund hinzu.
              Der Auftrag wird in der Historie als <em>storniert</em> archiviert.
            </div>
          </div>
        </div>

        {/* Body — scroll area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 22px 4px',
        }}>
          {groups.length === 0 && (
            <div style={{
              padding: '24px 14px',
              textAlign: 'center',
              fontSize: 13,
              color: T.text.faint,
            }}>
              Keine Artikel gefunden.
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: T.text.faint,
                fontFamily: T.font.mono,
                marginBottom: 6,
                marginTop: 4,
              }}>
                {g.label}
              </div>
              <div style={{
                border: `1px solid ${T.border.primary}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}>
                {g.items.map((row, i) => {
                  const checked = row.key in selected;
                  return (
                    <div
                      key={row.key}
                      style={{
                        borderBottom: i < g.items.length - 1 ? `1px solid ${T.border.subtle}` : 'none',
                        background: checked ? T.status.danger.bg : 'transparent',
                        transition: 'background 120ms',
                      }}
                    >
                      <label style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(row)}
                          style={{ width: 16, height: 16, accentColor: T.status.danger.main, cursor: 'pointer' }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{
                            display: 'block',
                            fontSize: 13.5,
                            fontWeight: 500,
                            color: T.text.primary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {row.title}
                          </span>
                          <span style={{
                            display: 'block',
                            fontSize: 11.5,
                            fontFamily: T.font.mono,
                            color: T.text.subtle,
                            marginTop: 2,
                          }}>
                            {row.code}
                          </span>
                        </span>
                        <span style={{
                          fontSize: 12.5,
                          fontFamily: T.font.mono,
                          color: T.text.subtle,
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                        }}>
                          {row.units > 0 ? `${row.units} EH` : ''}
                        </span>
                      </label>
                      {checked && (
                        <div style={{ padding: '0 14px 12px 42px' }}>
                          <textarea
                            value={selected[row.key]}
                            onChange={(e) => setReason(row.key, e.target.value)}
                            placeholder="Grund (optional)…"
                            rows={2}
                            style={textareaStyle}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Global note */}
          <div style={{ marginTop: 14, marginBottom: 4 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: T.text.faint,
              fontFamily: T.font.mono,
              marginBottom: 6,
            }}>
              Notiz · optional
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Allgemeine Notiz zur Stornierung…"
              rows={3}
              style={{ ...textareaStyle, minHeight: 60 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: `1px solid ${T.border.primary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: T.bg.surface2,
        }}>
          <div style={{ fontSize: 12.5, color: T.text.subtle }}>
            {flagged > 0
              ? `${flagged} Artikel markiert`
              : 'Keine Artikel markiert'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              style={{
                background: T.status.danger.main,
                color: '#fff',
                boxShadow: 'none',
              }}
            >
              Stornieren
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const textareaStyle: CSSProperties = {
  width: '100%',
  resize: 'vertical',
  border: `1px solid ${T.border.primary}`,
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: T.font.ui,
  color: T.text.primary,
  background: T.bg.surface,
  outline: 'none',
};
