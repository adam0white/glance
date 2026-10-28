// @vitest-environment happy-dom
// Scope: one actual optional viewing. No personality tuning, seed search or private actor mutation.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lab } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { ALLOCATION, discoveriesFor } from '../src/sim/cast.ts';
import {
  cloneState,
  type GameState,
  newGame,
  queueInput,
  replay,
  restoreState,
  step,
} from '../src/sim/dam.ts';
import { cornerSky } from '../src/sim/private-scenes.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { skyStreak, viewingAvailable, viewingStatus } from '../src/sim/viewing.ts';
import { required } from './required.ts';

function minute(s: GameState) {
  if (s.phase === 'dawn') queueInput(s, { kind: 'next' });
  if (s.minute % 1440 === 1321) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
  for (const person of discoveriesFor(s)) {
    const at = s.conversations[person];
    if (at === undefined || s.minute - at >= 20) queueInput(s, { kind: 'talk', person });
  }
  step(s);
}
function until(s: GameState, done: () => boolean) {
  for (let n = 0; n < 12000 && s.phase !== 'end' && !done(); n++) minute(s);
  expect(done()).toBe(true);
}
it('requires a new public invitation after disclosure and real voluntary travel', () => {
  const s = newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  until(s, () => !!s.discoveries.nerys);
  expect(s).not.toHaveProperty('viewing');
  queueInput(s, { kind: 'viewing', action: 'invite' });
  step(s);
  expect(s).toHaveProperty('viewing.away', true);
  expect(s.people.find((p) => p.id === 'nerys')?.activity?.affordanceId).toBe('sky-walk');
});

