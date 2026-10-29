import type { Lab } from '@adam0white/lab-client';
import { expect, it, vi } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { ALLOCATION } from '../src/sim/cast.ts';
import { cloneState, newGame, queueInput, step } from '../src/sim/dam.ts';
import { exportCurrent } from '../src/sim/run.ts';

function harness(file = false) {
  const calls: string[] = [];
  const shelf = {
    ready: Promise.resolve(),
    enabled: false,
    prepare: () => {
      calls.push('prepare');
    },
    prepareBatch: () => {
      calls.push('prepareBatch');
    },
    put: () => {
      calls.push('put');
    },
    putBatch: () => {
      calls.push('putBatch');
    },
    close: () => {
      calls.push('close');
    },
  };
  const lab = {
    build: () => ({ c: 'test' }),
    setPersonaRecording() {},
    allowPersonaRecording: async () => {
      calls.push('record');
      return false;
    },
  } as unknown as Lab;
  return { c: new Continuity(lab, shelf as never, () => {}, file), calls };
}
// SCOPE: unsupported outbound custody refusal is independent of busy/idle/paused metadata,
// and precedes every SDK journal/shelf/ownership operation for all five actors.
it('refuses all five current producers before writes even after input/metadata stripping', async () => {
  const { c, calls } = harness();
  const s = await c.fresh(7, true);
  queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level' });
  step(s);
  const before = c.localSave(s);
  for (const actor of ALLOCATION)
    await expect(c.checkpoint(actor.castId)).rejects.toThrow('no person or source history was published');
  expect(calls).toEqual([]);
  expect(c.localSave(s)).toBe(before);
  s.inputs = [];
  s.applied = 0;
  for (const actor of ALLOCATION)
    await expect(c.checkpoint(actor.castId)).rejects.toThrow('no person or source history was published');
  expect(calls).toEqual([]);
});
it('keeps a genuine complete file original and current continuation; forged replacements preserve both', async () => {
  const { c, calls } = harness(true);
  const s = newGame(7);
  for (let n = 0; n < 3; n++) step(s);
  const text = JSON.stringify(exportCurrent(s));
  const accepted = await c.importFile(text);
  const before = c.exportSession(accepted);
  const forged = structuredClone(exportCurrent(accepted));
  forged.state.water.level += 1;
  await expect(c.importFile(JSON.stringify(forged))).rejects.toThrow('replay');
  expect(c.exportSession(accepted)).toEqual(before);
  const stripped = structuredClone(exportCurrent(accepted));
  stripped.inputs = [];
  stripped.state.inputs = [];
  stripped.state.applied = 0;
  stripped.state.said = [];
  await expect(c.importFile(JSON.stringify(stripped))).rejects.toThrow();
  expect(c.exportSession(accepted)).toEqual(before);
  expect(calls).toEqual([]);
  step(accepted);
  const packet = c.exportSession(accepted);
  expect(packet.original.text).toBe(text);
  const other = harness(true);
  expect(cloneState(await other.c.importFile(JSON.stringify(packet)))).toEqual(cloneState(accepted));
});
it('refuses HF3 before replacing a held native watch or claiming people', async () => {
  const { c, calls } = harness();
  const held = await c.fresh(7, true);
  const before = c.localSave(held);
  const old = exportCurrent(newGame(7));
  old.framework = '3.0.0';
  await expect(c.importFile(JSON.stringify(old))).rejects.toThrow('unsupported');
  expect(c.localSave(held)).toBe(before);
  expect(calls).toEqual([]);
});
