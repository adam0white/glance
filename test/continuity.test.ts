import { castForGame } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { exportRun, fingerprint, newGame, replay } from '../src/sim/dam.ts';
import { admitResident } from '../src/sim/passport.ts';

it('uses released complete profiles and refuses a public profile in place of a passport', () => {
  const s = newGame(7);
  const dai = s.people[0]!;
  expect(dai.traits).toEqual(castForGame('glance').find((c) => c.name === 'Dai')!.traits);
  expect(() =>
    admitResident({ parent: { castId: 'hf.cast.dai.glance', transfer: {} }, clockMs: 0 } as never, dai),
  ).toThrow();
  const ex = exportRun(s, '2.18.0');
  expect(fingerprint(replay(ex.seed, ex.inputs, ex.state.minute, ex.state.chapter ?? undefined))).toBe(
    fingerprint(s),
  );
});

// Synthetic protocol/semantic controls. These are not browser journey evidence.
import { createPerson } from '@adam0white/human-framework';
import {
  acceptPersona,
  acceptPersonaBatch,
  canonicalCast,
  createPersona,
  initialPersonaLife,
  type Lab,
  type PersonaEnvelope,
  type PersonaRequest,
  type PersonaShelfState,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { Continuity, watchShelfPreference } from '../src/continuity.ts';
import { queueInput, step } from '../src/sim/dam.ts';
import { residentTransfer } from '../src/sim/passport.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

const clock = 1_790_000_000_000;
async function source(id = 'nerys', peer = false) {
  const castId = `hf.cast.${id}.glance`;
  const c = canonicalCast(castId);
  const p = createPerson({
    id: peer ? castId : id,
    name: c.name,
    seed: 71,
    now: 555,
    bornAt: 555 - c.age * 525600,
    sex: id === 'nerys' ? 'female' : 'male',
    traits: c.traits,
    values: c.values,
    body: { fitness: 0.61 },
  });
  const captured = await residentTransfer(p);
  if (peer) {
    captured.transfer.castPassport = 'commonstead-cast/1';
    captured.transfer.person.person.mappingVersion = 'commonstead-calendar/1';
  }
  return createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: c.revision,
    branchId: `control-${castId}`,
    parentRevision: null,
    source: {
      game: peer ? 'commonstead' : 'glance',
      build: 'synthetic-control',
      engine: '2.17.0',
      rules: peer ? 'commonstead-3' : 'glance-3',
    },
    transfer: { ...captured.transfer, life: initialPersonaLife(castId, `control-${castId}`, clock) },
    limitations: captured.limitations,
  });
}
function harness(initial: PersonaEnvelope[] = [], now = clock) {
  let data: PersonaShelfState = { heads: {}, revisions: [] };
  for (const p of initial) data = acceptPersona(data, p);
  let allowed = false;
  let epoch = 'opaque-control-epoch';
  let rotate = false;
  let key: string | null = null;
  let delay: ((value: unknown) => void) | null = null;
  const requests: PersonaRequest[] = [];
  const lab = {
    setPersonaRecording: (value: string | null) => {
      if (key !== value) {
        allowed = value === null;
        key = value;
      }
    },
    allowPersonaRecording: (value: boolean) => {
      allowed = value;
    },
    build: () => ({ c: 'synthetic-control' }),
  } as unknown as Lab;
  const shelf = {
    enabled: true,
    ready: Promise.resolve(true),
    setEnabled(value: boolean) {
      this.enabled = value;
    },
    async request<T>(request: PersonaRequest): Promise<T> {
      requests.push(request);
      if (request.action === 'prepareBatch')
        return {
          expectedHeads: Object.fromEntries(
            (request.castIds ?? []).map((id) => [id, data.heads[id] ?? null]),
          ),
          inputs: (request.castIds ?? []).flatMap((id) => {
            const p = data.revisions.find((p) => p.revision === data.heads[id]);
            return p ? [preparePersonaLife(p, now)] : [];
          }),
          blocked: [],
        } as T;
      if (request.action === 'putBatch') {
        data = acceptPersonaBatch(data, request.envelopes ?? [], request.expectedHeads);
        return null as T;
      }
      if (request.action === 'put') {
        data = acceptPersona(data, request.envelope!, request.fork);
        return null as T;
      }
      if (request.action === 'recordingBatch') {
        if (new Set(request.envelopes?.map((p) => p.castId)).size !== request.envelopes?.length)
          throw new Error('Batch requires distinct cast IDs');
        const response = {
          sameEpoch: request.allowRecording === true,
          revisions: request.envelopes?.map((p) => p.revision) ?? [],
          recordingEpoch: epoch,
        };
        if (request.allowRecording && rotate) {
          rotate = false;
          epoch = 'different-control-epoch';
          response.recordingEpoch = epoch;
        }
        if (delay) {
          const release = delay;
          delay = null;
          return await new Promise<T>((resolve) => release(() => resolve(response as T)));
        }
        return response as T;
      }
      return { recordingEpoch: 'opaque-control-epoch' } as T;
    },
  };
  return {
    lab,
    shelf,
    requests,
    get data() {
      return data;
    },
    get allowed() {
      return allowed;
    },
    rotateAfterApproval() {
      rotate = true;
    },
    defer(callback: (resume: unknown) => void) {
      delay = callback;
    },
  };
}

