import { expect, it } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { required } from './required.ts';

it('starts every original person with persisted published plain narration', () => {
  const state = newGame(42);
  expect(FRAMEWORK_VERSION).toBe('4.13.0');
  expect(state.people).toHaveLength(5);
  for (const person of state.people) {
    expect(person.engine).toBe('4.13.0');
    expect(Object.isFrozen(person)).toBe(true);
    expect(person.body.bladder).toBeDefined();
  }
  const file = exportCurrent(state);
  expect(file.framework).toBe('4.13.0');
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

it('refuses a 4.8 watch before replacement and preserves its bytes', async () => {
  const { archiveWatch, restoreWatch } = await import('../src/sim/hf4.ts');
  const archive = structuredClone(archiveWatch(newGame(7).people[0]!));
  archive.run = {
    ...archive.run,
    engine: { ...archive.run.engine, package: '@adam0white/human-framework@4.8.0' },
  };
  const before = structuredClone(archive);
  expect(() => restoreWatch(archive)).toThrow(/Keep the file.*start a new/i);
  expect(archive).toEqual(before);
});

it('pins current replay bytes for the HF 4.13 engine identity', async () => {
  const { createHash } = await import('node:crypto');
  const state = newGame(7);
  queueInput(state, { kind: 'ask', keeper: 'dai', job: 'level' });
  for (let minute = 0; minute < 20; minute++) step(state);
  const file = exportCurrent(state);
  expect(createHash('sha256').update(JSON.stringify(file)).digest('hex')).toBe(
    '818813373f6a48a8ff1194b66f84c9fd9e78b13ac3bedf290a21a04c1c27cf54',
  );
  expect(exportCurrent(importCurrent(structuredClone(file)))).toEqual(file);
});