const copy = (s: GameState) => restoreState(cloneState(s));
function disclosed() {
  const s = newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  until(s, () => !!s.discoveries.nerys);
  return s;
}
function invite() {
  const s = disclosed();
  queueInput(s, { kind: 'viewing', action: 'invite' });
  step(s);
  return s;
}
function returned(s: GameState) {
  queueInput(s, { kind: 'viewing', action: 'return' });
  step(s);
  until(s, () => !required(s.viewing).away);
  expect(required(s.viewing).returnedAt).toBe(required(required(s.viewing).returnFrom) + 5);
}
let proofId = 0;
function proof(source: GameState) {
  // Native copy uses real compact execution; HF restore may change object key insertion order.
  // Compare every source value, then freeze the actual replay's full bytes without normalization.
  const s = replay(
    source.seed,
    source.inputs,
    source.minute,
    source.chapter ?? undefined,
    source.rules,
    source.applied,
  );
  expect(exportCurrent(s)).toEqual(exportCurrent(source));
  const id = ++proofId,
    raw = JSON.stringify(exportCurrent(s));
  const full = importCurrent(JSON.parse(raw));
  const compact = replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules, s.applied);
  const native = copy(s);
  const retain = (name: string, state: GameState) => {
    const dir = process.env.GLANCE_VIEWING_PROOF_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}-${name}.json`), JSON.stringify(exportCurrent(state)));
    }
  };
  for (const [name, state] of Object.entries({ initial: s, full, compact, native })) {
    expect(exportCurrent(state)).toEqual(exportCurrent(s));
    if (state !== native) expect(JSON.stringify(exportCurrent(state)) === raw).toBe(true);
    retain(name, state);
  }
  // A full day of actual continuation, including next-watch handling and HF histories.
  if (s.chapterPaused) for (const state of [s, full, compact, native]) queueInput(state, { kind: 'resume' });
  const deadline = s.minute + 1440;
  while (s.phase !== 'end' && s.minute < deadline)
    for (const state of [s, full, compact, native]) minute(state);
  for (const [name, state] of Object.entries({ continued: s, full, compact, native })) {
    expect(exportCurrent(state)).toEqual(exportCurrent(s));
    retain(`1440-${name}`, state);
  }
}
it('records real attendance and the fixed seed weather interruption; never awards an unseen event or a free return', () => {
  const s = invite(),
    before = copy(s);
  expect(required(s.viewing).source).toContain('Clear skies are not a service I can promise.');
  until(s, () => required(s.viewing).stage === 'watching');
  expect(required(s.viewing).arrivedAt).toBe(required(required(s.viewing).departedAt) + 5);
  expect(required(required(s.people.find((p) => p.id === 'nerys')).activity).affordanceId).toBe('sky-watch');
  proof(copy(s));
  until(s, () => required(s.viewing).stage === 'waiting');
  expect(required(s.viewing).attended).toBe(3);
  expect(cornerSky(s.seed, s.night, required(required(s.viewing).stoppedAt))).toBe('rain');
  expect(required(s.viewing).known).toEqual([]);
  expect(required(s.viewing).finishedAt).toBeUndefined();
  expect(required(s.viewing).away).toBe(true);
  const from = s.minute,
    reports = s.reports.filter((r) => r.who === 'nerys').length;
  queueInput(s, { kind: 'ring' });
  step(s);
  for (let i = 0; i < 8; i++) minute(s);
  expect(s.nerys.ringing).toBeNull();
  expect(s.reports.filter((r) => r.who === 'nerys')).toHaveLength(reports);
  expect(required(s.viewing).returnedAt).toBeUndefined();
  expect(s.said.filter((x) => x.who === 'nerys' && x.at >= from)).toEqual([]);
  expect(viewingStatus(s)).toContain('separately chosen');
  proof(copy(s));
  returned(s);
  expect(required(s.viewing).stoppedAt).toBeDefined();
  expect(required(s.viewing).finishedAt).toBeUndefined();
  queueInput(s, { kind: 'ring' });
  step(s);
  expect(s.nerys.ringing).not.toBeNull();
  proof(copy(s));
  // World occurrence is stable despite the actual invitation/actor RNG history.
  for (let at = 2780; at < 2820; at++) expect(skyStreak(s.seed, 2, at)).toBe(skyStreak(before.seed, 2, at));
});
it('keeps interrupted absence through pause, watch change and ordinary calls with no phantom inn speech', () => {
  const s = invite();
  queueInput(s, { kind: 'ring' });
  step(s);
  expect(required(s.viewing).stoppedAt).toBeDefined();
  expect(required(s.viewing).arrivedAt).toBeUndefined();
  expect(s.nerys.ringing).toBeNull();
  queueInput(s, { kind: 'pause' });
  until(s, () => s.chapterPaused);
  proof(copy(s));
  queueInput(s, { kind: 'resume' });
  step(s);
  until(s, () => s.night === 3);
  expect(required(s.viewing).away).toBe(true);
  const from = s.minute;
  for (let n = 0; n < 100; n++) minute(s);
  expect(s.said.filter((x) => x.who === 'nerys' && x.at >= from)).toEqual([]);
  expect(s.reports.filter((r) => r.who === 'nerys')).toEqual([]);
  expect(viewingAvailable(s, 'return')).toBeNull();
  queueInput(s, { kind: 'viewing', action: 'return' });
  step(s);
  expect(required(s.viewing).decisions.at(-1)?.action).toBe('return');
  if (required(s.viewing).stage === 'returning') {
    until(s, () => !required(s.viewing).away);
    expect(required(s.viewing).returnedAt).toBe(required(required(s.viewing).returnFrom) + 5);
  } else {
    expect(required(s.viewing).decisions.at(-1)?.result).toBe('refused');
    expect(required(s.viewing).away).toBe(true);
    expect(required(s.viewing).returnedAt).toBeUndefined();
  }
});
it('retains complete native and file state but refuses unsupported publication for every actor, including stripped idle history', async () => {
  const states: GameState[] = [invite()];
  const s = copy(required(states[0]));
  until(s, () => required(s.viewing).stage === 'watching');
  states.push(copy(s));
  until(s, () => required(s.viewing).stage === 'waiting');
  states.push(copy(s));
  returned(s);
  states.push(copy(s));
  queueInput(s, { kind: 'pause' });
  until(s, () => s.chapterPaused);
  states.push(copy(s));
  const ended = copy(s);
  queueInput(ended, { kind: 'resume' });
  until(ended, () => ended.phase === 'end');
  states.push(ended);
  for (const state of states) {
    const requests: unknown[] = [];
    const io = new Continuity(
      { setPersonaRecording() {}, build: () => ({ c: 'synthetic-viewing' }) } as unknown as Lab,
      {
        enabled: true,
        ready: Promise.resolve(),
        request: async (r: unknown) => {
          requests.push(r);
          throw Error('Unexpected shelf write');
        },
      } as never,
    );
    const wrapper = {
      run: exportCurrent(state),
      runId: 'synthetic-viewing-run',
      fileOrigin: false,
      heads: [],
      sources: [],
    };
    const raw = JSON.stringify(wrapper),
      loaded = await io.loadLocal(raw),
      before = io.localSave(loaded);
    for (const actor of ALLOCATION) await expect(io.checkpoint(actor.castId)).rejects.toThrow('passport');
    expect(await io.checkpointAll()).toEqual({ published: 0, refused: 5 });
    expect(io.localSave(loaded)).toBe(before);
    expect(requests).toEqual([]);
    const file = new Continuity({} as Lab, undefined, () => {}, true);
    const admitted = await file.importFile(raw);
    expect(exportCurrent(admitted)).toEqual(exportCurrent(state));
    expect(file.exportSession(admitted).original.text).toBe(raw);
    const again = new Continuity({} as Lab, undefined, () => {}, true);
    expect(exportCurrent(await again.importFile(JSON.stringify(file.exportSession(admitted))))).toEqual(
      exportCurrent(state),
    );
    const forged = structuredClone(wrapper);
    forged.run.inputs = forged.run.inputs.filter((i) => i.kind !== 'viewing');
    forged.run.state.inputs = structuredClone(forged.run.inputs);
    forged.run.state.applied = forged.run.inputs.length;
    delete forged.run.state.viewing;
    // Retain ALL actual changed Persons, source, clock and body history. No supported-label borrowing.
    await expect(io.loadLocal(JSON.stringify(forged))).rejects.toThrow(/replay|frontier/);
    await expect(file.importFile(JSON.stringify(forged))).rejects.toThrow(/replay|frontier/);
    expect(io.localSave(loaded)).toBe(before);
    expect(requests).toEqual([]);
    if (state.chapterPaused) {
      expect(state.people.every((p) => !p.activity)).toBe(true);
      loaded.inputs = loaded.inputs.filter((i) => i.kind !== 'viewing');
      loaded.applied = loaded.inputs.length;
      delete loaded.viewing;
      for (const actor of ALLOCATION)
        await expect(io.checkpoint(actor.castId)).rejects.toThrow(/replay|frontier/);
      expect(requests).toEqual([]);
      expect(io.sources).toEqual([]);
      expect(io.heads).toEqual([]);
    }
  }
}, 15000);

it('a fixed later invitation can miss the opportunity and is blocked by present rain without retrying', () => {
  const s = disclosed();
  until(s, () => s.minute === 2800); // Fixed 22:40 counterfactual, not a search for a winning sky.
  expect(cornerSky(s.seed, s.night, s.minute)).toBe('rain');
  expect(viewingAvailable(s, 'invite')).toContain('Rain');
  queueInput(s, { kind: 'viewing', action: 'invite' });
  step(s);
  expect(s.viewing).toBeUndefined();
  expect(s.people.find((p) => p.id === 'nerys')?.activity).toBeNull();
  expect(s.inputs.at(-1)?.kind).toBe('viewing');
});

// A completed viewing stays complete when the separately chosen return is interrupted.
it('reports interrupted return without denying the completed viewing or losing its record', () => {
  const s = disclosed();
  until(s, () => s.minute === 2820);
  queueInput(s, { kind: 'viewing', action: 'invite' });
  step(s);
  until(s, () => required(s.viewing).finishedAt !== undefined);
  const v = required(s.viewing);
  expect(v.arrivedAt).toBe(2825);
  expect(v.finishedAt).toBe(2845);
  expect(v.attended).toBe(20);
  const result = v.result;
  const known = structuredClone(v.known);
  queueInput(s, { kind: 'viewing', action: 'return' });
  step(s);
  expect(v.stage).toBe('returning');
  expect(v.returnFrom).toBe(2846);
  for (const action of ['ring', 'stop'] as const) {
    const branch = copy(s);
    if (action === 'ring') queueInput(branch, { kind: 'ring' });
    else queueInput(branch, { kind: 'viewing', action: 'stop' });
    step(branch);
    const actual = required(branch.viewing);
    expect(actual.finishedAt).toBe(2845);
    expect(actual.attended).toBe(20);
    expect(actual.result).toBe(result);
    expect(actual.known).toEqual(known);
    expect(actual.away).toBe(true);
    expect(actual.stage).toBe('waiting');
    expect(actual.returnedAt).toBeUndefined();
    expect(branch.nerys.ringing).toBeNull();
    const message = branch.said.findLast((line) => line.text.includes('Nerys remains away'))?.text;
    expect(message).toContain('completed viewing remains');
    expect(message).toContain('return was interrupted');
    expect(message).not.toContain('no completed viewing is awarded');
  }
  const outbound = invite();
  queueInput(outbound, { kind: 'ring' });
  step(outbound);
  expect(outbound.said.findLast((line) => line.text.includes('Nerys remains away'))?.text).toContain(
    'no completed viewing is awarded',
  );
  const rain = invite();
  until(rain, () => required(rain.viewing).stage === 'waiting');
  expect(rain.said.findLast((line) => line.text.includes('Nerys remains away'))?.text).toContain(
    'no completed viewing is awarded',
  );
});
