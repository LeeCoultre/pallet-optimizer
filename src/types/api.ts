/* Wire-format types for the Marathon FastAPI backend.
 *
 * Mirrors backend/schemas.py — but in camelCase, since marathonApi.ts
 * auto-converts top-level keys snake↔camel on the way in/out. The
 * OPAQUE fields (parsed, validation, completedKeys, palletTimings,
 * meta) are passed through unchanged: their inner keys stay as the
 * parser/backend wrote them. */

export type UUID = string;
export type ISODateString = string;

/* ─── Enums ──────────────────────────────────────────── */

export type UserRole = 'admin' | 'user';
export type AuftragStatus = 'queued' | 'in_progress' | 'completed' | 'error';
export type WorkflowStep = 'upload' | 'pruefen' | 'focus' | 'abschluss';

/* ─── Parser shapes (OPAQUE — owned by parseLagerauftrag.js) ── */

export type ParsedFormat = 'standard' | 'schilder' | 'unknown';

export interface ParsedItem {
  sku: string;
  title: string;
  asin: string;
  fnsku: string;
  ean: string | null;
  upc: string | null;
  condition: string;
  prep: string;
  prepType: string | null;
  labeler: string;
  units: number;
  useItem: string | null;
  dimStr: string | null;
  rollen: string | null;
  dim: { l: number; b: number; h: number } | null;
  isThermo: boolean;
  isVeit: boolean;
  isHeipa: boolean;
  isTacho: boolean;
  isProduktion: boolean;
  category: string | null;
  codeType: string | null;
  level?: number;
  hasFourSideWarning?: boolean;
  [extra: string]: unknown;
}

export interface ParsedPallet {
  id: string;
  items: ParsedItem[];
  hasFourSideWarning?: boolean;
  [extra: string]: unknown;
}

export interface ParsedMeta {
  sendungsnummer?: string;
  fbaCode?: string;
  [extra: string]: unknown;
}

export interface Parsed {
  format: ParsedFormat | string;
  meta: ParsedMeta;
  pallets: ParsedPallet[];
  einzelneSkuItems?: ParsedItem[];
  [extra: string]: unknown;
}

/* The parser's validation report — shape owned by validateParsing in
 * parseLagerauftrag.js. `any` here because the producer is JS-typed
 * and consumers depend on dynamic field access. */
export type Validation = any;

/* `${palletIdx}|${itemIdx}|${key}` → unix-ms timestamp | true */
export type CompletedKeys = Record<string, number | true>;

/* Per-pallet timing window. Keyed by pallet.id. */
export interface PalletTiming {
  startedAt: number;
  finishedAt?: number;
}
export type PalletTimings = Record<string, PalletTiming>;

/* ─── Users ──────────────────────────────────────────── */

export interface UserResponse {
  id: UUID;
  email: string;
  name: string;
  role: UserRole;
}

export interface UserListItem {
  id: UUID;
  name: string;
}

/* ─── Auftraege ────────────────────────────────────── */

export interface AuftragSummary {
  id: UUID;
  fileName: string;
  fbaCode: string | null;
  status: AuftragStatus;
  palletCount: number;
  articleCount: number;
  errorMessage: string | null;
  createdAt: ISODateString;
  queuePosition: number | null;
  assignedToUserId: UUID | null;
  assignedToUserName: string | null;
  startedAt: ISODateString | null;
  finishedAt: ISODateString | null;
  durationSec: number | null;
  palletTimings: PalletTimings;
}

export interface AuftragDetail extends AuftragSummary {
  rawText: string | null;
  parsed: Parsed | null;
  validation: Validation | null;
  step: WorkflowStep | null;
  currentPalletIdx: number | null;
  currentItemIdx: number | null;
  completedKeys: CompletedKeys;
}

export interface AuftragCreatePayload {
  fileName: string;
  rawText?: string | null;
  /* Parsed/Validation are loose at the API boundary because the
     parseLagerauftrag.js producer is JS-typed (all-any). The receiving
     end (Parsed in api.ts) has the structured shape consumers rely on. */
  parsed?: unknown;
  validation?: unknown;
  errorMessage?: string | null;
}

export interface WorkflowProgressPatch {
  step?: WorkflowStep;
  currentPalletIdx?: number;
  currentItemIdx?: number;
  completedKeys?: CompletedKeys;
  palletTimings?: PalletTimings;
}

