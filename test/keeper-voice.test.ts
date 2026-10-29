import { expect, it } from 'vitest';
import { newGame, offersFor, queueInput, step } from '../src/sim/dam.ts';
import { predict, reviewLine } from '../src/sim/hf4.ts';

it('uses the real framework verdict and picks the same words for the same replay inputs', () => {
  const s = newGame(7);
  const r = predict(s.people[0]!, offersFor(s, 'dai'), {
    voiceId: 'engineer',
    affordanceId: 'level',
    strength: 0.6,
  });
  expect(r).toBeDefined();
  expect(r!.verdict).toBe('assented');
  expect(['Yes, I’ll do that.', 'I’ll do that.']).toContain(r!.says);
  expect(
    predict(s.people[0]!, offersFor(s, 'dai'), {
      voiceId: 'engineer',
      affordanceId: 'level',
      strength: 0.6,
    })!.says,
  ).toBe(r!.says);
});

it('keeps the actual HF review after an involuntary doze', () => {
  const s = newGame(7);
  while (s.phase === 'watch') step(s);
  const dai = s.keepers[0]!;
  expect(dai.dozes.length).toBeGreaterThan(0);
  expect(s.dawns[0]!.lines.find((l) => l.id === 'dai')!.line).toBe(reviewLine(s.people[0]!));
});

it('does not invent a missed-watch review after an earlier requested nap and later doze', () => {
  const s = newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  while (s.phase === 'watch') {
    if (s.minute === 1440) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'nap', insist: false });
    step(s);
  }
  expect(s.keepers[0]!.orderedNap).toBe(true);
  expect(s.keepers[0]!.dozes.some((d) => d.to > d.from)).toBe(true);
  expect(s.keepers[0]!.watchReview).toBeUndefined();
  expect(s.dawns[0]!.lines.find((l) => l.id === 'dai')!.line).toBe(s.keepers[0]!.watchReviewLine ?? '');
});
