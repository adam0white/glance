import { beforeAll, expect, it } from 'vitest';
import { cloneState, newGame, queueInput, step, walkFor } from '../src/sim/dam.ts';
import {
  archiveWatch,
  openWatch,
  perceive,
  readDoze,
  reviewLine,
  setDozeContext,
  tick,
  verifyWatch,
} from '../src/sim/hf4.ts';
import { practiceNight } from '../src/sim/practice.ts';
import { physicallyAway } from '../src/sim/presence.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

// SCOPE: one current HF4 watch. The HF3 enable/bias/Person-setter controls are
// historical evidence; this unit does not offer their old runtime as an option.
it('always authors all current faculties and refuses old rule switches', () => {
  const s = newGame(7);
  expect(s.rules).toEqual({ edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  expect(s.outcomes).toBeDefined();
  expect(s.privateScenes).toBeDefined();
  const archive = archiveWatch(s.people[0]!);
  expect(archive.run.initial.people).toHaveLength(5);
  expect(
    archive.run.initial.people.every((p) => p.state.heldNorms.length === 0 && p.biography.length === 1),
  ).toBe(true);
  expect(() => newGame(7, undefined, { edition: 'extended-1', dam: 'valley' } as never)).toThrow();
});
it('pins only a received report doubt without changing water or people', () => {
  const s = newGame(7),
    control = newGame(7);
  queueInput(s, { kind: 'doubt', report: 0, marked: true });
  step(s);
  step(control);
  expect(s.water).toEqual(control.water);
  expect(archiveWatch(s.people[0]!)).toEqual(archiveWatch(control.people[0]!));
  expect(s.reports[0]?.doubted).toBe(true);
});
it('records an ordinary standing request but gives no work to an invalid threshold or target', () => {
  const s = newGame(7);
  queueInput(s, { kind: 'standing', keeper: 'dai', threshold: 4.5, target: 3 });
  step(s);
  expect(s.arrangements?.dai).toMatchObject({ threshold: 4.5, target: 3 });
  const before = structuredClone(s.arrangements);
  queueInput(s, { kind: 'standing', keeper: 'dai', threshold: Infinity, target: 7 });
  step(s);
  expect(s.arrangements).toEqual(before);
});
it('keeps the upper basin route cost and has no free instrument readings from inspection', () => {
  const valley = newGame(7),
    upper = newGame(7, undefined, { edition: 'extended-2', dam: 'upper', outcomes: 'private-scenes-1' });
  expect(walkFor(upper, 'hut', 'staff')).toBeGreaterThan(walkFor(valley, 'hut', 'staff'));
  const before = cloneState(valley);
  expect(physicallyAway(valley, 'nerys')).toBe(false);
  expect(cloneState(valley)).toEqual(before);
});
it('refuses premature practice without replacing the source watch', () => {
  const s = newGame(7),
    before = cloneState(s);
  expect(() => practiceNight(s, 3)).toThrow('Finish the watch');
  expect(cloneState(s)).toEqual(before);
});
// One fixed opening, real public time and ambient/alarm inputs. No body edits,
// clock setter, seed search or manual wake can produce this control's result.
// Prepare the complete physical wait under the ordinary hook deadline. The alarm
// and full replay assertion keep the ordinary test deadline and all six hundred possible minutes.
let dozingWatch: ReturnType<typeof openWatch>;
beforeAll(() => {
  dozingWatch = openWatch(7);
  const p = dozingWatch.people[0]!;
  setDozeContext(p, { posture: 'seated', stimulation: 0.1 });
  for (let n = 0; n < 600 && !readDoze(p)?.asleep; n++) tick(p, p.now + 1);
});
it('uses actual doze and a reached radio alarm through the public Run', () => {
  const p = dozingWatch.people[0]!;
  expect(readDoze(p)?.asleep).toBe(true);
  const asleepAt = p.now;
  perceive(p, [
    {
      at: p.now,
      channel: 'heard',
      kind: 'radio-alarm',
      salience: 1,
      near: true,
      summary: 'The desk calls urgently on the radio.',
    },
  ]);
  expect(p.now).toBeGreaterThanOrEqual(asleepAt);
  expect(readDoze(p)?.asleep ?? false).toBe(false);
  expect(verifyWatch(p).verified).toBe(true);
});
// Scheduled review preparation uses the ordinary hook deadline. The full native
// source proof independently replays its retained history; no timeout is raised.
let scheduledReview: ReturnType<typeof openWatch>;
beforeAll(() => {
  scheduledReview = openWatch(7);
  tick(scheduledReview.people[0]!, 1860);
});
it('retains the actual daily review narration without a local guilt formula', () => {
  const p = scheduledReview.people[0]!;
  expect(p.review.last).toBeDefined();
  expect(typeof reviewLine(p)).toBe('string');
  expect(archiveWatch(p).run.history.length).toBeGreaterThan(0);
});
it('replays the complete current public frontier and refuses stripped inputs with retained people', () => {
  const s = newGame(7);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  step(s);
  const raw = exportCurrent(s);
  expect(exportCurrent(importCurrent(raw))).toEqual(raw);
  const forged = structuredClone(raw);
  forged.inputs = [];
  forged.state.inputs = [];
  forged.state.applied = 0;
  expect(() => importCurrent(forged)).toThrow();
});
