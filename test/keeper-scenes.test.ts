// @vitest-environment happy-dom
import type { Lab } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { discoveriesFor } from '../src/sim/cast.ts';
import {
  cloneState,
  type GameState,
  newGame,
  queueInput,
  replay,
  restoreState,
  step,
} from '../src/sim/dam.ts';
import type { OutcomeTask } from '../src/sim/outcomes.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

function minute(s: GameState, action?: string) {
  if (s.phase === 'dawn') {
    queueInput(s, { kind: 'next' });
    return;
  }
  if (s.minute % 1440 === 1321) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
  for (const person of discoveriesFor(s)) {
    const first = s.conversations[person];
    if (first === undefined || s.minute - first >= 20) queueInput(s, { kind: 'talk', person });
  }
  if (action && s.night >= 3 && s.minute % 5 === 0)
    queueInput(s, { kind: 'outcome', task: action as OutcomeTask });
  step(s);
}
function until(s: GameState, done: () => boolean, action?: string) {
  for (let n = 0; n < 12000 && s.phase !== 'end' && !done(); n++) minute(s, action);
  expect(done(), `${action} reachable before watch end`).toBe(true);
}
function start() {
  return newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
}
function copy(s: GameState) {
  return restoreState(cloneState(s));
}
function family(s: GameState) {
  return s.outcomes?.keeperScenes;
}
function ask(s: GameState, keeper: 'dai' | 'callum', job: 'level' | 'nap' = 'level') {
  queueInput(s, { kind: 'ask', keeper, job });
  step(s);
}

// Would fail if a biography or an invitation awarded completion without chosen, elapsed activity.
it('costs willing keeper time for proposals and voicemail; a visit needs departure, attendance and return', async () => {
  const s = start();
  expect(family(s)).toBeUndefined();
  queueInput(s, { kind: 'outcome', task: 'daughter-visit' as OutcomeTask });
  step(s);
  expect(family(s)).toBeUndefined();
  until(s, () => !!family(s)?.voicemail, 'daughter-voicemail');
  expect(family(s)?.invitation).toBeUndefined();
  queueInput(s, { kind: 'outcome', task: 'daughter-invitation' as OutcomeTask });
  step(s);
  expect(family(s)?.invitation?.night).toBe(s.night);
  until(s, () => family(s)?.active !== undefined, 'daughter-visit');
  const at = family(s)!.attempts[family(s)!.active!]!;
  expect(at.action).toBe('daughter-visit');
  expect(at.attended).toBe(0);
  expect(at.completedAt).toBeUndefined();
  const beginning = copy(s);
  until(s, () => !!at.completedAt);
  expect(at.arrivedAt).toBe(at.from + 10);
  expect(at.attended).toBe(20);
  expect(at.returnedAt).toBe(at.from + 40);
  expect(at.completedAt).toBe(at.returnedAt);
  expect(family(s)?.away).toBeUndefined();
  until(s, () => !!family(s)?.daiProposal, 'dai-proposal');
  const d = family(s)!.daiProposal!;
  expect(d.at - d.startedAt).toBe(20);
  expect(d.status).toBe('proposal-awaiting-response');
  expect(d.costs.coverMinutes).toBe(40);
  expect(d.costs.retirementDate).toBeNull();
  until(s, () => !!family(s)?.callumProposal, 'callum-proposal');
  const c = family(s)!.callumProposal!;
  expect(c.at - c.startedAt).toBe(20);
  expect(c.costs.requestedHomeRestMinutes).toBe(120);
  expect(c.status).toBe('proposal-awaiting-response');
  expect(c.responses).toEqual({ agency: 'unsupplied', partner: 'unsupplied' });
  // Both complete export and compact replay reconstruction enter the real memory-only file controller.
  for (const checkpoint of [beginning, s]) {
    const rawCheckpoint = exportCurrent(checkpoint);
    const compactCheckpoint = replay(
      checkpoint.seed,
      checkpoint.inputs,
      checkpoint.minute,
      checkpoint.chapter ?? undefined,
      checkpoint.rules,
      checkpoint.applied,
    );
    for (const source of [
      rawCheckpoint,
      {
        run: exportCurrent(compactCheckpoint),
        runId: 'synthetic-family',
        fileOrigin: false,
        heads: [],
        sources: [],
      },
    ]) {
      const controller = new Continuity({} as Lab, undefined, () => {}, true);
      const loaded = await controller.importFile(JSON.stringify(source));
      expect(exportCurrent(loaded)).toEqual(rawCheckpoint);
      expect(controller.heads).toEqual([]);
      for (let i = 0; i < 12; i++) minute(loaded);
      const envelope = controller.exportSession(loaded);
      const again = new Continuity({} as Lab, undefined, () => {}, true);
      expect(exportCurrent(await again.importFile(JSON.stringify(envelope)))).toEqual(exportCurrent(loaded));
      expect(envelope.original.text).toBe(JSON.stringify(source));
      expect(envelope.provenance).toEqual('run' in source ? source : null);
    }
  }
  const raw = exportCurrent(beginning);
  const full = importCurrent(raw);
  const compact = replay(
    raw.seed,
    raw.inputs,
    raw.state.minute,
    raw.state.chapter ?? undefined,
    raw.state.rules,
    raw.state.applied,
  );
  expect(exportCurrent(full)).toEqual(raw);
  expect(exportCurrent(compact)).toEqual(raw);
  for (let i = 0; i < 65; i++) for (const x of [beginning, full, compact]) minute(x);
  expect(exportCurrent(full)).toEqual(exportCurrent(beginning));
  expect(exportCurrent(compact)).toEqual(exportCurrent(beginning));
});

