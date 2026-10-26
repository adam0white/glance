import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
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
import { type PrivateAction, privateAvailable } from '../src/sim/private-scenes.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { required } from './required.ts';

function start(seed = 7) {
  return newGame(seed, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
}
function minute(s: GameState, action?: PrivateAction) {
  if (s.phase === 'dawn') {
    queueInput(s, { kind: 'next' });
    return;
  }
  if (s.phase !== 'watch') return;
  const m = (s.minute % 1440) - 1320;
  if (m === 1 || m === -1260) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 4 });
  for (const person of discoveriesFor(s)) {
    const first = s.conversations[person];
    if (first === undefined || s.minute - first >= 20) queueInput(s, { kind: 'talk', person });
  }
  if (action && s.minute % 5 === 0) queueInput(s, { kind: 'private', action });
  step(s);
}
function until(s: GameState, done: () => boolean, action?: PrivateAction) {
  while (s.phase !== 'end' && !done()) minute(s, action);
  expect(done()).toBe(true);
}
// Complete serialized state, including every HF field. No fingerprint or normalization.
let proofNumber = 0;
function nativeCopy(s: GameState) {
  return replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules);
}
function proof(s: GameState) {
  const id = ++proofNumber;
  const retain = (stage: string, states: GameState[]) => {
    const directory = process.env.GLANCE_PRIVATE_PROOF_DIR;
    if (!directory) return;
    mkdirSync(directory, { recursive: true });
    for (const [index, state] of states.entries())
      writeFileSync(join(directory, `${id}-${stage}-${index}.json`), JSON.stringify(exportCurrent(state)), {
        flag: 'wx',
      });
  };
  const raw = JSON.stringify(exportCurrent(s));
  const full = importCurrent(JSON.parse(raw));
  const compact = replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules);
  const copied = restoreState(cloneState(s));
  // Released HF restore changes key insertion order in review. Assert every value;
  // native full import and compact replay must additionally retain exact JSON bytes.
  expect(exportCurrent(copied)).toStrictEqual(exportCurrent(s));
  retain('initial', [s, full, compact, copied]);
  expect(JSON.stringify(exportCurrent(full)) === raw).toBe(true);
  expect(JSON.stringify(exportCurrent(compact)) === raw).toBe(true);
  for (let i = 0; i < 60; i++) for (const a of [s, full, compact, copied]) minute(a);
  for (const a of [full, compact])
    expect(JSON.stringify(exportCurrent(a)) === JSON.stringify(exportCurrent(s))).toBe(true);
  expect(exportCurrent(copied)).toStrictEqual(exportCurrent(s));
  retain('continued60', [s, full, compact, copied]);
  while (s.phase === 'watch') for (const a of [s, full, compact, copied]) minute(a);
  if (s.phase === 'dawn') for (const a of [s, full, compact, copied]) minute(a);
  for (const a of [full, compact])
    expect(JSON.stringify(exportCurrent(a)) === JSON.stringify(exportCurrent(s))).toBe(true);
  expect(exportCurrent(copied)).toStrictEqual(exportCurrent(s));
  retain('nextnight', [s, full, compact, copied]);
}

