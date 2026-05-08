// @ts-nocheck — incremental TS migration: file renamed, strict typing pending
/* ─────────────────────────────────────────────────────────────────────────
   WIEDERHOLT — repeat detection (full-screen overlay trigger).

   SHOW    if useItem code appears on the NEXT pallet AND that occurrence
           has quantity ≥ 30
   DON'T   if next article (in flow) is the same code (continuous)
   DON'T   if not in next pallet but appears later (only across one pallet)
   ───────────────────────────────────────────────────────────────────────── */

const QTY_THRESHOLD = 30;

export function detectWiederholt(pallets, palletIdx, itemIdx) {
  const pallet = pallets?.[palletIdx];
  if (!pallet) return null;
  const item = pallet.items?.[itemIdx];
  if (!item) return null;
  const code = item.useItem || item.fnsku;
  if (!code) return null;

  // Suppression: next article in flow has same code
  const nextInPallet = pallet.items?.[itemIdx + 1];
  if (nextInPallet) {
    if ((nextInPallet.useItem || nextInPallet.fnsku) === code) return null;
  } else {
    const firstNext = pallets?.[palletIdx + 1]?.items?.[0];
    if (firstNext && (firstNext.useItem || firstNext.fnsku) === code) return null;
  }

  // Look at NEXT pallet for hit with qty > 30
  const np = pallets?.[palletIdx + 1];
  if (!np) return null;
  const hit = np.items.find((it) => {
    const c = it.useItem || it.fnsku;
    return c === code && (it.units || 0) >= QTY_THRESHOLD;
  });
  if (!hit) return null;

  return {
    code,
    units: hit.units,
    palletId: np.id,
    name: hit.title,
  };
}