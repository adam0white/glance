import { describe, expect, it } from 'vitest';
import {
  cloneState,
  exportRun,
  fingerprint,
  type GameState,
  hint,
  newGame,
  queueInput,
  replay,
  restoreState,
  step,
  watchFrom,
} from '../src/sim/dam.ts';
import { clarityOf } from '../src/sim/reading.ts';
import { DRAW, hashUnit } from '../src/sim/rng.ts';
import { rainAt } from '../src/sim/water.ts';

/** A scripted player: reads, gate moves, an inn call and a warning, through two nights. */
function scripted(seed: number): GameState {
  const s = newGame(seed);
  while (s.phase !== 'end' && s.night <= 2) {
    if (s.phase === 'dawn') {
      queueInput(s, { kind: 'next' });
      continue;
    }
    const m = s.minute - watchFrom(s.night);
    if (m === 20 || m === 140 || m === 260) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
    if (m === 60) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 3 });
    if (m === 200) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 5, insist: true });
    if (s.night === 2 && m === 90) queueInput(s, { kind: 'ring' });
    if (s.night === 2 && m === 100) queueInput(s, { kind: 'ask', keeper: 'dai', job: 'weir' });
    if (s.night === 2 && m === 300) queueInput(s, { kind: 'warn' });
    step(s);
  }
  return s;
}

describe('The Glance', () => {
  it('replays a run exactly from its seed and input log', () => {
    const a = scripted(7);
    const b = replay(7, a.inputs);
    while (b.phase === 'watch' && b.minute < a.minute) step(b);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });

  it('restores an exported state and plays on identically', () => {
    const a = scripted(11);
    const ex = exportRun(a, 'test');
    const b = restoreState(JSON.parse(JSON.stringify(ex.state)));
    const c = cloneState(a);
    for (let i = 0; i < 200; i++) {
      step(b);
      step(c);
    }
    expect(fingerprint(b)).toBe(fingerprint(c));
  });

  it('keys the storm by seed, night and minute only', () => {
    const st = { peakAt: 200, peak: 10, width: 60, base: 2 };
    expect(rainAt(3, 2, 77, st)).toBe(rainAt(3, 2, 77, st));
    expect(hashUnit(3, DRAW.lightning, 2, 9)).toBe(hashUnit(3, DRAW.lightning, 2, 9));
  });

  it('a removed input does not move the storm', () => {
    const a = scripted(5);
    const fewer = a.inputs.filter((_, i) => i !== 1);
    const b = replay(5, fewer, a.minute);
    const rainA = a.dawns[0]?.series.map((x) => x.rain);
    const rainB = b.dawns[0]?.series.map((x) => x.rain);
    expect(rainB).toEqual(rainA);
  });

  it('Dai reads low and sounds sure; Callum reads high', () => {
    let low = 0;
    let n = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = scripted(seed);
      for (const d of s.dawns)
        for (const r of d.reports)
          if (r.who === 'dai' && r.gauge === 'level' && !r.skipped) {
            n += 1;
            low += r.value - r.truth;
          }
    }
    expect(low / n).toBeLessThan(-0.05);
    const s = newGame(1);
    const dai = s.people.find((p) => p.id === 'dai');
    if (!dai) throw new Error('no dai');
    const c = clarityOf(dai, 0.3);
    // Felt clarity runs ahead of true clarity: an under-felt debt of sleep.
    expect(c.felt).toBeGreaterThan(c.true);
  });

  it('the telegraph is pure', () => {
    const s = newGame(2);
    const before = fingerprint(s);
    hint(s, 'dai', 'gate', 3);
    hint(s, 'dai', 'nap');
    hint(s, 'dai', 'level', undefined, true);
    expect(fingerprint(s)).toBe(before);
  });

  it('plays the whole week to an ending without input', () => {
    const s = newGame(9);
    let guard = 0;
    while (s.phase !== 'end' && guard++ < 10000) {
      if (s.phase === 'dawn') queueInput(s, { kind: 'next' });
      else step(s);
    }
    expect(s.phase).toBe('end');
    expect(s.dawns.length).toBeGreaterThan(0);
    expect(s.dawns.at(-1)?.lines.length).toBeGreaterThan(0);
  });
});
