import { expect, it } from 'vitest';
import { cloneState, newGame, queueInput, step } from '../src/sim/dam.ts';
import { viewingAvailable, viewingStatus } from '../src/sim/viewing.ts';

// SCOPE: no old disclosure flag upgrades into attendance. The fixed current
// source watch records actual HF assent, five-minute travel, rain and separate return.
it('requires the retained disclosure and a deliberate new invitation', () => {
  const s = newGame(7);
  expect(viewingAvailable(s, 'invite')).toContain('stand');
  queueInput(s, { kind: 'viewing', action: 'invite' });
  step(s);
  expect(s.viewing).toBeUndefined();
  expect(viewingStatus(s)).toContain('might');
});
it('retains a completed viewing when a separate return is interrupted', () => {
  const s = newGame(7); // Wording fixture only; never native-admitted or claimed as a physical event.
  s.viewing = {
    source: 'retained source fixture',
    requestedAt: 1320,
    inputIndex: 0,
    night: 1,
    away: true,
    stage: 'returning',
    decisions: [],
    attended: 20,
    known: [],
    finishedAt: 1345,
    returnFrom: 1346,
  };
  queueInput(s, { kind: 'viewing', action: 'stop' });
  step(s);
  expect(s.viewing.finishedAt).toBe(1345);
  expect(s.viewing.attended).toBe(20);
  expect(s.viewing.away).toBe(true);
  expect(s.said.some((x) => x.text.includes('completed viewing remains recorded'))).toBe(true);
  expect(cloneState(s).viewing?.stage).toBe('waiting');
});
