/* Front-end-side projection of the API DTOs. The legacy `useAppState`
 * contract was designed before the backend existed (everything lived
 * in localStorage) — it uses unix-ms timestamps, a `ready|error`
 * status, and flattens out a few nested fields. Adapters in state.tsx
 * map the API shapes (AuftragDetail / AuftragSummary) into these. */

import type {
  CompletedKeys,
  Parsed,
  PalletTimings,
  UUID,
  Validation,
  WorkflowStep,
} from './api';

export type LegacyStatus = 'ready' | 'error';

export interface LegacyAuftrag {
  id: UUID;
  fileName: string;
  fbaCode: string | null;
  addedAt: number;
  rawText: string | null | undefined;
  parsed: Parsed | null | undefined;
  validation: Validation | null | undefined;
  status: LegacyStatus;
  error: string | null | undefined;
  palletCount: number;
  articleCount: number;
  unitsCount: number;
  eskuCount: number;

  startedAt: number | undefined;
  finishedAt: number | undefined;
  durationSec: number | null | undefined;
  step: WorkflowStep | null | undefined;
  currentPalletIdx: number;
  currentItemIdx: number;
  completedKeys: CompletedKeys;
  copiedKeys: Record<string, number>;
  palletTimings: PalletTimings;

  assignedToUserId: UUID | null | undefined;
  assignedToUserName: string | null | undefined;
}

export interface LegacyHistoryItem {
  id: UUID;
  fileName: string;
  fbaCode: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  durationSec: number | null;
  palletCount: number;
  articleCount: number;
  palletTimings: PalletTimings;
  assignedToUserName: string | null | undefined;
}

export interface UseAppStateApi {
  queue: LegacyAuftrag[];
  current: LegacyAuftrag | null;
  history: LegacyHistoryItem[];

  addFiles: (fileList: FileList | File[] | null) => Promise<LegacyAuftrag[]>;
  removeFromQueue: (id: UUID) => void;
  reorderQueue: (fromIdx: number, toIdx: number) => void;
  reorderQueueTo: (orderedIds: UUID[]) => void;
  clearQueue: () => void;

  startEntry: (entryId?: UUID) => void;
  goToStep: (step: WorkflowStep) => void;

  setCurrentPalletIdx: (idx: number) => void;
  setCurrentItemIdx: (idx: number) => void;
  markCodeCopied: (palletIdx: number, itemIdx: number) => void;

  completeCurrentItem: (effectiveItemsCount?: number, effectiveItem?: unknown) => boolean;
  completeAndAdvance: () => void;
  cancelCurrent: () => void;

  removeHistoryEntry: (id: UUID) => void;
  clearHistory: () => void;
}
