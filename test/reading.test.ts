import { expect, it } from 'vitest';
import {
  cloneState,
  newGame,
  queueInput,
  type Report,
  reportWords,
  restoreState,
  step,
} from '../src/sim/dam.ts';
import { archiveWatch } from '../src/sim/hf4.ts';
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
        expect(words).not.toContain('(a long yawn)');
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
  const control = restoreState(cloneState(s));
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

// SCOPE: rendering creates no quantity draw; causes cite public body/weather evidence.
it('records only actual HF quantity evidence and leaves repeated report rendering pure', async () => {
  const { archiveWatch } = await import('../src/sim/hf4.ts');
  const s = newGame(7);
  const before = archiveWatch(s.people[0]!);
  for (const r of s.reports) reportWords(s, r);
  expect(archiveWatch(s.people[0]!)).toEqual(before);
  expect(s.reports.filter((r) => r.gauge === 'level').every((r) => r.cause !== 'unattributed')).toBe(true);
});

it('reports low and high from HF temperament and keeps the same observation draw', async () => {
  const { openWatch, archiveWatch, restoreWatch, estimateQuantity } = await import('../src/sim/hf4.ts');
  const { estimateRead } = await import('../src/sim/reading.ts');
  for (const [index, sign] of [
    [0, -1],
    [1, 1],
  ] as const) {
    const w = openWatch(7),
      p = w.people[index]!;
    const control = restoreWatch(archiveWatch(p)).people[index]!;
    const raw = estimateQuantity(control, { truth: 4.2, difficulty: 0.7 });
    const spoken = estimateRead(p, index === 0 ? 'dai' : 'callum', 4.2, 1, 1);
    expect(Math.sign(spoken.value - raw.value)).toBe(sign);
    expect(archiveWatch(p)).toEqual(archiveWatch(control));
    // The name is presentation; the HF person determines the bias.
    const other = restoreWatch(archiveWatch(openWatch(7).people[0]!)).people[index]!;
    expect(estimateRead(other, index === 0 ? 'callum' : 'dai', 4.2, 1, 1)).toEqual(spoken);
  }
});

it('allows a sleepy keeper to reuse a recent reading but a rested keeper walks', async () => {
  const { openWatch, tick, readPerson } = await import('../src/sim/hf4.ts');
  const { skipsWalk } = await import('../src/sim/reading.ts');
  const p = openWatch(7).people[0]!;
  expect(skipsWalk(p, 'weir', 20, 0)).toBe(false);
  tick(p, 26 * 60);
  expect(readPerson(p).body.sleepiness).toBeGreaterThan(0.72);
  expect(skipsWalk(p, 'weir', 20, 0)).toBe(true);
  expect(skipsWalk(p, 'weir', 90, 0)).toBe(false);
  expect(skipsWalk(p, 'gate', 20, 0)).toBe(false);
});

it('a skipped walk repeats the retained figure and written time without observing a gauge', () => {
  const s = newGame(1);
  const observations = () =>
    archiveWatch(s.people[0]!)
      .run.history.flatMap((h) => h.inputs)
      .filter((i) => i.kind === 'quantity.observed').length;
  let beforeSkip: number | undefined;
  while (s.phase === 'watch' && !s.reports.some((r) => r.skipped)) {
    if ((s.minute - 1320) % 15 === 0)
      queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level', insist: true });
    step(s);
    if (s.keepers[0]!.job?.skip && beforeSkip === undefined) {
      beforeSkip = observations();
      const activity = s.people[0]!.activity!;
      expect(activity.endsAt - activity.startedAt).toBe(4);
    }
  }
  const stale = s.reports.at(-1)!;
  const prior = s.reports.at(-2)!;
  expect(stale.skipped).toBe(true);
  expect(stale.value).toBe(prior.value);
  expect(stale.wrote).toBe(prior.wrote);
  expect(stale.at).toBeGreaterThan(stale.wrote);
  expect(beforeSkip).toBeDefined();
  expect(observations()).toBe(beforeSkip);
});
