import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { archiveWatch } from '../src/sim/hf4.ts';
import { liveWords } from '../src/ui/live-readings.ts';

it('shows live mood, needs and learned expectations as words without changing the run', () => {
  const s = newGame(7);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  for (let n = 0; n < 16; n++) step(s);
  const p = s.people[0]!;
  const before = archiveWatch(p);
  const words = liveWords(p);
  expect(words.join(' ')).toMatch(/Mood:/);
  expect(words.join(' ')).toMatch(/Experience:/);
  expect(words.join(' ')).not.toMatch(/\d|NaN|undefined|outcome:|successRate/);
  expect(liveWords(p)).toEqual(words);
  expect(liveWords(structuredClone(p))).toEqual(words);
  expect(archiveWatch(p)).toEqual(before);
});
