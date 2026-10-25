import { expect, it } from 'vitest';
import { newGame } from '../src/sim/dam.ts';
import { SAMPLE_DAWN } from '../src/ui/opener.ts';
import { tallyBody } from '../src/ui/tally.ts';

it('counts disclosed closing components only at the end, including a failed night', () => {
  const s = newGame(10);
  s.dawns = [structuredClone(SAMPLE_DAWN), { ...structuredClone(SAMPLE_DAWN), overtopped: true }];
  expect(tallyBody(s)).toBe('');
  s.phase = 'dawn';
  expect(tallyBody(s)).toBe('');
  s.phase = 'end';
  s.dawns[0]!.misses.push({
    at: 1440,
    who: 'dai',
    gauge: 'level',
    said: 4,
    truth: 4.3,
    cause: 'sleepy',
    caught: true,
  });
  const caught = s.dawns.reduce((n, d) => n + d.misses.filter((m) => m.caught).length, 0);
  expect(tallyBody(s)).toContain(`Closing tally: ${2 + caught}`);
  expect(tallyBody(s)).toContain('The dam held on 1 night. Mill Lane');
  expect(tallyBody(s)).toContain('It does not rate the people');
  expect(tallyBody(s)).toContain('You caught 1 wrong reading.');
});
