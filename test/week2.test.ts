import { expect, it } from 'vitest';
import {
  EXTENDED_PLANS,
  exportRun,
  FOLLOWUP_PLANS,
  newGame,
  queueInput,
  step,
  type WatchRules,
  watchFrom,
} from '../src/sim/dam.ts';
import { reportBody } from '../src/ui/report.ts';
import { required } from './required.ts';

function catchWatch(asks: number[], edition: WatchRules['edition'] = 'extended-2', mark = false) {
  const s = newGame(7, undefined, { edition, dam: 'upper' });
  while (s.phase === 'watch') {
    const m = s.minute - watchFrom(1);
    if (asks.includes(m)) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
    if (mark && m === 145) queueInput(s, { kind: 'doubt', report: s.reports.length - 1, marked: true });
    step(s);
  }
  return s;
}

it('credits actual reread and lightning catches, adds doubt credit, and leaves an unchecked miss uncaught', () => {
  const reread = catchWatch([1, 16, 31, 100]);
  const misses = reread.dawns[0]?.misses;
  // These are real reports, inputs and flashes from the simulator, not forged dawn records.
  expect(misses?.map((m) => m.at - watchFrom(1))).toEqual([13, 19, 112]);
  expect(reread.reports.some((r) => r.at > watchFrom(1) + 13 && r.at <= watchFrom(1) + 33)).toBe(true);
  expect(misses?.map((m) => m.caught)).toEqual([true, true, false]);
  expect(catchWatch([1, 16, 31, 100], 'extended-1').dawns[0]?.misses.map((m) => m.caught)).toEqual([
    false,
    false,
    false,
  ]);
  expect(reportBody(required(reread.dawns[0]), false)).toContain(
    'lightning showed the wall within twenty minutes',
  );
  expect(reportBody(required(reread.dawns[0]), false)).toContain(
    'Marking that report as doubted also counts',
  );
  const lightning = catchWatch([20]);
  expect(lightning.flashes.some((f) => f.at === watchFrom(1) + 34)).toBe(true);
  expect(lightning.dawns[0]?.misses.map((m) => m.caught)).toEqual([true]);
  expect(catchWatch([1, 16, 31, 100], 'extended-2', true).dawns[0]?.misses.at(-1)?.caught).toBe(true);
});

// The narrative revision must not ease the storm or change staff, routes or event timings.
it('adds a received-information beat to each later watch while keeping the previous physical plans', () => {
  expect(FOLLOWUP_PLANS).toHaveLength(12);
  for (let night = 6; night <= 12; night++) {
    const old = required(EXTENDED_PLANS[night - 1]);
    const next = required(FOLLOWUP_PLANS[night - 1]);
    expect(old?.beats).toEqual([]);
    expect(next?.beats.length).toBeGreaterThan(0);
    const { beats: _oldBeats, intro: _oldIntro, ...oldWorld } = old;
    const { beats: _newBeats, intro: _newIntro, ...newWorld } = next;
    expect(newWorld).toEqual(oldWorld);
    expect(next?.beats.every((b) => b.at > 0 && b.at < 480)).toBe(true);
  }
});

it('names the actual doubted gate setting at dawn in both saved longer-watch editions', () => {
  for (const edition of ['extended-1', 'extended-2'] as const) {
    const s = newGame(7, undefined, { edition, dam: 'upper' });
    queueInput(s, { kind: 'doubt', report: s.reports.indexOf(required(s.board.gate)), marked: true });
    queueInput(s, { kind: 'doubt', report: s.reports.indexOf(required(s.board.level)), marked: true });
    while (s.phase === 'watch') step(s);
    const dawn = required(s.dawns[0]);
    expect(exportRun(s, '3.0.0').state.dawns[0]?.doubts?.find((r) => r.gauge === 'gate')).toEqual({
      at: 1320,
      who: 'dai',
      gauge: 'gate',
      value: 0,
      truth: 0,
      wrong: false,
    });
    const html = reportBody(dawn, false);
    expect(html).toContain('gate gauge: reported 0.00 turns; the gate setting was 0.00 turns');
    expect(html).not.toContain('the water was 0.00');
    const level = required(dawn.doubts?.find((r) => r.gauge === 'level'));
    expect(html).toContain(
      `level gauge: reported ${level.value.toFixed(2)}; the known value was ${level.truth.toFixed(2)}`,
    );
  }
});
