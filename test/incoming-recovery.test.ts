import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportRun, inspect } from '@adam0white/human-framework';
import {
  acceptPersona,
  acceptPersonaBatch,
  createPersona,
  initialPersonaLife,
  type Lab,
  type LifePreparation,
  type PersonaEnvelope,
  type PersonaRequest,
} from '@adam0white/lab-client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { ALLOCATION } from '../src/sim/cast.ts';
import { openWatch } from '../src/sim/hf4.ts';
import { historicalEvent, restoreHistoricalReservation } from './incoming-fixtures.ts';

const events: unknown[] = [];
let sequence = 0;
function capture(kind: string, value: unknown) {
  events.push({ kind, value: structuredClone(value) });
}
afterEach(() => {
  if (process.env.GLANCE_INCOMING_PROOF_DIR)
    writeFileSync(
      resolve(process.env.GLANCE_INCOMING_PROOF_DIR, `recovery-${++sequence}.json`),
      JSON.stringify({
        scope:
          'Public HF/SDK plus shared fake-indexeddb engineering controls; no browser disk or producer retirement claim.',
        events,
      }),
    );
  events.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function input(id = 'callum') {
  const source = openWatch(7),
    cast = ALLOCATION.find((c) => c.id === id)!;
  const projected = inspect(source.run, {
    perspective: { kind: 'host' },
    people: [id],
    select: ['persona'],
    portable: { person: id, castId: cast.castId, castRevision: cast.revision },
  });
  if (!projected.ok) throw Error(projected.error.message);
  const part = projected.value.people[0]!.parts[0]!;
  if (part.select !== 'persona' || !('format' in part.value)) throw Error('Missing public projection');
  const parent = await createPersona({
    format: 'hf-persona/1',
    castId: cast.castId,
    castRevision: cast.revision,
    branchId: 'recovery-control',
    parentRevision: null,
    source: { game: 'glance', build: 'actual-public-opening', engine: '4.8.0', rules: 'glance-hf48-1' },
    transfer: { castPassport: `hf-portable-person/${part.value.version}`, portable: part.value },
    limitations: [],
  });
  const result = { parent, life: initialPersonaLife(cast.castId, parent.branchId, 0), clockMs: 0 };
  capture('public-source', { run: exportRun(source.run), input: result });
  return result;
}
const lab = { build: () => ({ c: 'test' }), setPersonaRecording() {} } as unknown as Lab;
function harness(inputs: LifePreparation[], ancestors: PersonaEnvelope[] = []) {
  vi.stubGlobal('indexedDB', new IDBFactory());
  let store = [...ancestors, ...inputs.map((i) => i.parent)].reduce((s, parent) => acceptPersona(s, parent), {
    revisions: [],
    heads: {},
  } as ReturnType<typeof acceptPersona>);
  const requests: PersonaRequest[] = [];
  const wire = {
    unknown: false,
    snapshotChange: undefined as string | undefined,
    onPut: undefined as (() => Promise<void>) | undefined,
  };
  const shelf = {
    enabled: true,
    ready: Promise.resolve(),
    async request<T>(q: PersonaRequest): Promise<T> {
      requests.push(structuredClone(q));
      capture('actual-SDK-request', q);
      if (q.action === 'prepareBatch') {
        const expectedHeads = Object.fromEntries(
          ALLOCATION.map((c) => [c.castId, store.heads[c.castId] ?? null]),
        );
        if (wire.snapshotChange) expectedHeads[wire.snapshotChange] = 'f'.repeat(64);
        const value = { inputs, blocked: [], expectedHeads };
        capture('single-snapshot', value);
        return value as T;
      }
      if (q.action === 'get')
        return (store.revisions.find((r) => r.revision === store.heads[q.castId!]) ?? null) as T;
      if (q.action === 'putBatch') {
        await wire.onPut?.();
        store = acceptPersonaBatch(store, q.envelopes!, q.expectedHeads);
        capture('actual-reducer-state', store);
        if (wire.unknown) throw Error('Transport uncertain after actual CAS');
        return undefined as T;
      }
      throw Error('Unexpected operation');
    },
  };
  const c = new Continuity(lab, shelf as never);
  return { c, shelf, requests, wire };
}
async function prepared(h: ReturnType<typeof harness>) {
  const old = await h.c.fresh(9, true),
    before = h.c.localSave(old);
  const commit = h.c.preparations.commit.bind(h.c.preparations);
  const cancel = vi.spyOn(h.c.preparations, 'commit').mockImplementation(async (r) => {
    const saved = await commit(r);
    h.c.invalidate();
    return saved;
  });
  await expect(h.c.fresh(7)).rejects.toThrow('cancelled');
  cancel.mockRestore();
  const [record] = await h.c.preparations.list();
  expect(record!.phase).toBe('prepared');
  return { old, before, record: record! };
}
it('IN-R1 allows only one shared-IDB recovery dispatcher and rejects a stale downgrade', async () => {
  const h = harness([await input()]),
    p = await prepared(h);
  const a = new Continuity(lab, h.shelf as never),
    b = new Continuity(lab, h.shelf as never);
  let reads = 0,
    releaseReads!: () => void;
  const bothRead = new Promise<void>((r) => (releaseReads = r));
  for (const c of [a, b]) {
    const read = c.preparations.read.bind(c.preparations);
    let first = true;
    vi.spyOn(c.preparations, 'read').mockImplementation(async (id) => {
      const record = await read(id);
      if (first) {
        first = false;
        if (++reads === 2) releaseReads();
        await bothRead;
      }
      return record;
    });
  }
  let sends = 0,
    firstSend!: () => void,
    secondSend!: () => void,
    releaseSend!: () => void;
  const sent = new Promise<void>((r) => (firstSend = r)),
    second = new Promise<void>((r) => (secondSend = r)),
    hold = new Promise<void>((r) => (releaseSend = r));
  h.wire.onPut = async () => {
    if (++sends === 1) firstSend();
    else secondSend();
    await hold;
  };
  const attempts = [
    a.recoverPrepared(p.record.id, () => p.before),
    b.recoverPrepared(p.record.id, () => p.before),
  ];
  const settled = Promise.race(
    attempts.map((promise) =>
      promise.then(
        () => {},
        () => {},
      ),
    ),
  );
  await sent;
  await Promise.race([second, settled]);
  releaseSend();
  const outcomes = await Promise.allSettled(attempts);
  capture('shared-IDB-race', {
    sends,
    outcomes: outcomes.map((o) => o.status),
    records: await a.preparations.list(),
  });
  expect(sends).toBe(1);
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  await expect(a.preparations.commit(p.record)).rejects.toThrow();
  expect((await a.preparations.read(p.record.id)).phase).toBe('acknowledged');
});
it('IN-R2 blocks a new opening when unresolved reservation inventory cannot be read', async () => {
  const h = harness([await input()]),
    p = await prepared(h);
  const count = h.requests.length;
  vi.spyOn(h.c.preparations, 'list').mockRejectedValueOnce(Error('Inventory read failed'));
  await expect(h.c.fresh(8)).rejects.toThrow('Inventory read failed');
  expect(h.requests).toHaveLength(count);
  expect(h.c.localSave(p.old)).toBe(p.before);
  capture('unreadable-inventory', {
    record: p.record,
    before: p.before,
    after: h.c.localSave(p.old),
    requests: h.requests,
  });
});
it('IN-R3 pins SDK-owned blocked identities in blocked-only and mixed durable chapters', async () => {
  const owned = historicalEvent('recovery-3', 'single-snapshot').inputs[0] as LifePreparation;
  const unclaimed = historicalEvent('recovery-3', 'public-source').input as LifePreparation;
  const h = harness([owned], [unclaimed.parent]);
  let state = await h.c.fresh(7);
  expect(state.chapter?.blocked?.[0]?.reason).toContain('Wren is still in rope');
  expect(h.c.status).toContain('Wren');
  capture('blocked-only', { state: h.c.localSave(state), requests: h.requests });
  const mixed = harness([owned, await input('callum')], [unclaimed.parent]);
  mixed.wire.onPut = async () => {
    const [record] = await mixed.c.preparations.list();
    const chapter = JSON.parse(record!.candidate).run.state.chapter;
    capture('mixed-durable-before-CAS', { record, chapter });
    expect(chapter.blocked).toHaveLength(1);
    expect(chapter.blocked[0].reason).toContain('Wren is still in rope');
  };
  state = await mixed.c.fresh(7);
  expect(state.chapter?.blocked).toHaveLength(1);
  expect(mixed.c.status).toContain('Wren');
});
it('IN-R4 hides historical acknowledged openings and preserves a newer native recovery basis', async () => {
  const h = harness([await input()]);
  const a = await h.c.fresh(7),
    savedA = h.c.localSave(a),
    [record] = await h.c.preparations.list();
  const b = await h.c.fresh(9, true),
    savedB = h.c.localSave(b);
  // Title uses the live stored native rather than a generation captured before a different run.
  const current = () => savedB;
  expect(await h.c.pendingPreparations(current)).toEqual([]);
  // A failed save must not make the active newer run disappear from recovery checks.
  expect((await h.c.pendingPreparations(() => null)).length).toBe(0);
  await expect(h.c.recoverPrepared(record!.id, () => null)).rejects.toThrow('current watch');
  await expect(h.c.recoverPrepared(record!.id, current)).rejects.toThrow('current watch');
  expect(h.c.localSave(b)).toBe(savedB);
  capture('historical-ACK', { record, savedA, savedB, after: h.c.localSave(b) });
});
it('IN-R5 checks a historical unknown multi-person claim in one snapshot without resending', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const { record, before } = historicalEvent('recovery-5', 'changed-snapshot-refusal');
  const store = historicalEvent('recovery-5', 'actual-reducer-state');
  await restoreHistoricalReservation(record);
  let mixed = true;
  const requests: PersonaRequest[] = [];
  const shelf = {
    async request<T>(q: PersonaRequest): Promise<T> {
      requests.push(structuredClone(q));
      capture('actual-readonly-request', q);
      if (q.action !== 'prepareBatch') throw Error('No get or write during unknown verification');
      const heads = Object.fromEntries(ALLOCATION.map((c) => [c.castId, store.heads[c.castId] ?? null]));
      // Inject an earlier genuine Wren head into a later snapshot: no fabricated Person or hash.
      if (mixed) heads['hf.cast.wren.rope'] = record.expectedHeads['hf.cast.wren.rope'];
      const snapshot = { expectedHeads: heads, inputs: [], blocked: [] };
      capture('readonly-snapshot', snapshot);
      return snapshot as T;
    },
  };
  const c = new Continuity(lab, shelf as never),
    old = await c.loadLocal(before);
  await expect(c.recoverPrepared(record.id, () => before)).rejects.toThrow('not confirmed');
  expect((await c.preparations.read(record.id)).phase).toBe('unknown');
  expect(c.localSave(old)).toBe(before);
  mixed = false;
  const restored = await c.recoverPrepared(record.id, () => before);
  expect(restored.chapter?.inputs).toHaveLength(2);
  expect(requests.map((q) => q.action)).toEqual(['prepareBatch', 'prepareBatch']);
  capture('historical-multi-head-recovered', {
    record: await c.preparations.read(record.id),
    native: c.localSave(restored),
    sourceStore: store,
    before,
  });
});
it('IN-R1 refuses a stale prepared write over a possibly forwarded reservation', async () => {
  const h = harness([await input()]),
    p = await prepared(h);
  h.wire.unknown = true;
  await expect(h.c.recoverPrepared(p.record.id, () => p.before)).rejects.toThrow('Transport uncertain');
  expect((await h.c.preparations.read(p.record.id)).phase).toBe('unknown');
  await expect(h.c.preparations.commit(p.record)).rejects.toThrow();
  expect((await h.c.preparations.read(p.record.id)).phase).toBe('unknown');
});

it('IN-R1 refuses a stale rollback and acknowledgement after a different dispatch owns the operation', async () => {
  const h = harness([await input()]),
    p = await prepared(h);
  const first = await h.c.preparations.transition(p.record, 'unknown');
  // First owner cancels before sending. A second explicit recovery then owns a new token.
  const unsent = await h.c.preparations.transition(first, 'prepared');
  const second = await h.c.preparations.transition(unsent, 'unknown');
  expect(second.dispatch).not.toBe(first.dispatch);
  await expect(h.c.preparations.transition(first, 'prepared')).rejects.toThrow('does not own');
  await expect(h.c.preparations.transition(first, 'acknowledged')).rejects.toThrow('does not own');
  expect(await h.c.preparations.read(p.record.id)).toEqual(second);
  expect(h.requests.filter((q) => q.action === 'putBatch')).toHaveLength(0);
  capture('stale-dispatch-rollback-and-ACK', {
    first,
    unsent,
    second,
    retained: await h.c.preparations.read(p.record.id),
  });
});

it('IN-R4 rechecks the live native basis at the final asynchronous install boundary', async () => {
  const h = harness([await input()]),
    p = await prepared(h);
  const other = new Continuity(lab, h.shelf as never);
  const newer = await other.fresh(12, true),
    newerText = other.localSave(newer);
  let currentText = p.before;
  const load = h.c.loadLocal.bind(h.c);
  vi.spyOn(h.c, 'loadLocal').mockImplementation((...args) => {
    currentText = newerText;
    return load(...args);
  });
  await expect(h.c.recoverPrepared(p.record.id, () => currentText)).rejects.toThrow('current watch');
  expect(currentText).toBe(newerText);
  expect(h.c.localSave(p.old)).toBe(p.before);
  capture('native-install-basis-replaced', {
    before: p.before,
    newerText,
    after: h.c.localSave(p.old),
    record: await h.c.preparations.read(p.record.id),
  });
});

it('IN-R4 refuses native replacement during the final awaited SHA without installing stale recovery', async () => {
  const h = harness([await input()]),
    p = await prepared(h);
  const other = new Continuity(lab, h.shelf as never);
  const newer = await other.fresh(12, true),
    newerText = other.localSave(newer);
  const { Window } = await import('happy-dom');
  const browser = new Window({ url: 'http://localhost:3000/' });
  const { LOCAL_KEY } = await import('../src/continuity.ts');
  vi.stubGlobal('localStorage', browser.localStorage);
  localStorage.setItem(LOCAL_KEY, p.before);
  let armed = false,
    changed = false,
    generationAtReplacement = -1,
    generationAfterDigest = -1;
  const load = h.c.loadLocal.bind(h.c);
  vi.spyOn(h.c, 'loadLocal').mockImplementation((...args) => {
    armed = true;
    return load(...args);
  });
  const actualDigest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const isFinalBasis = armed && !changed && new TextDecoder().decode(bytes) === p.before;
    const pending = actualDigest(algorithm, data);
    if (isFinalBasis) {
      changed = true;
      generationAtReplacement = h.c.generation;
      // A different tab writes actual LOCAL_KEY bytes while the final digest promise is pending.
      localStorage.setItem(LOCAL_KEY, newerText);
    }
    const result = await pending;
    if (isFinalBasis) {
      generationAfterDigest = h.c.generation;
      expect(Buffer.from(result).toString('hex')).toBe(p.record.basis?.sha256);
      capture('actual-final-native-digest', {
        input: p.before,
        bytes: bytes.byteLength,
        sha256: Buffer.from(result).toString('hex'),
        replacement: localStorage.getItem(LOCAL_KEY),
        generationAtReplacement,
        generationAfterDigest,
      });
    }
    return result;
  });
  try {
    const outcome = await h.c
      .recoverPrepared(p.record.id, () => localStorage.getItem(LOCAL_KEY))
      .then(
        (state) => {
          capture('returned-installed-native', h.c.localSave(state));
          return null;
        },
        (error) => String(error),
      );
    capture('native-replaced-during-final-SHA', {
      outcome,
      before: p.before,
      newerText,
      savedAfter: localStorage.getItem(LOCAL_KEY),
      heldAfter: h.c.localSave(p.old),
      record: await h.c.preparations.read(p.record.id),
    });
    expect(changed).toBe(true);
    expect(generationAfterDigest).toBe(generationAtReplacement);
    expect(outcome).toContain('current watch');
    expect(localStorage.getItem(LOCAL_KEY)).toBe(newerText);
    expect(h.c.localSave(p.old)).toBe(p.before);
  } finally {
    await browser.happyDOM.close();
  }
});
