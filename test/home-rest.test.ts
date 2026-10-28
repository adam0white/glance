// @vitest-environment happy-dom
// SCOPE: real public HF participation and whole-world replay for one authored home-rest interval.
// No actor/body/RNG mutation or winning stub. Synthetic shelf IO is isolated from simulation.
import { precommit, setDozeContext, snapshot, tick } from '@adam0white/human-framework';
import type { Lab } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { discoveriesFor } from '../src/sim/cast.ts';
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
import { type KeeperSceneAction, keeperSceneAvailable } from '../src/sim/keeper-scenes.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

const copy = (s: GameState) => restoreState(cloneState(s));
function minute(s: GameState) {
  if (s.phase === 'dawn') queueInput(s, { kind: 'next' });
  if (s.minute % 1440 === 1321) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
  for (const person of discoveriesFor(s)) {
    const at = s.conversations[person];
    if (at === undefined || s.minute - at >= 20) queueInput(s, { kind: 'talk', person });
  }
  step(s);
}
function until(s: GameState, done: () => boolean, action?: KeeperSceneAction) {
  for (let n = 0; n < 12000 && s.phase !== 'end' && !done(); n++) {
    if (
      action &&
      (action !== 'callum-home-rest' || s.minute % 1440 >= 1345 || s.minute % 1440 < 220) &&
      keeperSceneAvailable(s, action)
    )
      queueInput(s, { kind: 'outcome', task: action });
    minute(s);
  }
  expect(done(), `${action} reachable at ${s.minute}`).toBe(true);
}
function ready(seed = 7) {
  const s = newGame(seed, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  until(s, () => !!s.outcomes?.keeperScenes?.callumProposal, 'callum-proposal');
  return s;
}
const home = (s: GameState) => s.outcomes?.keeperScenes?.homeRequests?.at(-1);
// Removing actual travel, rest attendance, voluntary cover or separate return breaks this control.
it('runs a public seeded proposal, willing cover, home travel and actual rest before a separately chosen return', () => {
  const s = ready();
  const proposal = structuredClone(s.outcomes!.keeperScenes!.callumProposal);
  const noRequest = copy(s),
    beforeWater = structuredClone(s.water);
  until(s, () => home(s)?.departedAt !== undefined, 'callum-home-rest');
  expect(s.people.find((p) => p.id === 'callum')?.activity?.startedAt).toBe(home(s)!.departedAt);
  const at = copy(s);
  until(s, () => home(s)?.restCompletedAt !== undefined);
  const h = home(s)!;
  expect(h.arrivedAt).toBe(h.departedAt! + 10);
  expect(h.homeMinutes).toBe(120);
  expect(h.completedAt).toBeUndefined();
  expect(h.returnedAt).toBeUndefined();
  until(s, () => home(s)?.returnedAt !== undefined, 'callum-home-return');
  expect(h.returnedAt).toBe(h.returnFrom! + 10);
  expect(h.completedAt).toBe(h.returnedAt);
  expect(h.coveredMinutes).toBe(h.returnedAt! - h.departedAt!);
  expect(h.coveredMinutes).toBeGreaterThanOrEqual(140);
  expect(h.coveredMinutes).toBeLessThanOrEqual(150);
  while (noRequest.minute < s.minute) minute(noRequest);
  expect(noRequest.outcomes?.keeperScenes?.homeRequests).toBeUndefined();
  expect(s.water).not.toEqual(beforeWater);
  expect(s.people.map((p) => p.id)).toEqual(noRequest.people.map((p) => p.id));
  expect(s.people.map((p) => p.now)).toEqual(noRequest.people.map((p) => p.now));
  expect(s.people.find((p) => p.id === 'callum')?.body).not.toEqual(
    noRequest.people.find((p) => p.id === 'callum')?.body,
  );
  expect(s.outcomes!.keeperScenes!.callumProposal).toEqual(proposal);
  expect(h.inputIndex).toBeGreaterThan(0);
  expect(s.inputs[h.inputIndex]).toMatchObject({
    at: h.requestedAt,
    kind: 'outcome',
    task: 'callum-home-rest',
  });
  expect(h.events.map((e) => e.status)).toEqual([
    'pending',
    'accepted',
    'departed',
    'arrived',
    'completed',
    'returned',
  ]);
  const full = importCurrent(exportCurrent(at));
  const small = replay(at.seed, at.inputs, at.minute, at.chapter ?? undefined, at.rules, at.applied);
  for (const x of [full, small]) expect(exportCurrent(x)).toEqual(exportCurrent(at));
  for (let i = 0; i < 160; i++) for (const x of [at, full, small]) minute(x);
  expect(exportCurrent(full)).toEqual(exportCurrent(at));
  expect(exportCurrent(small)).toEqual(exportCurrent(at));
});

function departed() {
  const s = ready();
  until(s, () => home(s)?.departedAt !== undefined, 'callum-home-rest');
  return s;
}
function returnHome(s: GameState) {
  if (s.pauseRequested || s.chapterPaused) queueInput(s, { kind: 'resume' });
  until(s, () => home(s)?.returnedAt !== undefined, 'callum-home-return');
}
// A duty request cannot teleport Callum; cover loss and pause cannot erase earned home time.
it('preserves absence and earned time through unavailable cover, public duty, stop, pause, radio loss and a later legal return', () => {
  const s = departed();
  until(s, () => home(s)!.homeMinutes === 12);
  for (const input of [
    { kind: 'ask', keeper: 'callum', job: 'gate', target: 6 },
    { kind: 'ask', keeper: 'dai', job: 'nap' },
    { kind: 'outcome', task: 'stop-family' },
    { kind: 'pause' },
  ] as const) {
    const cut = copy(s),
      earned = home(cut)!.homeMinutes;
    queueInput(cut, input);
    step(cut);
    expect(home(cut)?.interruptedAt).toBeDefined();
    expect(home(cut)?.homeMinutes).toBe(earned);
    expect(cut.outcomes?.keeperScenes?.homeAway).toBeDefined();
    expect(home(cut)?.completedAt).toBeUndefined();
    expect(cut.keepers.find((k) => k.id === 'callum')?.pending).toBeNull();
    expect(cut.keepers.find((k) => k.id === 'callum')?.job).toBeNull();
    expect(exportCurrent(importCurrent(exportCurrent(cut)))).toEqual(exportCurrent(cut));
    returnHome(cut);
    expect(home(cut)?.returnedAt).toBe(home(cut)!.returnFrom! + 10);
    expect(home(cut)?.completedAt).toBeUndefined();
    const restored = importCurrent(exportCurrent(cut));
    for (let n = 0; n < 40; n++) for (const x of [cut, restored]) minute(x);
    expect(exportCurrent(restored)).toEqual(exportCurrent(cut));
  }
  const unavailable = ready();
  until(unavailable, () => keeperSceneAvailable(unavailable, 'callum-home-rest'));
  queueInput(unavailable, { kind: 'ask', keeper: 'dai', job: 'level' });
  queueInput(unavailable, { kind: 'outcome', task: 'callum-home-rest' });
  step(unavailable);
  expect(home(unavailable)?.events.at(-1)?.status).toBe('refused');
  expect(home(unavailable)?.departedAt).toBeUndefined();
  // Thursday's actual ordinary radio schedule, with no changed world or actor.
  const radio = ready();
  until(
    radio,
    () => radio.night === 4 && radio.minute % 1440 >= 1345 && keeperSceneAvailable(radio, 'callum-home-rest'),
  );
  queueInput(radio, { kind: 'outcome', task: 'callum-home-rest' });
  step(radio);
  until(radio, () => radio.radioOut);
  expect(home(radio)?.interruptedAt).toBeDefined();
  expect(home(radio)?.completedAt).toBeUndefined();
  returnHome(radio);
  expect(home(radio)?.completedAt).toBeUndefined();
  const later = departed();
  queueInput(later, { kind: 'outcome', task: 'stop-family' });
  step(later);
  until(later, () => later.phase === 'dawn');
  expect(later.outcomes?.keeperScenes?.homeAway).toBeDefined();
  queueInput(later, { kind: 'next' });
  expect(later.outcomes?.keeperScenes?.homeAway).toBeDefined();
  returnHome(later);
  expect(home(later)?.returnedAt).toBe(home(later)!.returnFrom! + 10);
  expect(home(later)?.completedAt).toBeUndefined();
  const expired = departed();
  until(expired, () => home(expired)?.interruptedAt !== undefined);
  expect(home(expired)?.homeMinutes).toBe(120);
  expect(home(expired)?.completedAt).toBeUndefined();
  expect(home(expired)?.coveredMinutes).toBe(150);
});

// Public HF precommit is a synthetic refusal control, not an ordinarily recorded player input.
// It cannot be imported/replayed as a game history; no private Person field is edited.
it('allows real HF refusal and loss of cover during return', () => {
  const refused = ready();
  until(refused, () => keeperSceneAvailable(refused, 'callum-home-rest'));
  for (const [action, bias] of [
    ['wait', -1],
    ['stove', 1],
  ] as const)
    precommit(refused.people.find((p) => p.id === 'dai')!, {
      action,
      bias,
      from: refused.minute - 1,
      to: refused.minute + 30,
    });
  queueInput(refused, { kind: 'outcome', task: 'callum-home-rest' });
  step(refused);
  expect(home(refused)?.events.at(-1)?.status).toBe('refused');
  expect(home(refused)?.decisions.some((d) => d.person === 'dai' && d.result === 'refused')).toBe(true);
  expect(home(refused)?.departedAt).toBeUndefined();

  // Synthetic public HF body context control: natural doze must cancel, never be cleared to retain cover.
  const dozing = ready();
  until(
    dozing,
    () =>
      dozing.night === 5 && dozing.minute % 1440 >= 1345 && keeperSceneAvailable(dozing, 'callum-home-rest'),
  );
  queueInput(dozing, { kind: 'outcome', task: 'callum-home-rest' });
  step(dozing);
  const tired = dozing.people.find((p) => p.id === 'dai')!;
  for (let n = 0; n < 145 && home(dozing)?.interruptedAt === undefined; n++) {
    setDozeContext(tired, { posture: 'seated', stimulation: 0.1 });
    tick(tired, dozing.minute);
    step(dozing);
  }
  expect(home(dozing)?.interruptedAt).toBeDefined();
  expect(home(dozing)?.completedAt).toBeUndefined();
  expect(tired.body.doze?.since).toBeDefined();
  const sleep = departed();
  const dai = sleep.people.find((p) => p.id === 'dai')!;
  until(sleep, () => home(sleep)?.restCompletedAt !== undefined);
  const callum = sleep.people.find((p) => p.id === 'callum')!;
  for (const [action, bias] of [
    ['walk', -1],
    ['stove', 1],
  ] as const)
    precommit(callum, { action, bias, from: sleep.minute - 1, to: sleep.minute + 3 });
  queueInput(sleep, { kind: 'outcome', task: 'callum-home-return' });
  step(sleep);
  expect(home(sleep)?.returnFrom).toBeUndefined();
  expect(home(sleep)?.decisions.at(-1)).toMatchObject({
    person: 'callum',
    stage: 'return',
    result: 'refused',
  });
  for (let n = 0; n < 4; n++) minute(sleep);
  queueInput(sleep, { kind: 'outcome', task: 'callum-home-return' });
  step(sleep);
  expect(home(sleep)?.returnFrom).toBeDefined();
  // A public duty/nap call during return invalidates completion even after 120 minutes home rest.
  queueInput(sleep, { kind: 'ask', keeper: 'dai', job: 'nap' });
  step(sleep);
  expect(home(sleep)?.interruptedAt).toBeDefined();
  expect(home(sleep)?.returnFrom).toBeUndefined();
  returnHome(sleep);
  expect(home(sleep)?.homeMinutes).toBe(120);
  expect(home(sleep)?.completedAt).toBeUndefined();
  expect(dai.body.alive).toBe(true);
});

// Replay is admission evidence; matching editable source/status copies cannot manufacture execution.
it('retains complete native/file histories and durably refuses unsupported publication before any write', async () => {
  const s = departed(),
    checkpoints = [copy(s)];
  until(s, () => home(s)!.homeMinutes === 9);
  checkpoints.push(copy(s));
  const cut = copy(s);
  queueInput(cut, { kind: 'outcome', task: 'stop-family' });
  step(cut);
  checkpoints.push(copy(cut));
  returnHome(cut);
  checkpoints.push(copy(cut));
  until(s, () => home(s)?.restCompletedAt !== undefined);
  returnHome(s);
  checkpoints.push(copy(s));
  const ended = copy(s);
  until(ended, () => ended.phase === 'end');
  checkpoints.push(ended);
  const source = {
    revision: 'a'.repeat(64),
    source: { game: 'glance', rules: 'glance-4', engine: '2.23.0', build: 'synthetic-original-source' },
    snapshot: snapshot(ready().people[0]!),
  };
  for (const state of checkpoints) {
    const requests: unknown[] = [];
    const shelf = {
      ready: Promise.resolve(),
      enabled: true,
      request: async (r: unknown) => {
        requests.push(r);
        throw Error('Unexpected shelf write');
      },
    };
    const lab = {
      setPersonaRecording() {},
      build: () => ({ c: 'synthetic-home-control' }),
    } as unknown as Lab;
    const io = new Continuity(lab, shelf as never);
    const wrapper = {
      run: exportCurrent(state),
      runId: 'synthetic-home-run',
      fileOrigin: false,
      heads: [],
      sources: [source],
    };
    const raw = JSON.stringify(wrapper);
    const loaded = await io.loadLocal(raw);
    const before = io.localSave(loaded);
    await expect(io.checkpoint('hf.cast.callum.glance')).rejects.toThrow('passport');
    expect(await io.checkpointAll()).toEqual({ published: 0, refused: 5 });
    expect(io.localSave(loaded)).toBe(before);
    expect(requests).toEqual([]);
    const file = new Continuity({} as Lab, undefined, () => {}, true);
    const admitted = await file.importFile(raw);
    expect(exportCurrent(admitted)).toEqual(exportCurrent(state));
    expect(file.exportSession(admitted).original.text).toBe(raw);
    expect(file.exportSession(admitted).provenance).toEqual(wrapper);
    const small = replay(
      state.seed,
      state.inputs,
      state.minute,
      state.chapter ?? undefined,
      state.rules,
      state.applied,
    );
    expect(exportCurrent(small)).toEqual(exportCurrent(state));
    if (state === checkpoints[0]) {
      for (const field of ['requestedAt', 'inputIndex', 'sourceAnchor', 'events'] as const) {
        const forgedReceipt = structuredClone(wrapper);
        const receipt = forgedReceipt.run.state.outcomes!.keeperScenes!.homeRequests![0]!;
        if (field === 'sourceAnchor') receipt.sourceAnchor = 'invented-source' as never;
        else if (field === 'events') receipt.events[0]!.at++;
        else receipt[field]++;
        await expect(io.loadLocal(JSON.stringify(forgedReceipt))).rejects.toThrow('replay');
        expect(io.localSave(loaded)).toBe(before);
      }
    }
    const forged = structuredClone(wrapper);
    forged.run.state.outcomes!.keeperScenes!.homeRequests![0]!.homeMinutes = 120;
    forged.run.state.outcomes!.keeperScenes!.homeRequests![0]!.completedAt = state.minute;
    await expect(io.loadLocal(JSON.stringify(forged))).rejects.toThrow('replay');
    expect(io.localSave(loaded)).toBe(before);
    await expect(file.importFile(JSON.stringify(forged))).rejects.toThrow('replay');
    expect(file.exportSession(admitted).original.text).toBe(raw);
    const continuation = copy(state),
      restored = importCurrent(exportCurrent(state));
    for (let n = 0; n < 30; n++) for (const x of [continuation, restored]) minute(x);
    expect(exportCurrent(restored)).toEqual(exportCurrent(continuation));
    const session = file.exportSession(continuation),
      again = new Continuity({} as Lab, undefined, () => {}, true);
    expect(exportCurrent(await again.importFile(JSON.stringify(session)))).toEqual(
      exportCurrent(continuation),
    );
  }
}, 15000);

// Regression: no actual onsite observer exists when the scheduled keeper remains away.
it('keeps an interrupted home absence through the actual next watch without fabricating a handover', () => {
  const s = ready();
  until(s, () => s.night === 5 && s.minute % 1440 >= 1345 && keeperSceneAvailable(s, 'callum-home-rest'));
  queueInput(s, { kind: 'outcome', task: 'callum-home-rest' });
  step(s);
  expect(home(s)?.departedAt).toBeDefined();
  queueInput(s, { kind: 'outcome', task: 'stop-family' });
  step(s);
  until(s, () => s.phase === 'dawn');
  queueInput(s, { kind: 'next' });
  expect(s.night).toBe(6);
  expect(s.outcomes?.keeperScenes?.homeAway).toBeDefined();
  expect(home(s)?.returnedAt).toBeUndefined();
  expect(s.reports.filter((r) => r.who === 'callum')).toEqual([]);
  expect(s.board.level).toBeNull();
  expect(s.board.gate).toBeNull();
  expect(s.said.filter((x) => x.at === s.minute && x.who === 'callum')).toEqual([]);
  expect(
    s.said
      .filter((x) => x.at === s.minute)
      .map((x) => x.text)
      .join(' '),
  ).not.toContain('Callum covers tonight');
  const reloaded = importCurrent(exportCurrent(s));
  expect(exportCurrent(reloaded)).toEqual(exportCurrent(s));
});

it('does not supply an awake forecast or scripted speech while Callum sleeps at home', () => {
  const s = departed();
  until(s, () => home(s)!.homeMinutes >= 20);
  const c = s.people.find((p) => p.id === 'callum')!;
  expect(c.activity?.mode).toBe('sleep');
  expect(keeperAsleep(s, 'callum')).toBe(true);
  expect(hint(s, 'callum', 'level').forecast).toBe('');
  until(s, () => home(s)?.restCompletedAt !== undefined);
  expect(
    s.said.filter(
      (x) => x.who === 'callum' && x.at >= home(s)!.arrivedAt! && x.at < home(s)!.restCompletedAt!,
    ),
  ).toEqual([]);
});
