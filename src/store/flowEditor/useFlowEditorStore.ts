import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { JourneyVariable } from '@/components/journey/environment-manager';
import { saveSnapshot, clearSnapshot, type StoredFlowSnapshot } from './idbSnapshot';
import { persistLastSavedAt } from './lastSavedMark';

export type FlowSnapshot = {
  nodes: Node[];
  edges: Edge[];
  variables: JourneyVariable[];
};

export type FlowEditorStatus = 'idle' | 'dirty' | 'saving' | 'error';

export type FlowEditorState = {
  journeyId: string | null;
  status: FlowEditorStatus;
  lastSavedAt: Date | null;
  lastError: string | null;
  /**
   * True when `failSave` armed the 30s auto-retry. The error banner should
   * only promise "Tentando de novo em 30s" when this is true; otherwise no
   * trigger is registered and the promise would be a lie.
   */
  retryScheduled: boolean;
  serverSnapshot: FlowSnapshot | null;
  currentSnapshot: FlowSnapshot | null;
  recoveryCandidate: { snapshot: FlowSnapshot; timestamp: Date } | null;
  /**
   * Monotonic counter that increments every time `acceptRecovery` lands a
   * recovered snapshot. Consumers can use it as a React `key` to force the
   * canvas to remount and re-seed `useNodesState(initialNodes)` — `xyflow`
   * is uncontrolled internally, so updating `currentSnapshot` alone does
   * NOT propagate the recovered nodes to the canvas without a remount.
   */
  recoveryEpoch: number;

  // Lifecycle
  hydrate: (params: {
    journeyId: string;
    server: FlowSnapshot;
    lastSavedAt: Date | null;
    recovery: StoredFlowSnapshot | null;
  }) => void;
  reset: () => void;

  // User edits
  setFlow: (nodes: Node[], edges: Edge[]) => void;
  setVariables: (variables: JourneyVariable[]) => void;

  // Save lifecycle (driven by consumer — store provides transitions only)
  beginSave: () => void;
  /**
   * Mark a save as successfully landed.
   *
   * `syncedSnapshot` is the snapshot value the consumer actually sent to the
   * server (captured at beginSave time). The store compares it against the
   * current snapshot to detect mid-save edits (the atomicity requirement on
   * the EVO-1258 card): if the user edited during the API roundtrip, the
   * current snapshot diverges from what was synced and the store stays
   * `dirty` — the next autosave tick will pick up the unsynced edits.
   */
  commitSave: (savedAt: Date, syncedSnapshot: FlowSnapshot) => void;
  failSave: (message: string) => void;

  // Recovery
  acceptRecovery: () => void;
  rejectRecovery: () => void;
};

const DEFAULT_AUTOSAVE_DELAY_MS = 5000;
const IDB_DEBOUNCE_MS = 500;
const ERROR_RETRY_DELAY_MS = 30_000;

/**
 * Singleton timer / trigger slots.
 *
 * These live in module scope on purpose: the store itself is a Zustand
 * singleton (created via `create<>` at module load) and there is only ever
 * one Journey Flow Editor mounted in the app at a time. Tests rely on
 * `useFlowEditorStore.getState().reset()` in their `beforeEach`/`afterEach`
 * to drop these between cases. If a future feature needs two editors
 * mounted simultaneously (split-screen, preview-in-modal, etc.), these
 * need to move into `set`/`get` state so each store instance owns its own
 * timers — until then, single-instance is the contract.
 */
let autosaveTimerId: ReturnType<typeof setTimeout> | null = null;
let idbWriteTimerId: ReturnType<typeof setTimeout> | null = null;
let errorRetryTimerId: ReturnType<typeof setTimeout> | null = null;
let pendingSaveTrigger: (() => void) | null = null;

function clearAutosaveTimer(): void {
  if (autosaveTimerId !== null) {
    clearTimeout(autosaveTimerId);
    autosaveTimerId = null;
  }
}

function clearIdbWriteTimer(): void {
  if (idbWriteTimerId !== null) {
    clearTimeout(idbWriteTimerId);
    idbWriteTimerId = null;
  }
}

function clearErrorRetryTimer(): void {
  if (errorRetryTimerId !== null) {
    clearTimeout(errorRetryTimerId);
    errorRetryTimerId = null;
  }
}

