/* Fetch wrapper for the Marathon FastAPI backend.
 *
 * VITE_API_URL semantics (matches src/api.js):
 *   - Empty string  → same-origin (single-service Railway deploy)
 *   - http://...    → split deploy / local dev (e.g. http://127.0.0.1:8001)
 *
 * Auth: auto-injects `Authorization: Bearer <jwt>` from the active
 * Clerk session via `window.Clerk.session.getToken()`. Open endpoints
 * (e.g. /api/users) work without a session.
 *
 * Auto-converts top-level keys snake_case ↔ camelCase, but stops at
 * OPAQUE keys whose values are application-defined JSONB blobs
 * (parsed, validation, etc.) — their inner keys must be preserved as-is. */

const envUrl =
  typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined;
const BASE = envUrl ?? '';

/* Keys whose values are passed through unchanged.
   Inside `parsed`/`validation` the structure is owned by the parser, not the API. */
const OPAQUE = new Set([
  'parsed', 'validation',
  'completed_keys', 'completedKeys',
  'pallet_timings', 'palletTimings',
  'meta',
]);

function snakeKeyToCamel(k) {
  return k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelKeyToSnake(k) {
  return k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function convertKeys(obj, transform) {
  if (Array.isArray(obj)) return obj.map((x) => convertKeys(x, transform));
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const newKey = transform(k);
      out[newKey] = OPAQUE.has(k) ? v : convertKeys(v, transform);
    }
    return out;
  }
  return obj;
}

const snakeToCamel = (o) => convertKeys(o, snakeKeyToCamel);
const camelToSnake = (o) => convertKeys(o, camelKeyToSnake);

export class ApiError extends Error {
  constructor(status, detail) {
    const msg = typeof detail === 'string'
      ? detail
      : (detail?.[0]?.msg ?? `HTTP ${status}`);
    super(msg);
    this.status = status;
    this.detail = detail;
  }
}

async function getAuthToken() {
  // window.Clerk is loaded by ClerkProvider; session is null when signed out.
  const session = typeof window !== 'undefined' ? window.Clerk?.session : null;
  if (!session) return null;
  try {
    return await session.getToken();
  } catch {
    return null;
  }
}

async function call(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = await getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(camelToSnake(body)) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data);
  return snakeToCamel(data);
}

/* ─── Users ──────────────────────────────────────────── */
export const listUsers = ()    => call('GET', '/api/users');
export const getMe     = ()    => call('GET', '/api/me');

/* ─── Auftraege ─────────────────────────────────────── */
export const listAuftraege = ()        => call('GET', '/api/auftraege');
export const createAuftrag = (payload) => call('POST', '/api/auftraege', payload);
export const getAuftrag    = (id)      => call('GET',  `/api/auftraege/${id}`);
export const deleteAuftrag = (id)      => call('DELETE', `/api/auftraege/${id}`);
export const reorderQueue  = (items)   => call('PATCH', '/api/auftraege/reorder', items);

export const startAuftrag    = (id)    => call('POST',  `/api/auftraege/${id}/start`);
export const updateProgress  = (id, p) => call('PATCH', `/api/auftraege/${id}/progress`, p);
export const completeAuftrag = (id)    => call('POST',  `/api/auftraege/${id}/complete`);
export const cancelAuftrag   = (id)    => call('POST',  `/api/auftraege/${id}/cancel`);

/* ─── History ───────────────────────────────────────── */
export const getHistory = (limit = 50, offset = 0) =>
  call('GET', `/api/history?limit=${limit}&offset=${offset}`);

export const deleteHistoryEntry = (id) =>
  call('DELETE', `/api/history/${id}`);

/* ─── Admin (require role=admin on backend) ───────── */
function qs(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const adminListAuftraege = (params = {}) =>
  call('GET', `/api/admin/auftraege${qs(params)}`);

export const adminListUsers = () =>
  call('GET', '/api/admin/users');

export const adminChangeUserRole = (userId, role) =>
  call('PATCH', `/api/admin/users/${userId}/role`, { role });

export const adminListAudit = (params = {}) =>
  call('GET', `/api/admin/audit${qs(params)}`);

export const adminGetStats = () =>
  call('GET', '/api/admin/stats');
