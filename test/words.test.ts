import { expect, it } from 'vitest';
import { fingerprint, newGame } from '../src/sim/dam.ts';
import { displayWords, hintWords } from '../src/ui/words.ts';

it('completes ordinary radio sentences without changing the run or losing uncertainty', () => {
  const run = newGame(7);
  const before = fingerprint(run);
  for (const line of run.said) expect(displayWords(line.text)).not.toBe('');
  expect(fingerprint(run)).toBe(before);
  expect(displayWords('four-three, near enough.')).toBe('I read four point three, or close to it.');
  expect(displayWords('About four-two. Torch is going.')).toBe(
    'I read about four point two. The torch is fading.',
  );
  expect(displayWords('Fourth step. That’s high. Mill Lane gets it at five.')).toContain(
    'Mill Lane floods at the fifth step.',
  );
  expect(hintWords('if I must')).toBe('He agrees reluctantly.');
});

import { hedge } from '../src/sim/reading.ts';

it('composes weir, delayed and yawning reports for both keepers and every confidence variant', () => {
  for (const who of ['dai', 'callum'] as const) {
    for (const confidence of [0.2, 0.4, 0.5, 0.7]) {
      for (let k = 0; k < 6; k++) {
        const words = hedge(who, confidence, 'nought point five two', k);
        const report = `${who === 'dai' ? 'Weir’s ' : 'Weir board, '}${words}`;
        for (const raw of [report, `(a long yawn) ${report}`, `Radio’s back. Weir at 01:15: ${report}`]) {
          const shown = displayWords(raw);
          expect(shown).not.toMatch(/reading is (?:It's|Call|About)|Weir board|Weir’s/);
          expect(shown).toContain('This is the weir reading.');
          expect(shown).toContain('nought point five two');
          if (raw.startsWith('Radio')) expect(shown).toContain('01:15');
          if (raw.includes('yawn')) expect(shown).toContain('(a long yawn)');
          if (words.includes('could be higher')) expect(shown).toContain('could be higher');
          if (words.includes('maybe more')) expect(shown).toContain('maybe higher');
        }
      }
    }
  }
});

it.each([
  ['Callum here, sir. Ready for anything.', 'This is Callum, sir. I’m ready for anything.'],
  ['You again. Hold on.', 'You’re calling again. Hold on.'],
])('completes an ordinary dialogue branch: %s', (raw, shown) => {
  expect(displayWords(raw)).toBe(shown);
});
