// @vitest-environment happy-dom
// SCOPE: a finite received rota, actual HF choices, physical absence and independent return.

import { mkdirSync, writeFileSync } from 'node:fs';
import { precommit } from '@adam0white/human-framework';
import type { Lab } from '@adam0white/lab-client';
import { beforeAll, expect, it } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { ALLOCATION, discoveriesFor } from '../src/sim/cast.ts';
import {
  cloneState,
  type GameState,
  hint,
  keeperAsleep,
  newGame,
  queueInput,
  replay,
  restoreState,
  step,
} from '../src/sim/dam.ts';
import { type OutcomeTask, outcomeAvailable } from '../src/sim/outcomes.ts';
import { rotaAvailable, rotaAway, rotaStatus } from '../src/sim/rota.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

function minute(s: GameState) {
  if (s.phase === 'dawn') queueInput(s, { kind: 'next' });
  if (s.minute % 1440 === 1321) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
  for (const person of discoveriesFor(s)) {
    const at = s.conversations[person];
    if (at === undefined || s.minute - at >= 20) queueInput(s, { kind: 'talk', person });
  }
  step(s);
}
function until(s: GameState, done: () => boolean, action?: OutcomeTask) {
  for (let i = 0; i < 12000 && s.phase !== 'end' && !done(); i++) {
    if (action && outcomeAvailable(s, action)) queueInput(s, { kind: 'outcome', task: action });
    minute(s);
  }
  expect(done(), `${action} reachable at ${s.minute}`).toBe(true);
}
function prepared() {
  const s = newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  until(s, () => s.outcomes?.handover.transferredAt !== undefined, 'handover');
  until(s, () => s.outcomes?.handover.completedAt !== undefined, 'handover-test');
  until(s, () => s.outcomes?.correction.filedAt !== undefined, 'correction');
  until(s, () => s.outcomes?.keeperScenes?.daiProposal !== undefined, 'dai-proposal');
  until(s, () => s.outcomes?.keeperScenes?.callumProposal !== undefined, 'callum-proposal');
  return s;
}
// Removing the new public receipt/reading path must fail without touching an actor.
it('offers a received rota after actual proposals and an attended five-minute reading', () => {
  const s = prepared();
  queueInput(s, { kind: 'outcome', task: 'rota-dai-read' });
  step(s);
  expect(s.outcomes).toHaveProperty('rota');
});

