import { describe, expect, it } from 'vitest';
import { discoveriesFor } from '../src/sim/cast.ts';
import { cloneState, newGame, planOf, queueInput, replay, step, watchFrom } from '../src/sim/dam.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { reportBody } from '../src/ui/report.ts';
import { required } from './required.ts';

const rules = { edition: 'extended-1', dam: 'upper' } as const;
describe('extended watch opt-in', () => {
  it('pins the new rules without changing the unmarked opening or replay', () => {
    const old = newGame(7);
    const extended = newGame(7, undefined, rules);
    expect(extended.rules).toEqual(rules);
    expect(old.rules).toBeUndefined();
    expect(extended.people).toHaveLength(5);
    expect(extended.people.find((p) => p.id === 'dai')?.body.doze).toBeDefined();
    expect(old.people.find((p) => p.id === 'dai')?.body.doze).toBeUndefined();
    queueInput(extended, { kind: 'ask', keeper: 'dai', job: 'level' });
    for (let i = 0; i < 90; i++) step(extended);
    expect(exportCurrent(importCurrent(exportCurrent(extended)))).toEqual(exportCurrent(extended));
    expect(cloneState(replay(7, extended.inputs, extended.minute, undefined, rules))).toEqual(
      cloneState(extended),
    );
    const bad = exportCurrent(extended);
    bad.state.rules = { ...rules, dam: 'unknown' } as never;
    expect(() => importCurrent(bad)).toThrow();
  });
  it('compares a marked received report at dawn without granting a catch from lightning alone', () => {
    const s = newGame(7, undefined, rules);
    queueInput(s, { kind: 'doubt', report: s.reports.indexOf(required(s.board.level)), marked: true });
    while (s.phase === 'watch') step(s);
    const dawn = required(s.dawns[0]);
    expect(dawn.doubts).toHaveLength(1);
    expect(required(dawn.doubts)[0]).toMatchObject({ who: 'dai', value: s.reports[1]?.value });
    expect(reportBody(dawn, false)).toContain('Readings you doubted');
    expect(reportBody(dawn, false)).not.toContain('lightning showed the wall');
  });
  it('offers a standing arrangement but rejects a forged threshold or an unavailable keeper', () => {
    const s = newGame(7, undefined, rules);
    queueInput(s, { kind: 'standing', keeper: 'dai', threshold: 4.5, target: 2 });
    step(s);
    expect(s.arrangements?.dai).toMatchObject({ threshold: 4.5, target: 2 });
    queueInput(s, { kind: 'standing', keeper: 'callum', threshold: 4.5, target: 2 });
    step(s);
    expect(s.arrangements?.callum).toBeUndefined();
    queueInput(s, { kind: 'standing', keeper: 'dai', threshold: Number.NaN, target: 6 });
    step(s);
    expect(s.arrangements?.dai?.threshold).toBe(4.5);
    expect(s.said.some((x) => x.text.includes('standing request'))).toBe(true);
  });
  it('has authored later nights and different real dam routes', () => {
    const s = newGame(7, undefined, rules);
    s.night = 8;
    expect(planOf(s).title).toContain('Second Monday');
    expect(planOf(s).storm).not.toEqual(planOf(newGame(7)).storm);
    expect(s.water.basin).toBe('upper');
  });
});

it('keeps each received keeper reading when another keeper reads twice, excluding held radio reports', async () => {
  const { receivedReadings } = await import('../src/ui/readings.ts');
  const s = newGame(7);
  const base = required(s.board.level);
  const callum = { ...base, who: 'callum' as const, value: 4.8, at: base.at + 1 };
  const dai = { ...base, value: 4.1, at: base.at + 2 };
  const daiAgain = { ...base, value: 4.0, at: base.at + 3 };
  const held = { ...base, who: 'callum' as const, value: 5.9, at: base.at + 4 };
  s.reports.push(callum, dai, daiAgain, held);
  s.held.push(held);
  s.board.level = daiAgain;
  expect(receivedReadings(s, 'level').map((r) => [r.who, r.value])).toEqual([
    ['callum', 4.8],
    ['dai', 4.0],
  ]);
});

it('creates an explicit practice branch with the same prior history, without mutating the actual run', async () => {
  const { practiceNight } = await import('../src/sim/practice.ts');
  const s = newGame(7, undefined, rules);
  while (s.phase === 'watch') step(s);
  const before = cloneState(s);
  const branch = practiceNight(s, 0);
  expect(s).toEqual(before);
  expect(branch.rules).toEqual(rules);
  expect(branch.dawns).toHaveLength(1);
  expect(branch.inputs).toContainEqual({
    at: watchFrom(1),
    kind: 'ask',
    keeper: 'dai',
    job: 'gate',
    target: 0,
  });
  expect(branch.reports).not.toBe(s.reports);
  expect(branch.dawns[0]?.series.map((x) => x.rain)).toEqual(
    s.dawns[0]?.series.slice(0, branch.dawns[0]?.series.length).map((x) => x.rain),
  );
});