it('preflights all five heads then atomically claims two, preserving actual state and deterministic replay', async () => {
  const n = await source('nerys', true),
    c = await source('callum');
  const h = harness([n, c]);
  const runtime = new Continuity(h.lab, h.shelf);
  const s = await runtime.fresh(7);
  expect(s.chapter?.inputs).toHaveLength(2);
  expect(h.requests.filter((r) => r.action === 'putBatch')).toHaveLength(1);
  expect(Object.keys(h.requests.find((r) => r.action === 'putBatch')!.expectedHeads!)).toHaveLength(5);
  expect(s.people.find((p) => p.id === 'nerys')!.body.fitness).toBe(0.61);
  expect(s.people.find((p) => p.id === 'callum')!.traits).toEqual((c.transfer.person as any).person.traits);
  queueInput(s, { kind: 'ring' });
  step(s);
  expect(fingerprint(importCurrent(exportCurrent(s)))).toBe(fingerprint(s));
  const loaded = await runtime.loadLocal(runtime.localSave(s));
  expect(runtime.heads.map((p) => p.revision)).toEqual(s.chapter!.claims.map((p) => p.revision));
  await runtime.importFile(JSON.stringify(exportCurrent(loaded)));
  expect(runtime.heads).toHaveLength(0);
  expect(runtime.fileOrigin).toBe(true);
  await runtime.recording();
  expect(h.allowed).toBe(false);
  await runtime.recording(true);
});
it('fails the whole admission before CAS on one unsupported person or dam qualification', async () => {
  const n = await source('nerys', true),
    d = await source('dai', true);
  const h = harness([n, d]);
  const runtime = new Continuity(h.lab, h.shelf);
  await expect(runtime.fresh(7)).rejects.toThrow(/dam operating/);
  expect(h.requests.some((r) => r.action === 'putBatch')).toBe(false);
  expect(h.data.heads[n.castId]).toBe(n.revision);
});

it('consumes seeded away-life through actual extra-work availability and preserves pinned clock', async () => {
  const n = await source('nerys', true);
  let found = false;
  for (let days = 1; days < 12; days++) {
    const h = harness([n], clock + days * 86400000);
    const runtime = new Continuity(h.lab, h.shelf);
    const s = await runtime.fresh(7);
    const life = s.life.nerys!;
    expect(life).toBeDefined();
    if (!life.availableForExtraWork) {
      found = true;
      expect(s.chapter!.inputs[0]!.clockMs).toBeGreaterThan(clock);
      expect((await runtime.loadLocal(runtime.localSave(s))).life.nerys).toEqual(life);
      break;
    }
  }
  expect(found).toBe(true);
});

it('continues its exact accepted head after local reload, and refuses a competing chapter without retry', async () => {
  const n = await source('nerys', true);
  const h = harness([n]);
  const runtime = new Continuity(h.lab, h.shelf);
  const s = await runtime.fresh(7);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  step(s);
  queueInput(s, { kind: 'pause' });
  for (let i = 0; i < 100 && !s.chapterPaused; i++) step(s);
  expect(s.chapterPaused).toBe(true);
  await runtime.checkpoint(n.castId);
  const saved = runtime.localSave(s),
    own = runtime.heads[0]!.revision;
  await runtime.loadLocal(saved);
  await runtime.checkpoint(n.castId);
  expect(runtime.heads[0]!.parentRevision).toBe(own);
  const rival = new Continuity(h.lab, h.shelf);
  await rival.fresh(8);
  await expect(runtime.checkpoint(n.castId)).rejects.toThrow();
  expect(runtime.heads[0]!.revision).not.toBe(h.data.heads[n.castId]);
});

