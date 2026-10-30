import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  acceptPersona,
  acceptPersonaBatch,
  type Lab,
  type LifePreparation,
  type PersonaRequest,
  portablePersonRole,
  portableWriteBlockers,
} from '@adam0white/lab-client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { ALLOCATION } from '../src/sim/cast.ts';
import { historicalEvent, restoreHistoricalReservation } from './incoming-fixtures.ts';

const lab = { build: () => ({ c: 'test' }), setPersonaRecording() {} } as unknown as Lab;
const events: unknown[] = [];
let sequence = 0;
function capture(kind: string, value: unknown) {
  events.push({ kind, value: structuredClone(value) });
}
afterEach(() => {
  if (process.env.GLANCE_INCOMING_PROOF_DIR)
    writeFileSync(
      resolve(process.env.GLANCE_INCOMING_PROOF_DIR, `gate-${++sequence}.json`),
      JSON.stringify({
        scope:
          'Published .6 gate plus public HF/SDK/fake-IDB engineering; no invented live certification or real cross-game custody.',
        events,
      }),
    );
  events.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('refuses an exact historical native without a shelf read', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const { saved, reopened } = historicalEvent('focused-2', 'installed-and-reopened-native');
  expect(saved).toBe(reopened);
  const c = new Continuity(lab, {
    request() {
      throw Error('No shelf reads');
    },
  } as never);
  await expect(c.loadLocal(saved)).rejects.toThrow('older or unsupported version');
  expect(saved).toBe(reopened);
  capture('exact-historical-native-refused', { saved, reopened });
});
it('refuses a historical gate-closed prepared CAS while preserving the exact old native and reservation', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const { record, before } = historicalEvent('focused-6', 'cancelled-never-forwarded');
  await restoreHistoricalReservation(record);
  let writes = 0;
  const c = new Continuity(lab, {
    async request() {
      writes++;
      return undefined;
    },
  } as never);
  await expect(c.recoverPrepared(record.id, () => before)).rejects.toThrow('older or unsupported version');
  expect(writes).toBe(0);
  expect(await c.preparations.read(record.id)).toEqual(record);
  capture('gate-closed-prepared-refusal', {
    record,
    before,
    after: before,
    writes,
    retained: await c.preparations.read(record.id),
  });
});

it('uses the published default gate to admit Callum and name all four blocked peers before actual CAS', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const { inputs } = historicalEvent('focused-3', 'all-five-actual-Run') as { inputs: LifePreparation[] };
  expect(inputs.map((i) => portablePersonRole(i.parent, 'glance'))).toEqual([
    'dai',
    'callum',
    'nerys',
    'bilal',
    'wren',
  ]);
  expect(portableWriteBlockers('hf.cast.callum.glance', 'glance')).toEqual([]);
  for (const id of ['hf.cast.dai.glance', 'hf.cast.nerys.glance', 'hf.cast.bilal.rope', 'hf.cast.wren.rope'])
    expect(portableWriteBlockers(id, 'glance').length).toBeGreaterThan(0);
  let store = inputs.reduce((state, input) => acceptPersona(state, input.parent), {
    revisions: [],
    heads: {},
  } as ReturnType<typeof acceptPersona>);
  const original = structuredClone(store),
    requests: PersonaRequest[] = [];
  const c = new Continuity(lab, {
    enabled: true,
    ready: Promise.resolve(),
    async request<T>(q: PersonaRequest): Promise<T> {
      requests.push(structuredClone(q));
      capture('actual-SDK-request', q);
      if (q.action === 'prepareBatch')
        return {
          inputs,
          blocked: [],
          expectedHeads: Object.fromEntries(ALLOCATION.map((p) => [p.castId, store.heads[p.castId] ?? null])),
        } as T;
      if (q.action !== 'putBatch') throw Error('Unexpected actual transport');
      expect(q.envelopes?.map((e) => e.castId)).toEqual(['hf.cast.callum.glance']);
      const [record] = await c.preparations.list();
      const chapter = JSON.parse(record!.candidate).run.state.chapter;
      expect(chapter.blocked).toHaveLength(4);
      expect(record!.phase).toBe('unknown');
      for (const name of ['Dai', 'Nerys', 'Bilal', 'Wren'])
        expect(
          chapter.blocked.some(
            (b: { reason: string }) => b.reason.includes(name) && b.reason.includes('read-only'),
          ),
        ).toBe(true);
      capture('complete-durable-gate-plan-before-actual-CAS', record);
      store = acceptPersonaBatch(store, q.envelopes!, q.expectedHeads);
      capture('actual-public-reducer', store);
      return undefined as T;
    },
  } as never);
  const state = await c.fresh(7);
  expect(state.chapter?.inputs.map((i) => i.parent.castId)).toEqual(['hf.cast.callum.glance']);
  expect(state.people.map((p) => p.id)).toEqual(['dai', 'callum', 'nerys', 'bilal', 'wren']);
  for (const name of ['Dai', 'Nerys', 'Bilal', 'Wren'])
    expect(state.chapter?.blocked?.some((b) => b.reason.includes(name))).toBe(true);
  for (const parent of inputs.filter((i) => i.parent.castId !== 'hf.cast.callum.glance'))
    expect(store.heads[parent.parent.castId]).toBe(original.heads[parent.parent.castId]);
  capture('installed-current-gated-native', {
    native: c.localSave(state),
    requests,
    blocked: state.chapter?.blocked,
    original,
    store,
  });
});
