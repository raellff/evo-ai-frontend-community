import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

export type FlowSnapshotPayload = {
  nodes: unknown[];
  edges: unknown[];
  variables: unknown[];
};

export type StoredFlowSnapshot = {
  payload: FlowSnapshotPayload;
  timestamp: number;
};

const NAMESPACE = 'evo-flow-editor';
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (journeyId: string) => `${NAMESPACE}:${journeyId}`;

export async function saveSnapshot(
  journeyId: string,
  payload: FlowSnapshotPayload,
): Promise<void> {
  try {
    const record: StoredFlowSnapshot = { payload, timestamp: Date.now() };
    await idbSet(keyFor(journeyId), record);
  } catch (error) {
    // IndexedDB unavailable (private mode strict / quota / old browser).
    // Recovery becomes best-effort; never block the editor.
    console.warn('[flowEditor] failed to persist snapshot to IndexedDB', error);
  }
}

export async function loadSnapshot(
  journeyId: string,
): Promise<StoredFlowSnapshot | null> {
  try {
    const record = await idbGet<StoredFlowSnapshot | undefined>(keyFor(journeyId));
    if (!record) return null;

    if (Date.now() - record.timestamp > STALE_MS) {
      await clearSnapshot(journeyId);
      return null;
    }

    return record;
  } catch (error) {
    console.warn('[flowEditor] failed to read snapshot from IndexedDB', error);
    return null;
  }
}

export async function clearSnapshot(journeyId: string): Promise<void> {
  try {
    await idbDel(keyFor(journeyId));
  } catch (error) {
    console.warn('[flowEditor] failed to clear snapshot from IndexedDB', error);
  }
}