it('Nerys actually attends a telescope trip; a river call preserves its pending answer and stops the trip', () => {
  const s = start();
  expect(newGame(7).privateScenes).toBeUndefined();
  expect(() =>
    newGame(7, undefined, { edition: 'extended-1', dam: 'valley', outcomes: 'private-scenes-1' }),
  ).toThrow();
  const bad = exportCurrent(s);
  (bad.state.rules as { outcomes: string }).outcomes = 'private-scenes-2';
  expect(() => importCurrent(bad)).toThrow();
  until(s, () => !!s.privateScenes?.active, 'telescope');
  proof(nativeCopy(s));
  expect(s.privateScenes?.active?.action).toBe('telescope');
  const cut = replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules);
  queueInput(cut, { kind: 'ring' });
  step(cut);
  expect(cut.privateScenes?.active?.returningFrom).toBeDefined();
  expect(cut.nerys.ringing).not.toBeNull();
  for (let i = 0; i < 5; i++) step(cut);
  expect(cut.privateScenes?.active).toBeUndefined();
  expect(cut.nerys.ringing).not.toBeNull();
  expect(cut.privateScenes?.attempts.at(-1)?.stoppedAt).toBeDefined();
  expect(cut.privateScenes?.telescope.completedAt).toBeUndefined();
  proof(cut);
  until(
    s,
    () =>
      s.privateScenes?.telescope.completedAt !== undefined &&
      s.privateScenes.telescope.observations.length > 0,
    'telescope',
  );
  const t = required(s.privateScenes).telescope;
  expect(required(t.completedAt) - required(t.startedAt)).toBe(20);
  expect(t.observations.length).toBeGreaterThan(0);
  expect(
    t.observations.every(
      (o) => o.sky === 'clear' && o.at >= required(t.startedAt) + 5 && o.at < required(t.startedAt) + 15,
    ),
  ).toBe(true);
  expect(t.observations[0]?.object).toMatch(/moon|star/);
  expect(t.corner).toBe('riverbank');
  proof(s);
});

it('Bilal retains an adjusted new shape and separately posts it; relief and private activity exclude each other', () => {
  const s = start();
  until(s, () => s.privateScenes?.active?.action === 'lamp', 'lamp');
  const conflict = replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules);
  queueInput(conflict, { kind: 'recruit' });
  step(conflict);
  expect(conflict.relief).toBeUndefined();
  expect(conflict.privateScenes?.active?.action).toBe('lamp');
  const relief = replay(s.seed, s.inputs.slice(0, -1), s.minute, s.chapter ?? undefined, s.rules);
  expect(relief.privateScenes?.active).toBeUndefined();
  queueInput(relief, { kind: 'recruit' });
  step(relief);
  expect(relief.relief).toBeDefined();
  queueInput(relief, { kind: 'private', action: 'lamp' });
  step(relief);
  expect(relief.privateScenes?.active).toBeUndefined();
  expect(privateAvailable(relief, 'lamp')).toContain('relief');
  queueInput(s, { kind: 'private', action: 'adjust-lamp', shape: 'boat', lamp: 'low' });
  step(s);
  proof(nativeCopy(s));
  until(s, () => s.privateScenes?.lamp.completedAt !== undefined);
  expect(required(s.privateScenes).lamp.shape).toBe('boat');
  expect(required(s.privateScenes).lamp.lamp).toBe('low');
  expect(required(s.privateScenes).lamp.adjustedAt).toBeDefined();
  expect(required(s.privateScenes).lamp.postedAt).toBeUndefined();
  const retained = required(s.privateScenes).lamp.drawing;
  until(s, () => s.privateScenes?.active?.action === 'post-shape', 'post-shape');
  const cut = replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules);
  queueInput(cut, { kind: 'private', action: 'stop' });
  step(cut);
  expect(required(cut.privateScenes).lamp.postedAt).toBeUndefined();
  expect(required(cut.privateScenes).lamp.drawing).toBe(retained);
  proof(cut);
  until(s, () => s.privateScenes?.lamp.postedAt !== undefined);
  expect(
    required(required(s.privateScenes).lamp.postedAt) -
      required(required(s.privateScenes).lamp.postStartedAt),
  ).toBe(5);
  expect(required(s.privateScenes).lamp.postedDrawing).toBe(retained);
  expect(required(s.privateScenes).lamp.channel).toBe('in-game-outgoing-post');
  expect(Object.hasOwn(required(s.privateScenes).lamp, 'reply')).toBe(false);
  proof(s);
});

