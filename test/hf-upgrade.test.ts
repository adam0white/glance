import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { required } from './required.ts';

it('starts every original person with persisted published plain narration', () => {
  const state = newGame(42);
  expect(FRAMEWORK_VERSION).toBe('4.8.0');
  expect(state.people).toHaveLength(5);
  for (const person of state.people) {
    expect(person.engine).toBe('4.8.0');
    expect(Object.isFrozen(person)).toBe(true);
    expect(person.body.bladder).toBeDefined();
  }
  const file = exportCurrent(state);
  expect(file.framework).toBe('4.8.0');
  expect(exportCurrent(importCurrent(structuredClone(file)))).toEqual(file);
});

it('replays current input logs and refuses an older framework header plainly', () => {
  const state = newGame(7);
  queueInput(state, { kind: 'ask', keeper: 'dai', job: 'level' });
  for (let minute = 0; minute < 60; minute++) step(state);
  const file = exportCurrent(state);
  expect(exportCurrent(importCurrent(structuredClone(file)))).toEqual(file);
  file.framework = '2.18.0';
  expect(() => importCurrent(file)).toThrow(/Keep the file/);
});

// SCOPE: complete current actor state cannot be changed through a saved opening copy.
it('refuses an edited full retained actor without changing the candidate', () => {
  const file = exportCurrent(newGame(42));
  const bad = structuredClone(file) as any;
  bad.state.hf.run.current.people.dai.body.health = 0.5;
  const before = structuredClone(bad);
  expect(() => importCurrent(bad)).toThrow();
  expect(bad).toEqual(before);
});
