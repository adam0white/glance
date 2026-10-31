import { expect, it } from 'vitest';
import { newGame, queueInput, replay, step } from '../src/sim/dam.ts';
import { eventStamp, playback } from '../src/ui/playback.ts';

it('waits for inspection, leaves reading time, and moves briskly through quiet work', () => {
  expect(playback(true, false).rate).toBe(0);
  expect(playback(true, true).rate).toBe(0);
  expect(playback(false, true).rate).toBeLessThan(1);
  expect(playback(false, false).rate).toBe(1.4);
  expect(playback(false, false, 2.4).rate).toBe(2.4);
  expect(playback(true, false, 2.4).rate).toBe(0);
});

it('detects the first delivered event while preserving every simulation minute and replay', () => {
  const s = newGame(42);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level', insist: false });
  const initial = eventStamp(s);
  let steps = 0;
  do {
    step(s);
    steps++;
  } while (eventStamp(s) === initial && s.phase === 'watch' && steps < 100);
  expect(eventStamp(s)).not.toBe(initial);
  expect(replay(s.seed, s.inputs, s.minute)).toEqual(s);
});

it('recognizes a new delivered line after the bounded radio log fills', () => {
  const s = newGame(42);
  const line = s.said.at(-1);
  if (!line) throw new Error('Opening line missing');
  s.said = Array.from({ length: 240 }, () => ({ ...line }));
  const before = eventStamp(s);
  s.said.shift();
  s.said.push({ ...line, at: line.at + 1, text: 'A new objection.' });
  expect(eventStamp(s)).not.toBe(before);
});

it('keeps opted-in outcome work moving during inspection without changing legacy or radio rates', () => {
  expect(playback(true, false, 1.4, false, true)).toEqual({
    rate: 0.35,
    reason: 'Time continues slowly while this inspection is open. It does not stop.',
  });
  expect(playback(true, true, 2.4, true, true).rate).toBe(0.35);
  expect(playback(true, false, 1.4, false, false).rate).toBe(0);
  expect(playback(false, true, 1.4, false, true).rate).toBe(0.35);
});
