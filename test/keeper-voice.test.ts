import { expect, it } from 'vitest';
import { newGame, offersFor } from '../src/sim/dam.ts';
import { predict } from '../src/sim/hf4.ts';
import { keeperAnswer, keeperReview } from '../src/sim/keeper-voice.ts';

it('uses the real framework verdict and picks the same words for the same replay inputs', () => {
  const s = newGame(7);
  const r = predict(s.people[0]!, offersFor(s, 'dai'), {
    voiceId: 'engineer',
    affordanceId: 'level',
    strength: 0.6,
  });
  expect(r).toBeDefined();
  expect(r!.verdict).toBe('assented');
  const answer = keeperAnswer(s.seed, s.night, s.minute, 'dai', r!);
  expect([
    'Yes, I’ll do that.',
    'I’ll do that.',
    'I’m going now.',
    'Yes, I’ll look.',
    'I’m on my way.',
    'That is reasonable.',
  ]).toContain(answer);
  expect(keeperAnswer(s.seed, s.night, s.minute, 'dai', r!)).toBe(answer);
});

it('only gives a sleep confession when the caller has evidence of a missed watch involving sleep', () => {
  const line = "Today I didn't keep my watch.";
  expect(keeperReview(7, 1, 'dai', line, false)).toBe("Tonight I didn't keep my watch.");
  expect(keeperReview(7, 1, 'dai', line, true)).toBe('I fell asleep. Don’t write that in the log.');
  expect(keeperReview(7, 1, 'callum', line, true)).toBe(
    'I fell asleep at once. The baby kept me awake all day.',
  );
  expect(keeperReview(7, 1, 'bilal', line, true)).toBe("Tonight I didn't keep my watch.");
});

it('confesses a recorded involuntary doze at dawn in Dai’s voice', async () => {
  const { step } = await import('../src/sim/dam.ts');
  const s = newGame(7);
  while (s.phase === 'watch') step(s);
  const dai = s.keepers[0]!;
  expect(dai.dozes.length).toBeGreaterThan(0);
  expect(s.dawns[0]!.lines.find((l) => l.id === 'dai')!.line).toMatch(/fell asleep|shut my eyes|slept/);
});
