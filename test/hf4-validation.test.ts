import { expect, it, vi } from 'vitest';
import { cloneState, hint, newGame, queueInput, step } from '../src/sim/dam.ts';
import { displayOwner } from '../src/sim/display.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { CandidateValidation } from '../src/validation.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';

// SCOPE: the UI owns read-only inspections. The exact production owner handles
// the public command; native bytes must equal the direct complete source run.
it('keeps the Run in its owner and exchanges real inputs and read-only inspections', async () => {
  vi.stubGlobal('Worker', BrowserWorker);
  const v = new CandidateValidation();
  try {
    const s = await v.create(7);
    v.keep(s);
    const owner = displayOwner(s)!;
    expect(owner).toBeDefined();
    expect(Object.isFrozen(s.people[0]!.body)).toBe(true);
    expect(() => queueInput(s, { kind: 'ring' })).toThrow('source worker');
    const input = { kind: 'ask', keeper: 'dai', job: 'level' } as const;
    await owner.mutate({ input });
    await owner.mutate({ minutes: 1 });
    const control = newGame(7);
    queueInput(control, input);
    step(control);
    expect(cloneState(s)).toEqual(cloneState(control));
    const before = exportCurrent(s);
    hint(s, 'dai', 'gate', 3);
    for (let n = 0; n < 30; n++) await Promise.resolve();
    expect(exportCurrent(s)).toEqual(before);
    expect(exportCurrent(importCurrent(before))).toEqual(before);
  } finally {
    v.clear();
    disposeBrowserWorkers();
    vi.unstubAllGlobals();
  }
});
// Cancellation is a transport control, never a winning actor or a shortened replay.
it('discards only a cancelled candidate and keeps the held complete native archive', async () => {
  vi.stubGlobal('Worker', BrowserWorker);
  const terminate = vi.spyOn(BrowserWorker.prototype, 'terminate');
  const v = new CandidateValidation();
  try {
    const held = await v.create(7);
    v.keep(held);
    const before = exportCurrent(held);
    const pending = v.load(structuredClone(before));
    const rejection = expect(pending).rejects.toThrow('cancelled');
    v.cancel();
    await rejection;
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(exportCurrent(held)).toEqual(before);
    expect(exportCurrent(importCurrent(before))).toEqual(before);
  } finally {
    v.clear();
    disposeBrowserWorkers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
// SCOPE: complete original + next complete native snapshot must fit. A real
// production owner rolls back only the rejected candidate minute, never an archive.
it('refuses a real file continuation at capacity and keeps exact original and prior native state', async () => {
  const { FILE_BYTES, encodeText } = await import('../src/file-admission.ts');
  vi.stubGlobal('Worker', BrowserWorker);
  const v = new CandidateValidation();
  try {
    const raw = exportCurrent(newGame(7)),
      source = { ...raw, capacityPadding: '' };
    const empty = JSON.stringify(source);
    const overhead = encodeText(
      JSON.stringify({
        format: 'glance-file-session/1',
        original: { text: empty, sha256: '0'.repeat(64) },
        provenance: null,
        current: { ...raw, castSources: [] },
      }),
    ).byteLength;
    source.capacityPadding = 'x'.repeat(FILE_BYTES - overhead - 500);
    const text = JSON.stringify(source);
    const held = await v.file(text);
    v.keep(held);
    const before = exportCurrent(held),
      context = structuredClone(v.fileContext(held));
    await expect(displayOwner(held)!.mutate({ minutes: 1 })).rejects.toThrow('capacity');
    expect(exportCurrent(held)).toEqual(before);
    expect(v.fileContext(held)).toEqual(context);
    expect(context?.original.text).toBe(text);
    await displayOwner(held)!.mutate({ minutes: 0 });
    expect(exportCurrent(held)).toEqual(before);
  } finally {
    v.clear();
    disposeBrowserWorkers();
    vi.unstubAllGlobals();
  }
});
