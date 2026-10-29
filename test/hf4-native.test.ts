import { beforeAll, expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { archiveWatch, verifyWatch } from '../src/sim/hf4.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';

let raw: ReturnType<typeof exportCurrent>;
beforeAll(() => {
  const s = newGame(7);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  for (let n = 0; n < 20; n++) step(s);
  raw = exportCurrent(s);
});
// SCOPE: independent native continuation and forged-source admission each keep the
// ordinary deadline. The shared fixture is immutable actual public preparation.
it('restores both complete histories and continues with the same next input', () => {
  const s = importCurrent(structuredClone(raw));
  const restored = importCurrent(structuredClone(raw));
  expect(exportCurrent(restored)).toEqual(raw);
  queueInput(s, { kind: 'ring' });
  queueInput(restored, { kind: 'ring' });
  for (let n = 0; n < 10; n++) {
    step(s);
    step(restored);
  }
  expect(exportCurrent(restored)).toEqual(exportCurrent(s));
});
it('verifies the complete shared Run independently', () => {
  const s = importCurrent(structuredClone(raw));
  expect(verifyWatch(s.people[0]!).verified).toBe(true);
  expect(archiveWatch(s.people[0]!).run.current.people).toHaveProperty('dai');
});
it('refuses old versions and edited host state without changing the candidate', () => {
  const bad = structuredClone(raw);
  bad.framework = '3.0.0';
  const old = structuredClone(bad);
  expect(() => importCurrent(bad)).toThrow();
  expect(bad).toEqual(old);
  const forged = structuredClone(raw);
  forged.state.water.level += 1;
  const saved = structuredClone(forged);
  expect(() => importCurrent(forged)).toThrow('replay');
  expect(forged).toEqual(saved);
});