// Would fail if missing cover, duty interruption or an early return still awarded a visit.
it('blocks unavailable cover and preserves actual absence and incomplete attendance across duty and stop', () => {
  const s = start();
  until(s, () => !!family(s)?.voicemail, 'daughter-voicemail');
  queueInput(s, { kind: 'outcome', task: 'daughter-invitation' as OutcomeTask });
  step(s);
  const busy = copy(s);
  ask(busy, 'callum');
  queueInput(busy, { kind: 'outcome', task: 'daughter-visit' as OutcomeTask });
  step(busy);
  expect(family(busy)?.away).toBeUndefined();
  until(s, () => family(s)?.away !== undefined, 'daughter-visit');
  const absent = copy(s);
  ask(absent, 'dai');
  expect(absent.keepers.find((k) => k.id === 'dai')?.pending).toBeNull();
  expect(absent.keepers.find((k) => k.id === 'dai')?.job).toBeNull();
  expect(family(absent)?.attempts.find((a) => a.action === 'daughter-visit')?.completedAt).toBeUndefined();
  const cut = copy(s);
  ask(cut, 'callum');
  expect(family(cut)?.away).toBeDefined();
  const trip = family(cut)!.attempts.find((a) => a.action === 'daughter-visit')!;
  expect(trip.stoppedAt).toBeDefined();
  expect(trip.completedAt).toBeUndefined();
  until(cut, () => family(cut)?.away === undefined, 'daughter-return');
  expect(trip.returnedAt).toBeGreaterThanOrEqual((trip.stoppedAt ?? 0) + 10);
  expect(trip.completedAt).toBeUndefined();
  expect(exportCurrent(importCurrent(exportCurrent(cut)))).toEqual(exportCurrent(cut));
});

// Break caught: completing a visit at a radio outage, or allowing stop/pause to erase absence.
it('retains interrupted attendance and physical absence at the actual radio outage, stop and pause', () => {
  const s = start();
  until(s, () => !!family(s)?.daiProposal, 'dai-proposal');
  until(s, () => !!family(s)?.callumProposal, 'callum-proposal');
  until(s, () => !!family(s)?.voicemail, 'daughter-voicemail');
  queueInput(s, { kind: 'outcome', task: 'daughter-invitation' });
  step(s);
  until(s, () => family(s)?.away !== undefined, 'daughter-visit');
  for (const input of [{ kind: 'outcome', task: 'stop-family' } as const, { kind: 'pause' } as const]) {
    const cut = copy(s);
    queueInput(cut, input);
    step(cut);
    expect(family(cut)?.away).toBeDefined();
    expect(family(cut)?.attempts.at(-1)?.stoppedAt).toBeDefined();
    expect(family(cut)?.attempts.at(-1)?.completedAt).toBeUndefined();
    expect(exportCurrent(importCurrent(exportCurrent(cut)))).toEqual(exportCurrent(cut));
  }
  until(s, () => s.radioOut);
  const trip = family(s)!.attempts.at(-1)!;
  expect(trip.arrivedAt).toBeDefined();
  expect(trip.attended).toBe(20);
  expect(trip.completedAt).toBeUndefined();
  expect(trip.returnedAt).toBeUndefined();
  expect(trip.stoppedAt).toBeDefined();
  queueInput(s, { kind: 'outcome', task: 'daughter-return' });
  step(s);
  expect(family(s)?.active).toBeUndefined();
  const raw = exportCurrent(s);
  const restored = importCurrent(raw);
  const compact = replay(
    raw.seed,
    raw.inputs,
    raw.state.minute,
    raw.state.chapter ?? undefined,
    raw.state.rules,
    raw.state.applied,
  );
  for (let i = 0; i < 40; i++) for (const state of [s, restored, compact]) minute(state, 'daughter-return');
  expect(exportCurrent(restored)).toEqual(exportCurrent(s));
  expect(exportCurrent(compact)).toEqual(exportCurrent(s));
  expect(trip.completedAt).toBeUndefined();
});