it('keeps a daytime overtop instead of resetting it before the next watch', () => {
  const s = newGame(7, undefined, rules);
  while (s.phase === 'watch') step(s);
  s.phase = 'dawn';
  s.water.level = 5.999;
  s.water.store = 5000;
  s.water.overtopped = false;
  queueInput(s, { kind: 'next' });
  expect(s.phase).toBe('end');
  expect(s.night).toBe(1);
  expect(s.dawns.at(-1)?.daytimeLoss?.at).toBeLessThan(watchFrom(2));
  expect(reportBody(required(s.dawns.at(-1)), false)).toContain('following day');
});

it('uses actual HF doze onset and a delivered radio alarm to wake, with full replay', async () => {
  const { readDoze } = await import('@adam0white/human-framework');
  const s = newGame(7, undefined, rules);
  while (s.phase === 'watch' && !readDoze(required(s.people[0]))?.asleep) step(s);
  expect(readDoze(required(s.people[0]))?.asleep).toBe(true);
  expect(s.keepers[0]?.place).toBe('hut');
  expect(s.keepers[0]?.dozes.length).toBeGreaterThan(0);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  step(s);
  expect(readDoze(required(s.people[0]))?.asleep).toBe(false);
  expect(exportCurrent(importCurrent(exportCurrent(s)))).toEqual(exportCurrent(s));
});

it('reaches the second Friday with the same five people, real cover cost, fatigue and exact full replay', () => {
  const s = newGame(1, undefined, rules);
  const admitted = s.people.map((p) => structuredClone(p.rng));
  let expiredVisitors: string[] | undefined;
  while (s.phase !== 'end') {
    if (s.phase === 'dawn') {
      queueInput(s, { kind: 'next' });
      continue;
    }
    const m = s.minute - watchFrom(s.night);
    if (s.night === 8 && m === 0)
      expiredVisitors = discoveriesFor(s).filter((id) => id === 'bilal' || id === 'wren');
    if (m === 1 && s.night >= 2 && s.night <= 5) queueInput(s, { kind: 'recruit' });
    if (m === 2)
      queueInput(s, { kind: 'standing', keeper: required(planOf(s).keepers[0]), threshold: 4.5, target: 2 });
    if (m % 60 === 5)
      queueInput(s, {
        kind: 'ask',
        keeper: required(planOf(s).keepers[0]),
        job: 'gate',
        target: m < 250 ? 2 : 4,
      });
    if (m === 130 || m === 300)
      queueInput(s, { kind: 'ask', keeper: required(planOf(s).keepers[0]), job: 'level' });
    step(s);
  }
  expect(expiredVisitors).toEqual([]);
  expect(s.said.some((line) => line.text.includes('visits have ended'))).toBe(true);
  expect(s.night).toBe(12);
  expect(s.dawns).toHaveLength(12);
  expect(s.people.map((p) => p.id)).toEqual(['dai', 'callum', 'nerys', 'bilal', 'wren']);
  expect(s.said.some((x) => x.text.includes('finished the briefing'))).toBe(true);
  const bilal = required(s.people.find((p) => p.id === 'bilal'));
  expect(bilal.now).toBeGreaterThan(watchFrom(12));
  expect(bilal.rng).not.toEqual(admitted[3]);
  expect(s.people[0]?.body.depletion).toBeDefined();
  expect(exportCurrent(importCurrent(exportCurrent(s)))).toEqual(exportCurrent(s));
});

it('uses HF quantity RNG and felt confidence only on an actual observation', async () => {
  const { estimateRead } = await import('../src/sim/reading.ts');
  const { estimateQuantity, snapshot, restore } = await import('@adam0white/human-framework');
  const { clarityOf, biasOf, confidenceOf } = await import('../src/sim/reading.ts');
  const p = required(newGame(7).people[0]);
  const control = restore(snapshot(p));
  const c = clarityOf(p, 0.5);
  const expected = estimateQuantity(control, { truth: 4.2, difficulty: 0.35 + 0.35 * 0.5 });
  const actual = estimateRead(p, 'dai', 4.2, 0.5, 1);
  expect(actual).toEqual({
    value: expected.value + biasOf('dai', c),
    confidence: expected.confidence * confidenceOf(p, c),
  });
  expect(p.rng).toEqual(control.rng);
});

