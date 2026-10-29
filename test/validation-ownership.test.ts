import type { Lab } from '@adam0white/lab-client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { digest } from '../src/file-admission.ts';
import { newGame } from '../src/sim/dam.ts';
import { displayOwner } from '../src/sim/display.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';

const workers: HoldingWorker[] = [];
let nativeReady: (() => void) | undefined;
let initialKind: string | undefined,
  holdNative = false,
  initialReady: (() => void) | undefined;
class HoldingWorker extends BrowserWorker {
  kind = '';
  terminated = false;
  held: { event: MessageEvent; receive: ((event: MessageEvent) => void) | null }[] = [];
  constructor() {
    super();
    workers.push(this);
  }
  override postMessage(value: unknown) {
    const q = value as { id: number; kind: string };
    this.kind = q.kind;
    const receive = this.onmessage;
    const shouldHold = q.kind === initialKind || (q.kind === 'native' && holdNative);
    this.onmessage = (event) => {
      if (event.data.id === q.id && event.data.kind === 'accepted' && shouldHold) {
        this.held.push({ event, receive });
        if (q.kind === 'native') {
          nativeReady?.();
          nativeReady = undefined;
        }
        if (q.kind === initialKind) {
          initialReady?.();
          initialReady = undefined;
        }
      } else receive?.(event);
    };
    super.postMessage(value);
  }
  release() {
    for (const { event, receive } of this.held.splice(0)) receive?.(event);
  }
  override terminate() {
    this.terminated = true;
    super.terminate();
  }
}
const lab = {
  build: () => ({ c: 'validation-ownership-control' }),
  setPersonaRecording() {},
} as unknown as Lab;
const shelf = {
  enabled: false,
  ready: Promise.resolve(),
  request: vi.fn(async () => {
    throw Error('No shelf transport is needed before cancelled validation');
  }),
};
beforeEach(() => {
  initialKind = undefined;
  holdNative = false;
  initialReady = undefined;
  workers.length = 0;
  vi.stubGlobal('Worker', HoldingWorker);
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => {
  for (const w of workers) w.release();
  disposeBrowserWorkers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['recovery', 'fresh'] as const)(
  'obsolete %s validation cleanup cannot terminate newer Resume',
  async (kind) => {
    const c = new Continuity(lab, shelf as never);
    const before = c.localSave(newGame(7));
    await c.loadLocal(before);
    // The recovery race stops during candidate validation, before any shelf operation.
    // Supply a fresh candidate at the store boundary; validation remains real.
    const record = {
      id: 'race',
      candidate: before,
      basis: { runId: JSON.parse(before).runId, sha256: await digest(before) },
    };
    vi.spyOn(c.preparations, 'read').mockResolvedValue(record as never);
    initialKind = kind === 'recovery' ? 'load' : 'create';
    const ready = new Promise<void>((resolve) => {
      initialReady = resolve;
    });
    const initial = (
      kind === 'recovery' ? c.recoverPrepared(record.id, () => before) : c.fresh(9, true)
    ).then(
      (value) => ({ value, error: undefined }),
      (error) => ({ value: undefined, error }),
    );
    try {
      await Promise.race([
        ready,
        initial.then((result) => {
          if (result.error) throw result.error;
        }),
      ]);
      holdNative = true;
      const nativeIsReady = new Promise<void>((resolve) => {
        nativeReady = resolve;
      });
      const resumed = c.loadLocal(before).then(
        (value) => ({ value, error: undefined }),
        (error) => ({ value: undefined, error }),
      );
      const newest = workers.at(-1)!;
      expect(newest.kind).toBe('native');
      const obsolete = await initial;
      expect(String(obsolete.error)).toMatch(/cancelled|changed/);
      expect(newest.terminated).toBe(false);
      holdNative = false;
      initialKind = undefined;
      // Wait for the real native-validation reply, never fabricate an accepted state.
      await Promise.race([
        nativeIsReady,
        resumed.then((result) => {
          if (result.error) throw result.error;
        }),
      ]);
      newest.release();
      const result = await resumed;
      expect(result.error).toBeUndefined();
      expect(c.localSave(result.value!)).toBe(before);
      const owner = displayOwner(result.value!)!;
      await owner.mutate({ minutes: 1 });
      expect(result.value!.minute).toBe(JSON.parse(before).run.state.minute + 1);
    } finally {
      initialKind = undefined;
      holdNative = false;
      for (const w of workers) w.release();
      c.clear();
    }
  },
);
it('disposes a refused native candidate after validation and keeps the installed owner', async () => {
  const c = new Continuity(lab, shelf as never);
  const before = c.localSave(newGame(7));
  const held = await c.loadLocal(before),
    owner = displayOwner(held)!;
  const prior = workers.at(-1)!;
  try {
    await expect(c.loadLocal(before, async () => () => false)).rejects.toThrow('current watch');
    const rejected = workers.at(-1)!;
    expect(rejected).not.toBe(prior);
    expect(rejected.terminated).toBe(true);
    expect(prior.terminated).toBe(false);
    expect(c.localSave(held)).toBe(before);
    await owner.mutate({ minutes: 1 });
    expect(held.minute).toBe(JSON.parse(before).run.state.minute + 1);
  } finally {
    c.clear();
  }
});
