import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportRun as exportHF, inspect } from '@adam0white/human-framework';
import type { Lab } from '@adam0white/lab-client';
import { createPersona, initialPersonaLife, type LifePreparation } from '@adam0white/lab-client';
import { indexedDB } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { ALLOCATION } from '../src/sim/cast.ts';
import { openWatch } from '../src/sim/hf4.ts';
import { admitResident } from '../src/sim/passport.ts';
import { historicalEvent } from './incoming-fixtures.ts';

const captured: { kind: string; value: unknown }[] = [];
let proofIndex = 0;
function capture(kind: string, value: unknown) {
  if (process.env.GLANCE_INCOMING_PROOF_DIR) captured.push({ kind, value: structuredClone(value) });
}
afterEach(() => {
  if (process.env.GLANCE_INCOMING_PROOF_DIR)
    writeFileSync(
      resolve(process.env.GLANCE_INCOMING_PROOF_DIR, `focused-${++proofIndex}.json`),
      JSON.stringify({
        scope:
          'Public HF/SDK and fake-indexeddb engineering control. No producer retirement, real cross-game custody or browser disk claim.',
        events: captured,
      }),
    );
  captured.length = 0;
});

// A real public HF opening is inspected/projected. No body, RNG or portable DTO is fabricated.
async function incoming(id = 'callum'): Promise<LifePreparation> {
  const source = openWatch(7);
  const cast = ALLOCATION.find((c) => c.id === id)!;
  const result = inspect(source.run, {
    perspective: { kind: 'host' },
    people: [id],
    select: ['persona'],
    portable: { person: id, castId: cast.castId, castRevision: cast.revision },
  });
  if (!result.ok) throw Error(result.error.message);
  const part = result.value.people[0]?.parts[0];
  if (part?.select !== 'persona' || !('format' in part.value)) throw Error('Missing actual projection.');
  const portable = part.value;
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: cast.castId,
    castRevision: cast.revision,
    branchId: 'incoming-control',
    parentRevision: null,
    source: { game: 'glance', build: 'actual-public-opening', engine: '4.8.0', rules: 'glance-hf48-1' },
    transfer: { castPassport: `hf-portable-person/${portable.version}`, portable },
    limitations: [],
  });
  const life = initialPersonaLife(cast.castId, parent.branchId, 0);
  capture('actual-source-and-projection', { run: exportHF(source.run), input: { parent, life, clockMs: 0 } });
  return { parent, life, clockMs: 0 };
}

it('admits an actual mapped canonical opening through the published SDK', async () => {
  const input = await incoming();
  const opening = structuredClone(openWatch(7).authors.find((a) => a.id === 'callum')!);
  opening.biography = [];
  const admitted = admitResident(input, opening);
  expect(admitted.id).toBe('callum');
  expect(admitted.portable?.person).toEqual(input.parent.transfer.portable);
  expect(admitted.portable?.mapping).toEqual({ offsetMs: 0, references: [] });
});

