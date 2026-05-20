import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  saveSnapshot,
  loadSnapshot,
  clearSnapshot,
  type FlowSnapshotPayload,
} from './idbSnapshot';

const samplePayload: FlowSnapshotPayload = {
  nodes: [{ id: 'a', type: 'wait', data: { duration: 3 } }],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
  variables: [{ name: 'first_name', value: '' }],
};

afterEach(async () => {
  await clearSnapshot('journey-1');
  await clearSnapshot('journey-2');
  vi.restoreAllMocks();
});

describe('idbSnapshot', () => {
  it('returns null when no snapshot has been stored for the journey', async () => {
    expect(await loadSnapshot('journey-1')).toBeNull();
  });

  it('persists a snapshot and reads it back with timestamp', async () => {
    const before = Date.now();
    await saveSnapshot('journey-1', samplePayload);
    const stored = await loadSnapshot('journey-1');

    expect(stored).not.toBeNull();
    expect(stored!.payload).toEqual(samplePayload);
    expect(stored!.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('isolates snapshots by journeyId', async () => {
    const other: FlowSnapshotPayload = { nodes: [{ id: 'x' }], edges: [], variables: [] };
    await saveSnapshot('journey-1', samplePayload);
    await saveSnapshot('journey-2', other);

    expect((await loadSnapshot('journey-1'))!.payload).toEqual(samplePayload);
    expect((await loadSnapshot('journey-2'))!.payload).toEqual(other);
  });

  it('overwrites an existing snapshot for the same journey', async () => {
    const next: FlowSnapshotPayload = { nodes: [{ id: 'y' }], edges: [], variables: [] };
    await saveSnapshot('journey-1', samplePayload);
    await saveSnapshot('journey-1', next);

    expect((await loadSnapshot('journey-1'))!.payload).toEqual(next);
  });

  it('clears a snapshot', async () => {
    await saveSnapshot('journey-1', samplePayload);
    await clearSnapshot('journey-1');

    expect(await loadSnapshot('journey-1')).toBeNull();
  });

  it('drops snapshots older than 7 days and returns null', async () => {
    const baseline = new Date('2026-01-01T00:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(baseline);
    await saveSnapshot('journey-1', samplePayload);

    vi.spyOn(Date, 'now').mockReturnValue(baseline + 8 * 24 * 60 * 60 * 1000);
    const stored = await loadSnapshot('journey-1');

    expect(stored).toBeNull();
  });

  it('keeps snapshots within the 7-day window', async () => {
    const baseline = new Date('2026-01-01T00:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(baseline);
    await saveSnapshot('journey-1', samplePayload);

    vi.spyOn(Date, 'now').mockReturnValue(baseline + 6 * 24 * 60 * 60 * 1000);
    const stored = await loadSnapshot('journey-1');

    expect(stored).not.toBeNull();
  });
});
