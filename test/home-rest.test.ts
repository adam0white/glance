import { expect, it } from 'vitest';
import { cloneState, hint, newGame, queueInput, step } from '../src/sim/dam.ts';
import { archiveWatch } from '../src/sim/hf4.ts';
import { keeperSceneAvailable } from '../src/sim/keeper-scenes.ts';

// SCOPE: disclosure/proposal/cover are distinct. Long actual sleep/travel/return
// controls live in the fixed-seed source-watch proof, not repeated HF3 setter fixtures.
it('cannot turn an unavailable home request into approval or physical departure', () => {
  const s = newGame(7),
    before = cloneState(s);
  expect(keeperSceneAvailable(s, 'callum-home-rest')).toBe(false);
  queueInput(s, { kind: 'outcome', task: 'callum-home-rest' });
  step(s);
  const h = s.outcomes?.keeperScenes?.homeRequests?.at(-1);
  expect(h?.departedAt).toBeUndefined();
  expect(h?.completedAt).toBeUndefined();
  expect(h?.events.at(-1)?.status).toBe('refused');
  expect(s.water.level).not.toBeLessThan(0);
  expect(before.people).toEqual([]);
});
it('does not manufacture a separate return, cover or rested credit without absence', () => {
  const s = newGame(7);
  queueInput(s, { kind: 'outcome', task: 'callum-home-return' });
  step(s);
  expect(s.outcomes?.keeperScenes?.homeAway).toBeUndefined();
  expect(s.outcomes?.keeperScenes?.homeRequests).toBeUndefined();
  const a = archiveWatch(s.people[0]!);
  hint(s, 'callum', 'level');
  expect(archiveWatch(s.people[0]!)).toEqual(a);
});
