import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { privateAvailable } from '../src/sim/private-scenes.ts';

// SCOPE: a player-supplied fictional reading is not an external received approval.
it('cannot read a fictional reply before an actual separately completed post', () => {
  const s = newGame(7);
  expect(privateAvailable(s, 'read-fictional-reply')).not.toBeNull();
  queueInput(s, { kind: 'private', action: 'read-fictional-reply' });
  step(s);
  expect(s.privateScenes?.lamp.fictionalReply).toBeUndefined();
  expect(s.privateScenes?.lamp.postedDrawing).toBeUndefined();
});
