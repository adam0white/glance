import { expect, it } from 'vitest';
import { cloneState, newGame, queueInput, step } from '../src/sim/dam.ts';
import { privateAvailable } from '../src/sim/private-scenes.ts';

// SCOPE: private notebooks remain private. Present authored actions require
// disclosure and real attendance; no original Wren field page is invented.
it('cannot create a telescope trip, lamp shape, post or field finding from locked actions', () => {
  const s = newGame(7);
  for (const action of ['telescope', 'lamp', 'post-shape', 'appendix', 'file-appendix'] as const) {
    expect(privateAvailable(s, action)).not.toBeNull();
    queueInput(s, { kind: 'private', action });
    step(s);
  }
  expect(s.privateScenes?.active).toBeUndefined();
  expect(s.privateScenes?.lamp.completedAt).toBeUndefined();
  expect(s.privateScenes?.appendix?.filedAt).toBeUndefined();
  expect(JSON.stringify(cloneState(s))).not.toContain('recovered original field page');
});
