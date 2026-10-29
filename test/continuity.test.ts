/** SCOPE: unsupported historical inputs and current outbound custody still refuse. Historical
 * HF3 passport success receipts stay immutable; these tests assert current refusal,
 * per-person skipping, held-state safety and real complete native continuation. */

import type { Lab } from '@adam0white/lab-client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

import { Continuity, watchShelfPreference } from '../src/continuity.ts';
import { ALLOCATION } from '../src/sim/cast.ts';
import { cloneState, newGame, queueInput, step } from '../src/sim/dam.ts';
import { exportCurrent } from '../src/sim/run.ts';

function harness(blocked: unknown[] = []) {
  const requests: any[] = [];
  const shelf = {
    enabled: true,
    ready: Promise.resolve(),
    request: async (r: any) => {
      requests.push(structuredClone(r));
      if (r.action === 'prepareBatch')
        return {
          expectedHeads: Object.fromEntries(ALLOCATION.map((a) => [a.castId, null])),
          inputs: [],
          blocked,
        };
      return null;
    },
  };
  const lab = {
    build: () => ({ c: 'test' }),
    setPersonaRecording() {},
    allowPersonaRecording: async () => false,
  } as unknown as Lab;
  return { c: new Continuity(lab, shelf as never), shelf, requests };
}
it('names unsupported people and starts the other local people without claiming histories', async () => {
  const { c, requests } = harness([{ castId: 'hf.cast.dai.glance', reason: 'Unsupported source family' }]);
  const s = await c.fresh(7);
  expect(s.people.map((p) => p.id)).toEqual(['dai', 'callum', 'nerys', 'bilal', 'wren']);
  expect(c.status).toContain('Dai');
  expect(c.status).toContain('Unsupported source family');
  expect(c.heads).toEqual([]);
  expect(requests.filter((r) => r.action === 'putBatch').flatMap((r) => r.envelopes)).toEqual([]);
});
it('refuses every actor before any publication operation even when the source is idle', async () => {
  const { c, requests } = harness();
  await c.fresh(7, true);
  for (const actor of ALLOCATION)
    await expect(c.checkpoint(actor.castId)).rejects.toThrow('no person or source history was published');
  expect(requests).toEqual([]);
});
it('preserves the native held source and original text on older or forged file refusal', async () => {
  const { c } = harness();
  const s = await c.fresh(7, true);
  const before = c.localSave(s);
  const old = exportCurrent(newGame(7));
  old.framework = '3.0.0';
  await expect(c.importFile(JSON.stringify(old))).rejects.toThrow('unsupported');
  expect(c.localSave(s)).toBe(before);
  const forged = exportCurrent(s);
  forged.state.minute++;
  await expect(c.importFile(JSON.stringify(forged))).rejects.toThrow();
  expect(c.localSave(s)).toBe(before);
});
it('continues both native source histories after a real local reload', async () => {
  const { c } = harness();
  const s = await c.fresh(7, true);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  step(s);
  const saved = c.localSave(s);
  const other = harness();
  const loaded = await other.c.loadLocal(saved);
  queueInput(s, { kind: 'ring' });
  queueInput(loaded, { kind: 'ring' });
  step(s);
  step(loaded);
  expect(cloneState(loaded)).toEqual(cloneState(s));
});
it('cancels stale shelf preparation without installing or claiming its result', async () => {
  let release!: () => void;
  const h = harness();
  h.shelf.ready = new Promise<void>((r) => {
    release = r;
  }) as never;
  const pending = h.c.fresh(7);
  h.c.invalidate();
  release();
  await expect(pending).rejects.toThrow();
  expect(h.requests).toEqual([]);
  expect(h.c.heads).toEqual([]);
});
it('keeps recording changes separate from identity cancellation', () => {
  const target = new EventTarget();
  const invalidate = vi.fn();
  const close = watchShelfPreference(invalidate, target);
  target.dispatchEvent(new Event('storage'));
  expect(invalidate).not.toHaveBeenCalled();
  close();
});
