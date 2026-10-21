import { expect, it } from 'vitest';
import { newGame, queueInput, replay, step } from '../src/sim/dam.ts';
import { eventStamp, playback } from '../src/ui/playback.ts';

it('waits for inspection, leaves reading time, and moves briskly through quiet work', () => {
  expect(playback(true, false).rate).toBe(0);
  expect(playback(true, true).rate).toBe(0);
  expect(playback(false, true).rate).toBeLessThan(1);
  expect(playback(false, false).rate).toBe(8);
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