it('Wren drafts the unknown observation honestly, files separately, and closing optional access costs a corner tonight only', () => {
  const s = start();
  until(s, () => s.privateScenes?.active?.action === 'appendix', 'appendix');
  const cut = replay(s.seed, s.inputs, s.minute, s.chapter ?? undefined, s.rules);
  queueInput(cut, { kind: 'private', action: 'stop' });
  step(cut);
  expect(required(cut.privateScenes).appendix.draftedAt).toBeUndefined();
  proof(cut);
  until(s, () => s.privateScenes?.appendix.draftedAt !== undefined);
  proof(nativeCopy(s));
  const a = required(s.privateScenes).appendix;
  expect(required(a.draftedAt) - required(a.startedAt)).toBe(20);
  expect(a.text).toContain('observation detail, species, date, location and measurement are unknown');
  expect(a.sourcePage).toBe('retained page from the early survey; identifier not supplied');
  expect(a.filedAt).toBeUndefined();
  until(s, () => s.privateScenes?.appendix.filedAt !== undefined, 'file-appendix');
  expect(required(a.filedAt) - required(a.filingStartedAt)).toBe(5);
  expect(a.status).toBe('awaiting-review');
  queueInput(s, { kind: 'private', action: 'close-access' });
  step(s);
  expect(required(s.privateScenes).access.at(-1)).toEqual({
    night: s.night,
    at: s.minute - 1,
    closed: true,
    appendix: a.text,
  });
  expect(privateAvailable(s, 'telescope', 'riverbank')).toContain('closed tonight');
  expect(privateAvailable(s, 'telescope', 'yard') ?? '').not.toContain('closed tonight');
  const attempts = required(s.privateScenes).attempts.length;
  queueInput(s, { kind: 'private', action: 'telescope', corner: 'riverbank' });
  step(s);
  expect(required(s.privateScenes).attempts.length).toBe(attempts);
  queueInput(s, { kind: 'private', action: 'telescope', corner: 'yard' });
  step(s);
  expect(required(s.privateScenes).active?.action).toBe('telescope');
  expect(required(s.privateScenes).attempts.at(-1)?.corner).toBe('yard');
  const night = s.night;
  proof(s);
  expect(s.night).toBeGreaterThan(night);
  expect(privateAvailable(s, 'telescope', 'riverbank') ?? '').not.toContain('closed tonight');
});

it('Stopping attendance retains the actual telescope return across repeated stop, ring and pause', () => {
  const s = start();
  until(s, () => !!s.privateScenes?.active, 'telescope');
  expect(s.minute).toBe(2781);
  for (let i = 0; i < 6; i++) step(s);
  const before = structuredClone(required(s.privateScenes).attempts.at(-1));
  const stopped = s.minute;
  queueInput(s, { kind: 'private', action: 'stop' });
  step(s);
  expect(required(s.privateScenes).active?.until).toBe(stopped + 5);
  expect(s.people.find((p) => p.id === 'nerys')?.activity).toBeNull();
  const returning = nativeCopy(s);
  queueInput(s, { kind: 'ring' });
  queueInput(s, { kind: 'private', action: 'stop' });
  queueInput(s, { kind: 'pause' });
  step(s);
  expect(s.chapterPaused).toBe(false);
  expect(required(s.privateScenes).active?.until).toBe(stopped + 5);
  expect(s.nerys.ringing).not.toBeNull();
  while (s.minute <= stopped + 5) step(s);
  expect(required(s.privateScenes).active).toBeUndefined();
  expect(s.nerys.ringing).not.toBeNull();
  queueInput(s, { kind: 'resume' });
  step(s);
  while (s.nerys.ringing !== null) step(s);
  expect(required(s.reports.at(-1)).at).toBeGreaterThanOrEqual(stopped + 5);
  const a = required(required(s.privateScenes).attempts.at(-1));
  expect(a.attended).toBe(before?.attended);
  expect(a.observations).toStrictEqual(before?.observations);
  expect(a.stoppedAt).toBe(stopped);
  expect(a.completedAt).toBeUndefined();
  expect(required(s.privateScenes).telescope.completedAt).toBeUndefined();
  proof(returning);
});