const copy = (s: GameState) => restoreState(cloneState(s));
const trip = (s: GameState) => s.outcomes!.rota!.trips.at(-1)!;
function readRota(id: 'dai' | 'callum') {
  const s = prepared();
  const action = id === 'dai' ? 'rota-dai-read' : 'rota-callum-read';
  until(s, () => rotaAvailable(s, action) === null);
  queueInput(s, { kind: 'outcome', task: action });
  step(s);
  until(s, () => s.outcomes!.rota!.offers.at(-1)?.readAt !== undefined);
  return s;
}
function depart(id: 'dai' | 'callum') {
  const s = readRota(id);
  const action = id === 'dai' ? 'rota-dai-leave' : 'rota-callum-home';
  expect(rotaAvailable(s, action), `${id} at ${s.minute}`).toBeNull();
  queueInput(s, { kind: 'outcome', task: action });
  step(s);
  expect(rotaAway(s, id), JSON.stringify(s.outcomes?.rota)).toBe(true);
  return s;
}
function retain(name: string, s: GameState) {
  const dir = process.env.GLANCE_ROTA_PROOF_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}.json`, JSON.stringify(exportCurrent(s)));
  }
}
// Actual body/clock/input, not a completed flag or a quoted approval, establishes this result.
it.each(['dai', 'callum'] as const)(
  'enacts %s’s received rota through voluntary attendance and a separate return',
  (id) => {
    const s = depart(id),
      o = s.outcomes!.rota!.offers.at(-1)!;
    const old = structuredClone(s.outcomes!.keeperScenes);
    expect(o.readAt).toBe(o.readFrom! + 5);
    if (id === 'callum') expect(o.correctionAt).toBe(s.outcomes!.correction.filedAt);
    expect(trip(s).attended).toBe(0);
    retain(`${id}-departed`, s);
    until(s, () => trip(s).arrivedAt !== undefined);
    expect(trip(s).arrivedAt).toBe(trip(s).departedAt + 10);
    if (id === 'callum') {
      expect(keeperAsleep(s, id)).toBe(true);
      expect(rotaStatus(s, id)).toContain('asleep at home');
    }
    retain(`${id}-arrived`, s);
    until(s, () => trip(s).intervalFinishedAt !== undefined);
    expect(trip(s).attended).toBe(120);
    expect(trip(s).intervalFinishedAt).toBe(trip(s).arrivedAt! + 120);
    expect(rotaAway(s, id)).toBe(true);
    expect(trip(s).returnedAt).toBeUndefined();
    retain(`${id}-finished`, s);
    const completed = copy(s);
    queueInput(s, { kind: 'outcome', task: 'rota-return' });
    step(s);
    expect(trip(s).returnFrom).toBeDefined();
    queueInput(s, { kind: 'ask', keeper: id, job: 'level' });
    step(s);
    expect(trip(s).intervalFinishedAt).toBe(trip(completed).intervalFinishedAt);
    expect(trip(s).attended).toBe(120);
    expect(trip(s).returnedAt).toBeUndefined();
    expect(rotaAway(s, id)).toBe(true);
    expect(s.keepers.find((k) => k.id === id)?.pending).toBeNull();
    retain(`${id}-return-interrupted`, s);
    queueInput(s, { kind: 'outcome', task: 'rota-return' });
    step(s);
    const from = trip(s).returnFrom!;
    until(s, () => !rotaAway(s, id));
    expect(trip(s).returnedAt).toBe(from + 10);
    expect(s.outcomes!.keeperScenes).toEqual(old);
    retain(`${id}-returned`, s);
    const full = importCurrent(exportCurrent(completed));
    const compact = replay(
      completed.seed,
      completed.inputs,
      completed.minute,
      completed.chapter ?? undefined,
      completed.rules,
      completed.applied,
    );
    for (const x of [full, compact]) expect(exportCurrent(x)).toEqual(exportCurrent(completed));
    const end = completed.minute + 1440;
    while (completed.minute < end && completed.phase !== 'end')
      for (const x of [completed, full, compact]) minute(x);
    for (const x of [full, compact]) expect(exportCurrent(x)).toEqual(exportCurrent(completed));
    retain(`${id}-1440`, completed);
  },
);
it('keeps refusal, expiry, lost cover and next-watch physical absence distinct from an agreed or completed interval', () => {
  const s = readRota('dai'),
    refused = copy(s);
  const p = refused.people.find((p) => p.id === 'dai')!;
  for (const [action, bias] of [
    ['walk', -1],
    ['wait', -1],
    ['stove', 1],
  ] as const)
    precommit(p, { action, bias, from: p.now - 1, to: p.now + 200 });
  queueInput(refused, { kind: 'outcome', task: 'rota-dai-leave' });
  step(refused);
  expect(rotaAway(refused, 'dai')).toBe(false);
  expect(refused.outcomes!.rota!.decisions.some((d) => d.result === 'refused')).toBe(true); // Public HF precommit is a synthetic opposing commitment, not a replayable game input.
  expect(() => importCurrent(exportCurrent(refused))).toThrow('replay');
  const expired = copy(s),
    deadline = s.outcomes!.rota!.offers.at(-1)!.departBy;
  until(expired, () => expired.minute > deadline);
  expect(expired.minute).toBeGreaterThan(deadline);
  expect(rotaAvailable(expired, 'rota-dai-leave')).not.toBeNull();
  queueInput(expired, { kind: 'outcome', task: 'rota-dai-leave' });
  step(expired);
  expect(rotaAway(expired, 'dai')).toBe(false);
  const away = depart('dai'),
    at = away.minute;
  queueInput(away, { kind: 'ask', keeper: 'callum', job: 'level' });
  step(away);
  expect(trip(away).interruptedAt).toBeDefined();
  expect(trip(away).intervalFinishedAt).toBeUndefined();
  expect(rotaAway(away, 'dai')).toBe(true);
  expect(hint(away, 'dai', 'level').forecast).toBe('');
  const next = away.night + 1;
  until(away, () => away.night === next);
  expect(rotaAway(away, 'dai')).toBe(true);
  expect(away.reports.some((r) => r.who === 'dai')).toBe(false);
  expect(away.said.filter((x) => x.at >= at && x.who === 'dai')).toEqual([]);
  expect(away.outcomes!.rota!.trips.at(-1)!.attended).toBe(0);
  retain('away-next-watch', away);
});

it('retains a stopped reading without agreement or physical departure', () => {
  const s = prepared();
  until(s, () => rotaAvailable(s, 'rota-callum-read') === null);
  queueInput(s, { kind: 'outcome', task: 'rota-callum-read' });
  step(s);
  queueInput(s, { kind: 'outcome', task: 'rota-stop' });
  step(s);
  expect(s.outcomes!.rota!.offers.at(-1)?.readAt).toBeUndefined();
  expect(s.outcomes!.rota!.offers.at(-1)?.stoppedAt).toBeDefined();
  expect(s.outcomes!.rota!.trips).toEqual([]);
  retain('reading-stopped', s);
});

// Independent finite native checkpoints; no repeated actor-validation or full replay matrix.
const nativeStates: Record<string, string> = {};
beforeAll(() => {
  const s = depart('dai');
  nativeStates.active = JSON.stringify(exportCurrent(s));
  const cancelled = copy(s);
  queueInput(cancelled, { kind: 'outcome', task: 'rota-stop' });
  step(cancelled);
  nativeStates.cancelled = JSON.stringify(exportCurrent(cancelled));
  until(s, () => trip(s).intervalFinishedAt !== undefined);
  nativeStates.completed = JSON.stringify(exportCurrent(s));
  queueInput(s, { kind: 'outcome', task: 'rota-return' });
  step(s);
  until(s, () => !rotaAway(s, 'dai'));
  nativeStates.returned = JSON.stringify(exportCurrent(s));
  const c = depart('callum');
  queueInput(c, { kind: 'pause' });
  until(c, () => c.chapterPaused);
  nativeStates.paused = JSON.stringify(exportCurrent(c));
  queueInput(c, { kind: 'resume' });
  step(c);
  until(c, () => c.phase === 'end');
  nativeStates.closed = JSON.stringify(exportCurrent(c));
});
const stages = ['active', 'cancelled', 'completed', 'returned', 'paused', 'closed'] as const;
function nativePacket(stage: (typeof stages)[number]) {
  const rawRun = JSON.parse(nativeStates[stage]!);
  const wrapper = { run: rawRun, runId: 'synthetic-rota', fileOrigin: false, heads: [], sources: [] };
  return { rawRun, wrapper, raw: JSON.stringify(wrapper) };
}
function localContinuity(requests: unknown[]) {
  return new Continuity(
    { setPersonaRecording() {}, build: () => ({ c: 'synthetic-rota' }) } as unknown as Lab,
    {
      enabled: true,
      ready: Promise.resolve(),
      request: async (r: unknown) => {
        requests.push(r);
        throw Error('Unexpected source write');
      },
    } as never,
  );
}
it.each(stages)('refuses %s publication before writes', async (stage) => {
  const { wrapper, raw } = nativePacket(stage);
  const requests: unknown[] = [];
  const io = localContinuity(requests);
  const loaded = await io.loadLocal(raw);
  const before = io.localSave(loaded);
  for (const actor of ALLOCATION) await expect(io.checkpoint(actor.castId)).rejects.toThrow('passport');
  expect(await io.checkpointAll()).toEqual({ published: 0, refused: 5 });
  expect(requests).toEqual([]);
  if (stage === 'paused') {
    const forged = structuredClone(wrapper);
    forged.run.inputs = forged.run.inputs.filter(
      (i: { kind: string; task?: string }) => !(i.kind === 'outcome' && i.task?.startsWith('rota-')),
    );
    expect(loaded.people.every((p) => !p.activity)).toBe(true);
    loaded.inputs = forged.run.inputs;
    loaded.applied = loaded.inputs.length;
    delete loaded.outcomes!.rota;
    for (const actor of ALLOCATION)
      await expect(io.checkpoint(actor.castId)).rejects.toThrow(/replay|frontier/);
  } else {
    expect(io.localSave(loaded)).toBe(before);
  }
  expect(io.sources).toEqual([]);
  expect(io.heads).toEqual([]);
  expect(requests).toEqual([]);
});
it.each(stages)('retains %s native file and reimports its full wrapper', async (stage) => {
  const { rawRun, wrapper, raw } = nativePacket(stage);
  const file = new Continuity({} as Lab, undefined, () => {}, true),
    admitted = await file.importFile(raw);
  expect(exportCurrent(admitted)).toEqual(rawRun);
  expect(file.exportSession(admitted).original.text).toBe(raw);
  expect(file.exportSession(admitted).provenance).toEqual(wrapper);
  const again = new Continuity({} as Lab, undefined, () => {}, true);
  expect(exportCurrent(await again.importFile(JSON.stringify(file.exportSession(admitted))))).toEqual(rawRun);
  retain(`native-${stage}`, admitted);
});
it.each(stages)('rejects %s stripped history without changing accepted state or writing', async (stage) => {
  const { wrapper, raw } = nativePacket(stage);
  const requests: unknown[] = [];
  const io = localContinuity(requests);
  const loaded = await io.loadLocal(raw);
  const before = io.localSave(loaded);
  const file = new Continuity({} as Lab, undefined, () => {}, true);
  const admitted = await file.importFile(raw);
  const forged = structuredClone(wrapper);
  forged.run.inputs = forged.run.inputs.filter(
    (i: { kind: string; task?: string }) => !(i.kind === 'outcome' && i.task?.startsWith('rota-')),
  );
  forged.run.state.inputs = structuredClone(forged.run.inputs);
  forged.run.state.applied = forged.run.inputs.length;
  delete forged.run.state.outcomes.rota;
  await expect(io.loadLocal(JSON.stringify(forged))).rejects.toThrow(/replay|frontier/);
  await expect(file.importFile(JSON.stringify(forged))).rejects.toThrow(/replay|frontier/);
  expect(io.localSave(loaded)).toBe(before);
  expect(file.exportSession(admitted).original.text).toBe(raw);
  expect(io.sources).toEqual([]);
  expect(io.heads).toEqual([]);
  expect(requests).toEqual([]);
});

// A pending checkpoint must not publish a newly changed world after an async wait.
it('refuses a checkpoint if a new rota is recorded while shelf readiness is pending', async () => {
  const initial = prepared();
  queueInput(initial, { kind: 'pause' });
  until(initial, () => initial.chapterPaused);
  const writes: unknown[] = [];
  let release = () => {};
  const shelf = {
    enabled: true,
    ready: Promise.resolve(),
    request: async (r: unknown) => {
      writes.push(r);
      return null;
    },
  };
  const io = new Continuity(
    { setPersonaRecording() {}, build: () => ({ c: 'race-control' }) } as unknown as Lab,
    shelf as never,
  );
  const loaded = await io.loadLocal(
    JSON.stringify({
      run: exportCurrent(initial),
      runId: 'race-control',
      heads: [],
      sources: [],
      fileOrigin: false,
    }),
  );
  shelf.ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = io.checkpoint('hf.cast.nerys.glance');
  await Promise.resolve();
  queueInput(loaded, { kind: 'resume' });
  step(loaded);
  queueInput(loaded, { kind: 'outcome', task: 'rota-dai-read' });
  step(loaded);
  queueInput(loaded, { kind: 'pause' });
  until(loaded, () => loaded.chapterPaused);
  expect(loaded.inputs.some((i) => i.kind === 'outcome' && i.task === 'rota-dai-read')).toBe(true);
  expect(loaded.people.every((p) => !p.activity)).toBe(true);
  release();
  await expect(pending).rejects.toThrow(/changed/);
  expect(writes).toEqual([]);
  expect(io.sources).toEqual([]);
  expect(io.heads).toEqual([]);
});

// Bilal is not a reader or cover keeper. His ordinary work cannot occupy or stop their reading.
it('keeps Bilal working independently during the two-keeper reading and still interrupts for either reader', () => {
  const s = prepared();
  expect(s.minute).toBe(4426);
  queueInput(s, { kind: 'recruit' });
  step(s);
  for (let n = 0; n < 150 && !s.keepers.some((k) => k.id === 'bilal' && k.on); n++) step(s);
  expect(s.minute).toBe(4475);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'stove' });
  queueInput(s, { kind: 'ask', keeper: 'callum', job: 'stove' });
  step(s);
  expect(rotaAvailable(s, 'rota-dai-read')).toBeNull();
  queueInput(s, { kind: 'outcome', task: 'rota-dai-read' });
  step(s);
  expect(s.outcomes!.rota!.offers.at(-1)!.readFrom).toBe(4476);
  expect(
    s.people
      .filter((p) => p.id === 'dai' || p.id === 'callum')
      .every((p) => p.activity?.affordanceId === 'rota-read'),
  ).toBe(true);
  for (const id of ['dai', 'callum'] as const) {
    const reader = copy(s);
    queueInput(reader, { kind: 'ask', keeper: id, job: 'level' });
    step(reader);
    expect(reader.outcomes!.rota!.offers.at(-1)!.stoppedAt).toBeDefined();
  }
  queueInput(s, { kind: 'ask', keeper: 'bilal', job: 'level' });
  step(s);
  expect(s.outcomes!.rota!.offers.at(-1)!.stoppedAt).toBeUndefined();
  expect(s.keepers.find((k) => k.id === 'bilal')!.night.asked).toBe(1);
  until(s, () => s.outcomes!.rota!.offers.at(-1)!.readAt !== undefined);
  expect(s.outcomes!.rota!.offers.at(-1)!.readAt).toBe(4481);
  expect(s.keepers.find((k) => k.id === 'bilal')!.pending).toBeNull();
  expect(s.people.find((p) => p.id === 'bilal')!.activity).toMatchObject({
    affordanceId: 'stove',
    startedAt: 4477,
  });
  expect(s.people.find((p) => p.id === 'bilal')!.now).toBeGreaterThanOrEqual(4481);
  expect(s.said.some((line) => line.who === 'bilal' && line.at >= 4477)).toBe(true);
  expect(importCurrent(exportCurrent(s)).outcomes!.rota!.offers.at(-1)!.readAt).toBe(4481);
});