export interface AuftragReorderItem {
  id: UUID;
  queuePosition: number;
}

/* ─── History ──────────────────────────────────────── */

export interface HistoryPage {
  items: AuftragSummary[];
  total: number;
  limit: number;
  offset: number;
}

/* ─── Admin ────────────────────────────────────────── */

export interface AdminUserDetail {
  id: UUID;
  clerkId: string | null;
  email: string;
  name: string;
  role: UserRole;
  createdAt: ISODateString;
  lastLoginAt: ISODateString | null;
  auftraegeCompleted: number;
}

export interface AuditLogEntry {
  id: UUID;
  action: string;
  createdAt: ISODateString;
  userId: UUID;
  userName: string | null;
  auftragId: UUID | null;
  auftragFileName: string | null;
  meta: Record<string, unknown>;
}

export interface AdminTopUser {
  user_id: UUID;
  user_name: string;
  count: number;
}

export interface AdminPerDay {
  date: string;
  count: number;
}

export interface AdminStats {
  totalAuftraege: number;
  queuedNow: number;
  inProgressNow: number;
  completedTotal: number;
  completedToday: number;
  completedThisWeek: number;
  avgDurationSec: number | null;
  topUsers: AdminTopUser[];
  completedPerDay: AdminPerDay[];
}

export interface AdminAuftraegeQuery {
  status?: AuftragStatus | '';
  assignedTo?: UUID | '';
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface AdminAuftraegePage {
  items: AuftragSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminAuditQuery {
  action?: string;
  user_id?: UUID;
  limit?: number;
  offset?: number;
}

export interface AdminAuditPage {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

/* ─── SKU Dimensions ─────────────────────────────────── */

export interface SkuDimensionRead {
  id: number;
  fnskus: string[];
  skus: string[];
  eans: string[];
  title: string | null;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  palletLoadMax: number | null;
  source: string | null;
  updatedAt: ISODateString;
  updatedBy: string | null;
}

export interface SkuDimensionLookup {
  id: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  palletLoadMax: number | null;
  source: string | null;
}

export interface SkuDimensionLookupResponse {
  lookups: Record<string, SkuDimensionLookup>;
  missing: string[];
}

export interface SkuDimensionUpsert {
  fnskus?: string[];
  skus?: string[];
  eans?: string[];
  title?: string | null;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  palletLoadMax?: number | null;
}

export interface SkuDimensionImportResult {
  imported: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export interface AdminSkuDimensionsQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AdminSkuDimensionsPage {
  items: SkuDimensionRead[];
  total: number;
  limit: number;
  offset: number;
}

/* ─── Search / Activity ──────────────────────────────── */

export type MatchedField = 'fnsku' | 'sku' | 'ean' | 'sendungsnummer' | 'file_name';

export interface SearchHit {
  id: UUID;
  fileName: string;
  fbaCode: string | null;
  status: AuftragStatus;
  palletCount: number;
  articleCount: number;
  createdAt: ISODateString;
  finishedAt: ISODateString | null;
  durationSec: number | null;
  assignedToUserName: string | null;
  matchedField: MatchedField | null;
  matchedValue: string | null;
}

export interface SearchResults {
  items: SearchHit[];
  total: number;
  limit: number;
  offset: number;
  query: string;
}

export interface SearchQuery {
  q: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface ActiveWorker {
  userId: UUID;
  userName: string;
  auftragId: UUID;
  fileName: string;
  fbaCode: string | null;
  step: WorkflowStep | null;
  startedAt: ISODateString | null;
  currentPalletIdx: number | null;
  palletCount: number;
}

export interface ActivityEvent {
  id: UUID;
  action: string;
  createdAt: ISODateString;
  userId: UUID;
  userName: string | null;
  auftragId: UUID | null;
  auftragFileName: string | null;
  fbaCode: string | null;
  meta: Record<string, unknown>;
}

export interface ActivityFeed {
  activeWorkers: ActiveWorker[];
  events: ActivityEvent[];
  serverTime: ISODateString;
}

export interface ShiftInfo {
  startedAt: ISODateString | null;
  durationSec: number;
  completedToday: number;
}

/* ─── Exports ──────────────────────────────────────── */

export interface XlsxExportResult {
  ok: true;
  rowCount: number;
}

export interface XlsxExportRange {
  from?: string;
  to?: string;
}
