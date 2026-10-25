import { FRAMEWORK_VERSION } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { required } from './required.ts';

it('starts every original person with persisted published plain narration', () => {
  const state = newGame(42);
  expect(FRAMEWORK_VERSION).toBe('3.0.0');
  expect(state.people).toHaveLength(5);
  for (const person of state.people) {
    expect(person.engine).toBe('2.23.0');
    expect(person.lexicon).toMatchObject({ plainEnglish: true });
    expect(person.body.doze).toBeUndefined();
    expect(person.body.bladder).toBeUndefined();
  }
  const file = exportCurrent(state);
  expect(file.framework).toBe('3.0.0');
  expect(exportCurrent(importCurrent(structuredClone(file)))).toEqual(file);
});

it('replays current input logs and refuses an older framework header plainly', () => {
  const state = newGame(7);
  queueInput(state, { kind: 'ask', keeper: 'dai', job: 'level' });
  for (let minute = 0; minute < 60; minute++) step(state);
  const file = exportCurrent(state);
  expect(exportCurrent(importCurrent(structuredClone(file)))).toEqual(file);
  file.framework = '2.18.0';
  expect(() => importCurrent(file)).toThrow(/Start a new game\./);
});

it('does not silently change a saved narration choice', () => {
  const file = exportCurrent(newGame(42));
  required(file.state.people[0]).lexicon = { plainEnglish: false };
  const saved = structuredClone(file);
  expect(() => importCurrent(file)).toThrow(/Start a new game\./);
  expect(file).toEqual(saved);
});
