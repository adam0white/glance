import { expect, it } from 'vitest';
import { newGame, type Report, reportWords } from '../src/sim/dam.ts';
import { spoken, spokenFine } from '../src/sim/reading.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

it('writes gauge reports at source without losing digits, uncertainty or the yawn', () => {
  const s = newGame(7);
  expect(spoken(4.3)).toBe('four point three');
  expect(spokenFine(0.52)).toBe('nought point five two');
  for (const who of ['dai', 'callum'] as const) {
    for (const conf of [0.2, 0.4, 0.5, 0.7]) {
      for (let at = 0; at < 6; at++) {
        const r: Report = {
          at,
          wrote: at,
          who,
          gauge: 'weir',
          value: 0.52,
          truth: 0.6,
          conf,
          clarity: 0.2,
          cause: 'sleepy',
          skipped: false,
        };
        const words = reportWords(s, r);
        expect(words).toMatch(/This is the weir reading\.|I read the weir board\./);
        expect(words).toContain('nought point five two');
        expect(words).not.toMatch(/Weir’s|Weir board|bang on|Torch is going/);
        if (who === 'dai' && at % 3 === 0) expect(words).toContain('(a long yawn)');
        if (who === 'callum' && conf === 0.2) expect(words).toMatch(/could be higher|maybe higher/);
      }
    }
  }
});

it('replays current exports and plainly refuses a file whose pinned text differs', () => {
  const exported = exportCurrent(newGame(7));
  expect(exportCurrent(importCurrent(structuredClone(exported))).state).toEqual(exported.state);
  const older = structuredClone(exported);
  older.state.said[0]!.text = 'First week on the night desk.';
  expect(() => importCurrent(older)).toThrow('The file was not loaded. Start a new game.');
});