function scheduleIdbWrite(journeyId: string, snapshot: FlowSnapshot): void {
  clearIdbWriteTimer();
  idbWriteTimerId = setTimeout(() => {
    void saveSnapshot(journeyId, {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      variables: snapshot.variables,
    });
    idbWriteTimerId = null;
  }, IDB_DEBOUNCE_MS);
}

function snapshotsEqual(a: FlowSnapshot | null, b: FlowSnapshot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function armAutosaveTimer(): void {
  clearAutosaveTimer();
  if (pendingSaveTrigger) {
    const trigger = pendingSaveTrigger;
    autosaveTimerId = setTimeout(() => {
      autosaveTimerId = null;
      trigger();
    }, DEFAULT_AUTOSAVE_DELAY_MS);
  }
}

export const useFlowEditorStore = create<FlowEditorState>((set, get) => {
  /**
   * Internal: apply a partial snapshot update with full dirty / autosave /
   * IDB plumbing. Single source of the dirty-state side effects so the two
   * public actions (`setFlow`, `setVariables`) cannot diverge.
   */
  const applyEdit = (patch: Partial<FlowSnapshot>): void => {
    const state = get();
    if (!state.currentSnapshot || !state.journeyId) return;

    const next: FlowSnapshot = {
      ...state.currentSnapshot,
      ...patch,
    };

    if (snapshotsEqual(next, state.currentSnapshot)) return;

    const becameDirty = !snapshotsEqual(next, state.serverSnapshot);

    set({
      currentSnapshot: next,
      status: becameDirty ? 'dirty' : 'idle',
      lastError: null,
      retryScheduled: false,
    });

    if (becameDirty) {
      scheduleIdbWrite(state.journeyId, next);
      clearErrorRetryTimer();
      armAutosaveTimer();
    }
  };

  return {
    journeyId: null,
    status: 'idle',
    lastSavedAt: null,
    lastError: null,
    retryScheduled: false,
    serverSnapshot: null,
    currentSnapshot: null,
    recoveryCandidate: null,
    recoveryEpoch: 0,

    hydrate: ({ journeyId, server, lastSavedAt, recovery }) => {
      clearAutosaveTimer();
      clearIdbWriteTimer();
      clearErrorRetryTimer();

      let recoveryCandidate: FlowEditorState['recoveryCandidate'] = null;
      if (recovery) {
        const recoveryPayload = recovery.payload as unknown as FlowSnapshot;
        const newerThanServer = !lastSavedAt || recovery.timestamp > lastSavedAt.getTime();
        const divergesFromServer = !snapshotsEqual(recoveryPayload, server);
        if (newerThanServer && divergesFromServer) {
          recoveryCandidate = {
            snapshot: recoveryPayload,
            timestamp: new Date(recovery.timestamp),
          };
        }
      }

      set({
        journeyId,
        status: 'idle',
        lastSavedAt,
        lastError: null,
        retryScheduled: false,
        serverSnapshot: server,
        currentSnapshot: server,
        recoveryCandidate,
        recoveryEpoch: 0,
      });
    },

    reset: () => {
      clearAutosaveTimer();
      clearIdbWriteTimer();
      clearErrorRetryTimer();
      pendingSaveTrigger = null;
      set({
        journeyId: null,
        status: 'idle',
        lastSavedAt: null,
        lastError: null,
        retryScheduled: false,
        serverSnapshot: null,
        currentSnapshot: null,
        recoveryCandidate: null,
        recoveryEpoch: 0,
      });
    },

    setFlow: (nodes, edges) => applyEdit({ nodes, edges }),
    setVariables: (variables) => applyEdit({ variables }),

    beginSave: () => {
      clearAutosaveTimer();
      clearErrorRetryTimer();
      set({ status: 'saving', lastError: null, retryScheduled: false });
    },

    commitSave: (savedAt, syncedSnapshot) => {
      const state = get();

      clearAutosaveTimer();
      clearErrorRetryTimer();

      const current = state.currentSnapshot ?? state.serverSnapshot;
      const diverged = current ? !snapshotsEqual(current, syncedSnapshot) : false;

      if (diverged && current && state.journeyId) {
        // User edited mid-save. Honour atomicity: stay dirty so the next
        // autosave picks up the unsynced edits. Keep the IDB snapshot in
        // place (don't clear it) so a tab-close before the next save still
        // recovers the unsynced data.
        set({
          status: 'dirty',
          lastSavedAt: savedAt,
          lastError: null,
          retryScheduled: false,
          serverSnapshot: syncedSnapshot,
        });
        scheduleIdbWrite(state.journeyId, current);
        armAutosaveTimer();
        persistLastSavedAt(state.journeyId, savedAt);
        return;
      }

      clearIdbWriteTimer();
      set({
        status: 'idle',
        lastSavedAt: savedAt,
        lastError: null,
        retryScheduled: false,
        serverSnapshot: syncedSnapshot,
      });

      if (state.journeyId) {
        void clearSnapshot(state.journeyId);
        persistLastSavedAt(state.journeyId, savedAt);
      }
    },

    failSave: (message) => {
      clearErrorRetryTimer();
      const scheduled = pendingSaveTrigger !== null;
      set({ status: 'error', lastError: message, retryScheduled: scheduled });

      // AC#4: schedule a single auto-retry in 30s. The banner text promises
      // it; only honour the promise when a trigger is registered (the
      // retryScheduled flag lets the UI hide the false promise when not).
      // Subsequent failures restart the 30s timer (consecutive failures stay
      // on the cycle). Any manual save / new edit / commit cancels it.
      if (pendingSaveTrigger) {
        errorRetryTimerId = setTimeout(() => {
          errorRetryTimerId = null;
          // Re-check that we still have a trigger AND status is still error.
          // The trigger we captured at failSave time could be stale if the
          // consumer's effect cycle re-registered between failure and retry.
          if (pendingSaveTrigger && get().status === 'error') {
            pendingSaveTrigger();
          } else if (!pendingSaveTrigger) {
            // Trigger gone (component unmounted / re-registered). Mark the
            // banner as no-longer-truthful so it does not keep promising.
            set({ retryScheduled: false });
          } else {
            // Status moved on, retry obsolete.
            set({ retryScheduled: false });
          }
        }, ERROR_RETRY_DELAY_MS);
      }
    },

    acceptRecovery: () => {
      const state = get();
      if (!state.recoveryCandidate || !state.journeyId) return;

      const snapshot = state.recoveryCandidate.snapshot;
      set({
        currentSnapshot: snapshot,
        status: 'dirty',
        recoveryCandidate: null,
        lastError: null,
        retryScheduled: false,
        recoveryEpoch: state.recoveryEpoch + 1,
      });

      // The recovery snapshot is already in IDB (we read it from there).
      // Skip the redundant write that would otherwise re-set the
      // 7-day clock and queue an unnecessary IndexedDB op.
      clearErrorRetryTimer();
      armAutosaveTimer();
    },

    rejectRecovery: () => {
      const state = get();
      if (state.journeyId) {
        void clearSnapshot(state.journeyId);
      }
      set({ recoveryCandidate: null });
    },
  };
});

/**
 * Register the save trigger that the autosave / retry timers should call.
 *
 * The store cannot call the consumer's save handler directly because the
 * handler typically lives in a React component and depends on hooks/closure
 * (the journey service, toast helpers, route navigation). Consumer registers
 * its trigger on mount and clears it on unmount.
 *
 * Returns an unregister function that ALSO cancels any pending autosave or
 * retry timer — otherwise a retry captured at failSave time could fire after
 * the consumer's effect already moved on, executing a stale closure.
 */
export function registerAutosaveTrigger(trigger: () => void): () => void {
  pendingSaveTrigger = trigger;
  return () => {
    if (pendingSaveTrigger === trigger) {
      pendingSaveTrigger = null;
    }
    clearAutosaveTimer();
    clearErrorRetryTimer();
  };
}

/** Constants exposed for tests and consumer code. */
export const FLOW_EDITOR_AUTOSAVE_DELAY_MS = DEFAULT_AUTOSAVE_DELAY_MS;
export const FLOW_EDITOR_IDB_DEBOUNCE_MS = IDB_DEBOUNCE_MS;
export const FLOW_EDITOR_ERROR_RETRY_DELAY_MS = ERROR_RETRY_DELAY_MS;