it('awaits committed complete native preparation before forwarding a nonempty SDK claim', async () => {
  vi.stubGlobal('indexedDB', indexedDB);
  const input = await incoming();
  let sawDurable = false;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(),
    async request<T>(request: { action: string; envelopes?: unknown[] }) {
      capture('SDK-request', request);
      if (request.action === 'prepareBatch')
        return {
          inputs: [input],
          blocked: [],
          expectedHeads: Object.fromEntries(
            ALLOCATION.map((c) => [
              c.castId,
              c.castId === input.parent.castId ? input.parent.revision : null,
            ]),
          ),
        } as T;
      if (request.action === 'putBatch') {
        if (!request.envelopes?.length) return undefined as T;
        const { PreparationStore } = await import('../src/preparation-store.ts');
        const saved = (await new PreparationStore().list()).at(-1)!;
        capture('durable-readback-at-CAS', saved);
        expect(saved.phase).toBe('unknown');
        expect(JSON.parse(saved.candidate).heads).toEqual(request.envelopes);
        expect(JSON.parse(saved.candidate).run.state.chapter.inputs).toEqual([input]);
        sawDurable = true;
        return undefined as T;
      }
      throw Error('Unexpected shelf action');
    },
  };
  const lab = { build: () => ({ c: 'test' }), setPersonaRecording() {} } as unknown as Lab;
  const c = new Continuity(lab, shelf as never);
  try {
    const state = await c.fresh(7);
    expect(sawDurable).toBe(true);
    expect(state.chapter?.inputs).toEqual([input]);
    expect(c.heads).toHaveLength(1);
    expect(c.sources).toHaveLength(1);
    const saved = c.localSave(state);
    const reopened = new Continuity(lab, {
      ...shelf,
      request: () => {
        throw Error('No shelf read on native reopen');
      },
    } as never);
    const reopenedText = reopened.localSave(await reopened.loadLocal(saved));
    expect(reopenedText).toBe(saved);
    capture('installed-and-reopened-native', { saved, reopened: reopenedText });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('reconstructs all five exact historical portable inputs in one Run without authorizing new claims', async () => {
  const { portablePersonRole } = await import('@adam0white/lab-client');
  const { newGame, cloneState } = await import('../src/sim/dam.ts');
  const { validateChapter } = await import('../src/sim/passport.ts');
  const { chapter, inputs } = historicalEvent('focused-3', 'all-five-actual-Run') as {
    chapter: import('../src/sim/passport.ts').Chapter;
    inputs: LifePreparation[];
  };
  await validateChapter(chapter);
  expect(inputs.map((input) => portablePersonRole(input.parent, 'glance'))).toEqual([
    'dai',
    'callum',
    'nerys',
    'bilal',
    'wren',
  ]);
  const state = newGame(7, chapter);
  expect(state.people.map((p) => p.id)).toEqual(['dai', 'callum', 'nerys', 'bilal', 'wren']);
  const native = (
    cloneState(state) as unknown as {
      hf: {
        run: {
          initial: { people: import('@adam0white/human-framework').PersonAuthoring[] };
          current: { people: Record<string, { agenda: { commitments: unknown[] } }> };
        };
      };
    }
  ).hf.run;
  capture('all-five-actual-Run', { inputs, chapter, native: cloneState(state) });
  expect(Object.keys(native.current.people)).toHaveLength(5);
  expect(Object.keys(native.current.people)).not.toContain('engineer');
  for (const input of inputs) {
    const person = native.initial.people.find((p) => p.identity.castId === input.parent.castId)!;
    expect(person.portable?.person).toEqual(input.parent.transfer.portable);
    expect(native.current.people[person.id]?.agenda.commitments).toEqual(
      (
        input.parent.transfer.portable as import('@adam0white/human-framework/portable').PortablePerson & {
          version: 2;
        }
      ).retained.agenda.commitments,
    );
  }
});

it('keeps the old complete native watch when durable preparation cannot commit', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  vi.stubGlobal('indexedDB', new IDBFactory());
  const input = await incoming();
  let claims = 0;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(),
    async request<T>(q: { action: string }) {
      if (q.action === 'prepareBatch')
        return {
          inputs: [input],
          blocked: [],
          expectedHeads: Object.fromEntries(
            ALLOCATION.map((c) => [
              c.castId,
              c.castId === input.parent.castId ? input.parent.revision : null,
            ]),
          ),
        } as T;
      claims++;
      throw Error('Must not forward before durable preparation');
    },
  };
  const lab = { build: () => ({ c: 'test' }), setPersonaRecording() {} } as unknown as Lab;
  const c = new Continuity(lab, shelf as never);
  const old = await c.fresh(9, true);
  const before = c.localSave(old);
  const commit = vi.spyOn(c.preparations, 'commit').mockRejectedValue(Error('IDB transaction aborted'));
  try {
    await expect(c.fresh(7)).rejects.toThrow('IDB transaction aborted');
    expect(claims).toBe(0);
    expect(c.localSave(old)).toBe(before);
  } finally {
    commit.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('preserves unknown CAS and explicitly recovers its exact acknowledged claims without resending', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  const { acceptPersona, acceptPersonaBatch } = await import('@adam0white/lab-client');
  vi.stubGlobal('indexedDB', new IDBFactory());
  const input = await incoming();
  let store = acceptPersona({ revisions: [], heads: {} }, input.parent);
  let writes = 0;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(),
    async request<T>(q: import('@adam0white/lab-client').PersonaRequest): Promise<T> {
      capture('SDK-request', q);
      if (q.action === 'prepareBatch')
        return {
          inputs: [input],
          blocked: [],
          expectedHeads: Object.fromEntries(ALLOCATION.map((c) => [c.castId, store.heads[c.castId] ?? null])),
        } as T;
      if (q.action === 'putBatch') {
        writes++;
        store = acceptPersonaBatch(store, q.envelopes!, q.expectedHeads);
        capture('actual-SDK-reducer-after-CAS', store);
        throw Error('Unknown transport outcome after actual CAS');
      }
      if (q.action === 'get')
        return (store.revisions.find((r) => r.revision === store.heads[q.castId!]) ?? null) as T;
      throw Error('Unexpected request');
    },
  };
  const lab = { build: () => ({ c: 'test' }), setPersonaRecording() {} } as unknown as Lab;
  const c = new Continuity(lab, shelf as never);
  try {
    const old = await c.fresh(9, true),
      before = c.localSave(old);
    await expect(c.fresh(7)).rejects.toThrow('Unknown transport');
    expect(c.localSave(old)).toBe(before);
    const [reservation] = await c.preparations.list();
    capture('unknown-reservation-and-preserved-native', { reservation, before, after: c.localSave(old) });
    expect(reservation?.phase).toBe('unknown');
    const recovered = new Continuity(lab, shelf as never);
    const state = await recovered.recoverPrepared(reservation!.id, () => before);
    expect(state.chapter?.inputs).toEqual([input]);
    expect(writes).toBe(1);
    const text = recovered.localSave(state);
    capture('explicitly-recovered-native', text);
    const corrupt = JSON.parse(text);
    corrupt.run.state.chapter.initial.callum.state.skills.push({
      id: 'gate',
      level: 1,
      practicedMs: 0,
      lastPracticed: 0,
    });
    await expect(recovered.loadLocal(JSON.stringify(corrupt))).rejects.toThrow('mapping differs');
    expect(recovered.localSave(state)).toBe(text);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('recovers a durably prepared but never forwarded cancelled opening with one explicit claim', async () => {
  const { IDBFactory } = await import('fake-indexeddb');
  const { acceptPersona, acceptPersonaBatch } = await import('@adam0white/lab-client');
  vi.stubGlobal('indexedDB', new IDBFactory());
  const input = await incoming();
  let store = acceptPersona({ revisions: [], heads: {} }, input.parent);
  let writes = 0;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(),
    async request<T>(q: import('@adam0white/lab-client').PersonaRequest): Promise<T> {
      capture('SDK-request', q);
      if (q.action === 'prepareBatch')
        return {
          inputs: [input],
          blocked: [],
          expectedHeads: Object.fromEntries(ALLOCATION.map((c) => [c.castId, store.heads[c.castId] ?? null])),
        } as T;
      if (q.action === 'putBatch') {
        writes++;
        store = acceptPersonaBatch(store, q.envelopes!, q.expectedHeads);
        capture('actual-SDK-reducer-after-CAS', store);
        return undefined as T;
      }
      throw Error('Unexpected request');
    },
  };
  const lab = { build: () => ({ c: 'test' }), setPersonaRecording() {} } as unknown as Lab;
  const c = new Continuity(lab, shelf as never);
  const old = await c.fresh(9, true),
    before = c.localSave(old);
  const commit = c.preparations.commit.bind(c.preparations);
  const cancelled = vi.spyOn(c.preparations, 'commit').mockImplementation(async (record) => {
    const saved = await commit(record);
    c.invalidate();
    return saved;
  });
  try {
    await expect(c.fresh(7)).rejects.toThrow('cancelled');
    expect(writes).toBe(0);
    expect(c.localSave(old)).toBe(before);
    const [record] = await c.preparations.list();
    capture('cancelled-never-forwarded', { record, writes, before, after: c.localSave(old) });
    expect(record?.phase).toBe('prepared');
    const recovered = new Continuity(lab, shelf as never);
    expect((await recovered.recoverPrepared(record!.id, () => before)).chapter?.inputs).toEqual([input]);
    expect(writes).toBe(1);
    capture('explicitly-resumed-record', await recovered.preparations.read(record!.id));
  } finally {
    cancelled.mockRestore();
    vi.unstubAllGlobals();
  }
});
