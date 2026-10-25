import { expect, it } from 'vitest';
import { newGame, queueInput, type Report, reportWords, step } from '../src/sim/dam.ts';
import { spoken, spokenFine } from '../src/sim/reading.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { required } from './required.ts';

it('writes gauge reports at source without losing digits, uncertainty or the yawn', () => {
  const s = newGame(7);
  expect(spoken(4.3)).toBe('four point three');
  expect(spokenFine(0.52)).toBe('zero point five two');
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
        expect(words).toContain('zero point five two');
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
  required(older.state.said[0]).text = 'First week on the night desk.';
  expect(() => importCurrent(older)).toThrow('The file was not loaded. Start a new game.');
});

it('pins a player doubt to a received reading without changing the physical run', () => {
  const s = newGame(7);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  while (!s.board.level) step(s);
  const control = structuredClone(s);
  const report = s.reports.indexOf(s.board.level);
  queueInput(s, { kind: 'doubt', report, marked: true });
  step(s);
  step(control);
  expect(s.board.level).toMatchObject({ doubted: true });
  expect(s.water).toEqual(control.water);
  expect(s.people).toEqual(control.people);
  expect(exportCurrent(importCurrent(exportCurrent(s)))).toEqual(exportCurrent(s));
  queueInput(s, { kind: 'doubt', report: -1, marked: true });
  step(s);
  expect(s.reports.filter((r) => 'doubted' in r)).toHaveLength(1);
  queueInput(s, { kind: 'doubt', report, marked: false });
  step(s);
  expect(s.board.level).toMatchObject({ doubted: false });
});

it('keeps the reading bias different for each keeper and their condition', async () => {
  const { biasOf } = await import('../src/sim/reading.ts');
  const rested = { true: 0.9, felt: 0.9, fear: 0, cause: 'fresh' as const };
  const tired = { ...rested, true: 0.3, cause: 'sleepy' as const };
  expect(biasOf('dai', tired)).toBeLessThan(biasOf('dai', rested));
  expect(biasOf('dai', tired)).toBeLessThan(0);
  expect(biasOf('callum', tired)).toBeGreaterThan(0);
  expect(biasOf('callum', { ...tired, fear: 0.8 })).toBeGreaterThan(biasOf('callum', tired));
});
