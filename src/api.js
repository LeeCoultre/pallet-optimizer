/* API client for FastAPI backend.
 *
 * Deployment:
 *   - Dev: BASE defaults to http://localhost:8000
 *   - Prod (Railway, single service): build with VITE_API_URL="" so requests
 *     go to the same origin and hit the FastAPI backend serving /api/*
 *   - Split deploy: build with VITE_API_URL=https://your-backend.example.com
 *
 * `??` (not `||`) so an explicitly empty string is respected.
 */

const envUrl =
  typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined;
const BASE = envUrl ?? 'http://localhost:8000';

function snakeToCamel(obj) {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        snakeToCamel(v),
      ])
    );
  }
  return obj;
}

export async function packPalletAPI(boxes, quantities, palletConfig = {}, options = {}) {
  // Collect forced grids from box definitions (e.g. T20-80×80 always 7×2)
  const forcedGrids = {};
  for (const b of boxes) {
    if ((quantities[b.id] || 0) > 0 && b.forcedGrid) {
      forcedGrids[b.id] = {
        cols: b.forcedGrid.cols,
        rows: b.forcedGrid.rows,
        box_l: b.forcedGrid.boxL,
        box_w: b.forcedGrid.boxW,
      };
    }
  }

  const payload = {
    boxes: boxes
      .filter((b) => (quantities[b.id] || 0) > 0)
      .map((b) => ({
        id: b.id,
        name: b.name,
        length: b.length,
        width: b.width,
        height: b.height,
        quantity: quantities[b.id] || 0,
        color: b.color,
        allowed_orientations: b.allowedOrientations || ['flat', 'stand'],
      })),
    pallet: {
      length: palletConfig.length ?? 120,
      width: palletConfig.width ?? 80,
      pallet_height: palletConfig.palletHeight ?? 14.4,
      max_total_height: palletConfig.maxTotalHeight ?? 180,
    },
    options: {
      // 5% default matches the local JS packer (DEFAULT_OVERHANG = 0.05).
      // Needed for T20-57×40 in 14×4 grid (4 × 20.5 = 82cm > 80cm pallet).
      overhang_pct: options.overhangPct ?? 0.05,
      max_kontovka_columns: options.maxKontovkaColumns ?? 3,
      zones: (options.zones || []).map((z) => ({
        id: z.id,
        rect: z.rect,
        box_ids: z.boxIds,
      })),
      preferred_mode: options.preferredMode ?? 'auto',
      cpsat_time_limit_s: options.cpsatTimeLimitS ?? 30,
      ...(Object.keys(forcedGrids).length > 0 && { forced_grids: forcedGrids }),
      ...(options.fixedObstacles && options.fixedObstacles.length > 0 && {
        fixed_obstacles: options.fixedObstacles,
      }),
    },
  };

  const res = await fetch(`${BASE}/api/pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }

  const data = await res.json();
  return snakeToCamel(data);
}

export async function importXlsxAPI(file) {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch(`${BASE}/api/import-xlsx`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Import error ${res.status}`);
  }

  return snakeToCamel(await res.json());
}

export async function checkBackend() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function singleLayerAPI(box, palletConfig = {}, currentZ = 0, options = {}) {
  const payload = {
    box: {
      id: box.id,
      name: box.name,
      length: box.length,
      width: box.width,
      height: box.height,
      allowed_orientations: box.allowedOrientations || ['flat', 'stand'],
    },
    pallet: {
      length: palletConfig.length ?? 120,
      width: palletConfig.width ?? 80,
      pallet_height: palletConfig.palletHeight ?? 14.4,
      max_total_height: palletConfig.maxTotalHeight ?? 180,
    },
    current_z: currentZ,
    max_kontovka: options.maxKontovka ?? 3,
    overhang_pct: options.overhangPct ?? 0.05,
  };

  const res = await fetch(`${BASE}/api/single-layer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Single-layer API error ${res.status}`);
  }

  return snakeToCamel(await res.json());
}