it('terminal closure prevents another fresh admission and remains run-owned on reload', async () => {
  const n = await source('nerys', true);
  const h = harness([n]);
  const runtime = new Continuity(h.lab, h.shelf);
  const s = await runtime.fresh(7);
  queueInput(s, { kind: 'ring' });
  step(s);
  s.people.find((p) => p.id === 'nerys')!.body.alive = false; // synthetic actual-owned-death protocol control
  await runtime.checkpoint(n.castId);
  expect(runtime.heads[0]!.terminal).toBeDefined();
  const other = new Continuity(h.lab, h.shelf);
  await expect(other.fresh(8)).rejects.toThrow();
});
it('resumes a paused watch through the same logged control in live play and replay', () => {
  const s = newGame(7);
  queueInput(s, { kind: 'pause' });
  step(s);
  for (let i = 0; i < 100 && !s.chapterPaused; i++) step(s);
  expect(s.chapterPaused).toBe(true);
  queueInput(s, { kind: 'resume' });
  expect(s.chapterPaused).toBe(false);
  step(s);
  expect(fingerprint(importCurrent(exportCurrent(s)))).toBe(fingerprint(s));
});
it('carried Nerys availability changes an ordinary night-two river call', async () => {
  const n = await source('nerys', true);
  let s: ReturnType<typeof newGame> | undefined;
  for (let day = 1; day < 12; day++) {
    const h = harness([n], clock + day * 86400000);
    const runtime = new Continuity(h.lab, h.shelf);
    const candidate = await runtime.fresh(7);
    if (!candidate.life.nerys?.availableForExtraWork) {
      s = candidate;
      break;
    }
  }
  expect(s).toBeDefined();
  if (!s) throw new Error('control not found');
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
  while (s.phase === 'watch') step(s);
  expect(s.phase).toBe('dawn');
  queueInput(s, { kind: 'next' });
  queueInput(s, { kind: 'ring' });
  step(s);
  expect(s.nerys.ringing).toBeNull();
  expect(s.said.at(-1)?.text).toContain('half past');
  for (let i = 0; i < 30; i++) step(s);
  queueInput(s, { kind: 'ring' });
  step(s);
  expect(s.nerys.ringing).not.toBeNull();
});

it('recording preference changes do not cancel a chapter waiting for the shelf', async () => {
  const h = harness();
  let finish: (value: boolean) => void = () => {};
  h.shelf.ready = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const continuity = new Continuity(h.lab, h.shelf);
  const events = new EventTarget();
  const stop = watchShelfPreference(() => continuity.invalidate(), events);
  const pending = continuity.fresh(42);
  events.dispatchEvent(new Event('hf-lab-preference'));
  events.dispatchEvent(Object.assign(new Event('storage'), { key: 'hf-persona-recording:old-history' }));
  finish(true);
  await expect(pending).resolves.toBeDefined();
  stop();
});

it('browser-person continuity changes still cancel a chapter waiting for the shelf', async () => {
  const h = harness();
  let finish: (value: boolean) => void = () => {};
  h.shelf.ready = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const continuity = new Continuity(h.lab, h.shelf);
  const events = new EventTarget();
  const stop = watchShelfPreference(() => continuity.invalidate(), events);
  const pending = continuity.fresh(42);
  events.dispatchEvent(new Event('hf-persona-preference'));
  finish(true);
  await expect(pending).rejects.toThrow(/changed/i);
  stop();
});

it('recording metadata and checkpoint publication do not query historical recording permission', async () => {
  const h = harness();
  const request = h.shelf.request.bind(h.shelf);
  h.shelf.request = async (r) => {
    if (r.action === 'recording' || r.action === 'recordingBatch') throw new Error('obsolete recording RPC');
    return request(r);
  };
  const c = new Continuity(h.lab, h.shelf);
  const state = await c.fresh(42);
  queueInput(state, { kind: 'ask', keeper: 'dai', job: 'level' });
  step(state);
  queueInput(state, { kind: 'pause' });
  for (let i = 0; i < 100 && !state.chapterPaused; i++) step(state);
  await c.recording(true);
  await c.deny();
  await c.checkpoint('hf.cast.nerys.glance');
});