it('keeps the actual night review and attributes a requested nap without rewriting the lapse', () => {
  const s = newGame(7, undefined, { ...rules, dam: 'valley' });
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'nap', insist: true });
  while (s.phase === 'watch') step(s);
  expect(s.keepers[0]?.orderedNap).toBe(true);
  expect(s.dawns[0]?.lines.find((l) => l.id === 'dai')?.line).toContain('order');
  expect(s.keepers[0]?.watchReview?.missed).toContain('my watch');
});

it('loads a prepared extended chapter with the same doze opt-in on every pinned keeper', async () => {
  const { ALLOCATION } = await import('../src/sim/cast.ts');
  const { DIALECT } = await import('../src/sim/passport.ts');
  const base = newGame(7, undefined, rules);
  const chapter = {
    version: DIALECT as 'glance-cast/1',
    inputs: [],
    claims: [],
    initial: Object.fromEntries(
      base.people.map((p) => [required(ALLOCATION.find((c) => c.id === p.id)).castId, structuredClone(p)]),
    ),
  };
  const s = newGame(7, chapter, rules);
  expect(exportCurrent(importCurrent(exportCurrent(s)))).toEqual(exportCurrent(s));
});

it('stamps the actual doze wake at the radio input minute, matching the dawn span', async () => {
  const { readDoze } = await import('@adam0white/human-framework');
  const s = newGame(7, undefined, rules);
  const p = required(s.people[0]);
  while (s.phase === 'watch' && !readDoze(p)?.asleep) step(s);
  const calledAt = s.minute;
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  step(s);
  expect(p.body.lastSleep?.to).toBe(calledAt);
  expect(s.keepers[0]?.dozes.at(-1)?.to).toBe(calledAt);
});

function invitationControl() {
  const s = newGame(1, undefined, rules);
  while (s.phase === 'watch') {
    const m = s.minute - watchFrom(s.night);
    if (m % 60 === 5) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: m < 250 ? 2 : 4 });
    step(s);
  }
  expect(s.phase).toBe('dawn');
  queueInput(s, { kind: 'next' });
  step(s);
  const at = s.minute;
  const p = required(s.people.find((p) => p.id === 'bilal'));
  const material = p.chronicleDay?.material ?? 0;
  const exertion = p.body.exertion;
  queueInput(s, { kind: 'recruit' });
  step(s);
  return { s, p, at, material, exertion };
}
it('starts the invited travel at the actual input time and covers all 48 minutes', () => {
  const { s, p, at, exertion } = invitationControl();
  expect(p.activity?.affordance.effort).toBe(0.4);
  expect(p.activity?.startedAt).toBe(at);
  expect(p.activity?.endsAt).toBe(at + 48);
  while (s.minute <= at + 48) step(s);
  expect(s.keepers.find((k) => k.id === 'bilal')?.on).toBe(true);
  expect(p.body.exertion).toBeGreaterThan(exertion);
  expect(exportCurrent(importCurrent(exportCurrent(s)))).toEqual(exportCurrent(s));
});
it('realizes the authored briefing payment only when the offered work completes', () => {
  const { s, p, material } = invitationControl();
  const until = required(p.activity).endsAt;
  expect(p.chronicleDay?.material).toBe(material);
  while (s.minute <= until) step(s);
  expect(p.chronicleDay?.material).toBe(material + 5);
  step(s);
  expect(p.chronicleDay?.material).toBe(material + 5);
});
it('gives no spoken forecast from a physically dozing keeper', async () => {
  const { readDoze } = await import('@adam0white/human-framework');
  const { hint } = await import('../src/sim/dam.ts');
  const s = newGame(7, undefined, rules);
  const p = required(s.people[0]);
  while (s.phase === 'watch' && !readDoze(p)?.asleep) step(s);
  const before = cloneState(s);
  expect(hint(s, 'dai', 'level').forecast).toBe('');
  expect(hint(s, 'dai', 'gate', 3).forecast).toBe('');
  expect(s).toEqual(before);
});
it('keeps the formal review but does not certify awake coverage over recorded doze spans', () => {
  const s = newGame(7, undefined, rules);
  while (s.phase === 'watch') {
    if (s.minute === 1512) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
    step(s);
  }
  expect(s.keepers[0]?.watchReview?.kept).toContain('my watch');
  expect(s.dawns[0]?.dozes.some((d) => d.to > d.from)).toBe(true);
  expect(s.dawns[0]?.lines.find((l) => l.id === 'dai')?.line).not.toContain('kept my watch');
});
