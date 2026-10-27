// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { personaChannel } from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Continuity } from '../src/continuity.ts';
import { queueInput, step } from '../src/sim/dam.ts';
import { exportCurrent, importCurrent } from '../src/sim/run.ts';
import { lab } from '../src/ui/lab.ts';

// Technical prepared candidate, not owner-observed Resume or a runtime receipt.
// Exact technical prepared bytes retained inline for a portable source regression. No owner save.
const fixtureText = gunzipSync(
  Buffer.from(
    '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',
    'base64',
  ),
).toString('utf8');
it('bound prepared Glance native wrapper passes the existing complete public importer', () => {
  const text = fixtureText;
  expect(Buffer.byteLength(text)).toBe(32290);
  expect(createHash('sha256').update(text).digest('hex')).toBe(
    '59cc6a4bea559dc8b7aa66654b632b798d30ae17e543b388063e33640b3662de',
  );
  const raw = JSON.parse(text);
  const state = importCurrent(raw.run);
  expect(exportCurrent(state).state).toEqual(raw.run.state);
});

vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: vi.fn(() => {
    throw new Error('File mode constructed Shelf');
  }),
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    build: () => ({ c: 'synthetic-source-test' }),
    setPersonaRecording() {},
    screen() {},
    milestone() {},
    trackRun: vi.fn(),
    captureSave: vi.fn(),
    privacySignalOn: false,
    privacyOverride: false,
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('foreign Glance file keeps owner week through pause hide and completion', async () => {
  vi.resetModules();
  window.history.replaceState({}, '', '/?file=1');
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.setItem('glance-cast-local-v3', 'synthetic occupied native sentinel');
  localStorage.setItem('glance-recovery-sentinel', 'synthetic recovery sentinel');
  const access: string[] = [];
  for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
    const original = Storage.prototype[method];
    vi.spyOn(Storage.prototype, method).mockImplementation(function (this: Storage, ...args: string[]) {
      if (args[0]?.startsWith('glance')) access.push(method + ':' + args[0]);
      return Reflect.apply(original, this, args);
    });
  }
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const app = await import('../src/ui/app.ts');
  app.start();
  expect(app._debug.state).toBeNull();
  expect(document.body.textContent).toContain('Play a saved file');
  expect(access).toEqual([]);
  expect(lab.trackRun).not.toHaveBeenCalled();
  const text = fixtureText;
  const raw = JSON.parse(text);
  async function choose(text: string) {
    const input = document.getElementById('file') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [
        {
          size: Buffer.byteLength(text),
          arrayBuffer: async () => new TextEncoder().encode(text).buffer,
          text: async () => text,
        },
      ],
    });
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const click = (id: string) => {
    const el = document.getElementById(id);
    expect(el, id).not.toBeNull();
    el?.click();
  };
  await choose(text);
  expect(app._debug.state).not.toBeNull();
  const state = app._debug.state!;
  expect(exportCurrent(state).state).toEqual(raw.run.state);
  expect(lab.trackRun).toHaveBeenCalledTimes(1);
  // Actual menu handlers, logged pause/resume and real frame callback.
  click('menu');
  click('file-departure');
  click('dialog-back');
  for (let i = 0; i < 80; i++) frame?.(performance.now() + i * 250);
  expect(state.chapterPaused).toBe(true);
  click('menu');
  click('dialog-back');
  for (let i = 0; i < 80; i++) frame?.(performance.now() + 22000 + i * 250);
  const gauge = document.querySelector<HTMLElement>('[data-g="level"]');
  expect(gauge).not.toBeNull();
  gauge?.click();
  const request = document.querySelector<HTMLElement>('.sheet [data-job="level"]');
  expect(request).not.toBeNull();
  request?.click();
  expect(state.inputs.at(-1)?.kind).toBe('ask');
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));
  let downloaded: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloaded = blob as Blob;
    return 'blob:synthetic';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  // happy-dom does not implement download navigation; retain actual Blob/button path.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  click('menu');
  click('file-download');
  expect(downloaded).toBeDefined();
  const envelope = JSON.parse(await downloaded!.text());
  expect(envelope.original).toEqual({
    text,
    sha256: '59cc6a4bea559dc8b7aa66654b632b798d30ae17e543b388063e33640b3662de',
  });
  expect(envelope.provenance).toEqual(raw);
  expect(envelope.current.state).toEqual(exportCurrent(state).state);
  const c = new Continuity(lab, undefined, () => {}, true);
  const restored = await c.importFile(JSON.stringify(envelope));
  expect(c.heads).toEqual([]);
  expect(c.sources).toEqual(raw.sources);
  expect(exportCurrent(restored)).toEqual(exportCurrent(state));
  queueInput(state, { kind: 'ring' });
  queueInput(restored, { kind: 'ring' });
  step(state);
  step(restored);
  expect(exportCurrent(restored)).toEqual(exportCurrent(state));
  const before = JSON.stringify(c.exportSession(restored));
  for (const bad of [
    '{',
    JSON.stringify({ ...envelope, provenance: {} }),
    JSON.stringify({ ...raw, heads: [{}] }),
    JSON.stringify({
      ...raw,
      run: { ...raw.run, state: { ...raw.run.state, minute: raw.run.state.minute + 1 } },
    }),
  ]) {
    await expect(c.importFile(bad)).rejects.toThrow();
    expect(JSON.stringify(c.exportSession(restored))).toBe(before);
  }
  expect(() => c.checkpoint('hf.cast.nerys.glance', true)).toThrow();
  await expect(c.setEnabled(true)).rejects.toThrow();
  await expect(c.checkpointAll()).rejects.toThrow();
  click('choose-another');
  await choose('{');
  expect(app._debug.state).toBe(state);
  expect(document.getElementById('file-result')?.textContent).toContain('unchanged');
  click('file-resume');
  // Complete via real sim inputs, without replacing state or people.
  for (let night = 0; night < 13 && state.phase !== 'end'; night++) {
    app._debug.step(1000);
    if (state.phase === 'dawn') document.getElementById('next')?.click();
  }
  expect(state.phase).toBe('end');
  window.dispatchEvent(new Event('pagehide'));
  expect(access).toEqual([]);
  expect(personaChannel).not.toHaveBeenCalled();
  const capture = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0] as ReturnType<
    Continuity['exportSession']
  >;
  expect(capture.current).toEqual(c.export(state));
  const finalFile = new Continuity(lab, undefined, () => {}, true);
  const final = await finalFile.importFile(JSON.stringify(c.exportSession(state)));
  expect(exportCurrent(final)).toEqual(exportCurrent(state));
  const measure = (value: unknown) => {
    let nodes = 0,
      depth = 0;
    const visit = (item: unknown, level: number) => {
      nodes++;
      depth = Math.max(depth, level);
      if (item && typeof item === 'object') for (const child of Object.values(item)) visit(child, level + 1);
    };
    visit(value, 0);
    return { bytes: Buffer.byteLength(JSON.stringify(value)), nodes, depth };
  };
  console.info(
    'Glance bound file proof sizes',
    JSON.stringify({
      originalBytes: Buffer.byteLength(text),
      importedEnvelope: measure(envelope),
      completedEnvelope: measure(c.exportSession(state)),
      completePeople: exportCurrent(state).state.people.length,
    }),
  );
  app.start();
  await choose(JSON.stringify(raw.run)); // both actual native wrapper and public export use the chooser
  expect(exportCurrent(app._debug.state!)).toEqual(raw.run);
  const registrations = vi.mocked(lab.trackRun).mock.calls.length;
  vi.resetModules();
  const reload = await import('../src/ui/app.ts');
  reload.start();
  expect(reload._debug.state).toBeNull();
  expect(vi.mocked(lab.trackRun).mock.calls.length).toBe(registrations);
  expect(document.body.textContent).toContain('Play a saved file');
  expect(access).toEqual([]);
}, 60000);

// RED blocker: unchanged public replay cannot round-trip a pause at the opening minute.
it('bound native fixture exports a paused state accepted by the unchanged complete importer', () => {
  const raw = JSON.parse(fixtureText);
  const state = importCurrent(raw.run);
  queueInput(state, { kind: 'pause' });
  step(state);
  expect(state.chapterPaused).toBe(true);
  expect(state.minute).toBe(raw.run.state.minute);
  expect(() => importCurrent(exportCurrent(state))).not.toThrow();
});

it('refuses semantic provenance unsafe and overcapacity files transactionally and retains real source archives', async () => {
  const raw = JSON.parse(fixtureText);
  const source = JSON.parse(readFileSync('test/fixtures/commonstead-nerys-hf3.json', 'utf8'));
  const archive = {
    revision: source.envelope.revision,
    source: source.envelope.source,
    snapshot: source.raw,
  };
  const run = { ...raw.run, castSources: [archive] };
  const callerBytes = JSON.stringify(run);
  const c = new Continuity(lab, undefined, () => {}, true);
  const state = await c.importFile(callerBytes);
  expect(JSON.stringify(run)).toBe(callerBytes);
  const original = JSON.stringify(c.exportSession(state));
  expect(c.sources).toEqual([archive]);
  for (const action of [
    () => c.checkpoint('hf.cast.nerys.glance'),
    () => c.checkpoint('hf.cast.nerys.glance', true),
    () => c.localSave(state),
    () => c.clear(),
    () => c.shelf,
  ])
    expect(action).toThrow();
  await expect(c.checkpointAll()).rejects.toThrow();
  await expect(c.setEnabled(true)).rejects.toThrow();
  await expect(c.fresh(7)).rejects.toThrow();
  const semantic = structuredClone(run);
  semantic.state.people[0].now += 1;
  const rng = structuredClone(run);
  rng.state.people[0].rng.a += 1;
  const envelope = c.exportSession(state);
  const trimmed = structuredClone(envelope);
  trimmed.current.castSources = [];
  const badDigest = structuredClone(envelope);
  badDigest.original.sha256 = '0'.repeat(64);
  const calendar = structuredClone(run);
  calendar.state.people[0].life.bornAt += 1;
  const badChapter = structuredClone(run);
  badChapter.state.chapter = { claims: [] } as never;
  const deep = '['.repeat(130) + '0' + ']'.repeat(130);
  const bad = [
    '{',
    '{"__proto__":{}}',
    '{"x":1e400}',
    '{"x":' + deep + '}',
    JSON.stringify({ format: 'unknown', ...run }),
    JSON.stringify(semantic),
    JSON.stringify(rng),
    JSON.stringify(calendar),
    JSON.stringify(badChapter),
    JSON.stringify(trimmed),
    JSON.stringify(badDigest),
    JSON.stringify({ ...raw, heads: [{}] }),
    JSON.stringify({ ...run, game: 'glance@old' }),
    JSON.stringify({ items: Array(1_000_001).fill(0) }),
    '{"padding":"' + 'x'.repeat(16 * 1024 * 1024) + '"}',
  ];
  for (const text of bad) {
    await expect(c.importFile(text)).rejects.toThrow();
    expect(JSON.stringify(c.exportSession(state))).toBe(original);
  }
  const restored = new Continuity(lab, undefined, () => {}, true);
  expect(exportCurrent(await restored.importFile(original))).toEqual(exportCurrent(state));
  expect(restored.sources).toEqual([archive]);
});

it('native route resumes the exact local wrapper and invalid file parameters never start owner state', async () => {
  const raw = JSON.parse(fixtureText);
  window.history.replaceState({}, '', '/');
  localStorage.setItem('glance-cast-local-v3', JSON.stringify(raw));
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const shelf = { ready: Promise.resolve(true), enabled: false, request: vi.fn(), setEnabled: vi.fn() };
  vi.mocked(personaChannel).mockImplementation(() => shelf as never);
  vi.resetModules();
  const native = await import('../src/ui/app.ts');
  native.start();
  document.getElementById('cont')!.click();
  await vi.waitFor(() => expect(native._debug.state).not.toBeNull());
  expect(exportCurrent(native._debug.state!)).toEqual(raw.run);
  window.dispatchEvent(new Event('pagehide'));
  expect(localStorage.getItem('glance-cast-local-v3')).toBe(fixtureText);
  expect(shelf.request).not.toHaveBeenCalled();
  expect(shelf.setEnabled).not.toHaveBeenCalled();
  for (const query of ['?file=0', '?file=', '?file=1&file=1', '?file=1&file=other']) {
    vi.mocked(personaChannel).mockClear();
    window.history.replaceState({}, '', '/' + query);
    document.body.innerHTML = '<div id="app"></div>';
    vi.resetModules();
    const invalid = await import('../src/ui/app.ts');
    invalid.start();
    expect(invalid._debug.state).toBeNull();
    expect(document.body.textContent).toContain('file address is invalid');
    expect(personaChannel).not.toHaveBeenCalled();
  }
});

it('refuses file play before a complete next snapshot exceeds reimport capacity', async () => {
  const raw = JSON.parse(fixtureText);
  const stress = { ...raw.run, capacityPadding: '' };
  const probe = new Continuity(lab, undefined, () => {}, true);
  const state = await probe.importFile(JSON.stringify(stress));
  const baseBytes = Buffer.byteLength(JSON.stringify(probe.exportSession(state)));
  stress.capacityPadding = 'x'.repeat(16 * 1024 * 1024 - baseBytes - 8);
  const text = JSON.stringify(stress);
  window.history.replaceState({}, '', '/?file=1');
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.resetModules();
  const app = await import('../src/ui/app.ts');
  app.start();
  const input = document.getElementById('file') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: [
      {
        size: Buffer.byteLength(text),
        arrayBuffer: async () => new TextEncoder().encode(text).buffer,
        text: async () => text,
      },
    ],
  });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(app._debug.state).not.toBeNull(), { timeout: 10000 });
  const before = exportCurrent(app._debug.state!);
  document.getElementById('menu')!.click();
  document.getElementById('file-departure')!.click();
  expect(document.getElementById('file-capacity')).not.toBeNull();
  expect(exportCurrent(app._debug.state!)).toEqual(before);
  const captured = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0];
  const complete = new Continuity(lab, undefined, () => {}, true);
  expect(exportCurrent(await complete.importFile(JSON.stringify(captured)))).toEqual(before);
}, 30000);

async function bootSelectedByteControl() {
  vi.resetModules();
  window.history.replaceState({}, '', '/?file=1');
  document.body.innerHTML = '<div id="app"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const app = await import('../src/ui/app.ts');
  app.start();
  return app;
}
function selectedBytes(
  input: HTMLInputElement,
  bytes: Uint8Array,
  read = async () => bytes.slice().buffer,
  size = bytes.byteLength,
) {
  const selected = {
    size,
    arrayBuffer: vi.fn(read),
    text: vi.fn(async () => new TextDecoder().decode(await read())),
  };
  Object.defineProperty(input, 'files', { configurable: true, value: [selected] });
  input.dispatchEvent(new Event('change'));
  return selected;
}
const tickSelection = async () => {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

it('actual chooser retains selected BOM bytes and rejects invalid UTF8 or lone surrogate original text', async () => {
  const app = await bootSelectedByteControl();
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(fixtureText)]);
  const selected = selectedBytes(document.getElementById('file') as HTMLInputElement, bytes);
  await vi.waitFor(() => expect(app._debug.state).not.toBeNull());
  expect(selected.arrayBuffer).toHaveBeenCalledTimes(1);
  expect(selected.text).not.toHaveBeenCalled();
  document.getElementById('menu')!.click();
  const capture = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0] as ReturnType<
    Continuity['exportSession']
  >;
  expect([...new TextEncoder().encode(capture.original!.text)]).toEqual([...bytes]);
  expect(capture.original!.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  let blob: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
    blob = value as Blob;
    return 'blob:byte-proof';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  document.getElementById('file-download')!.click();
  const downloaded = JSON.parse(await blob!.text());
  expect(downloaded.original).toEqual(capture.original);
  const c = new Continuity(lab, undefined, () => {}, true);
  const state = await c.importFile(JSON.stringify(downloaded));
  expect(exportCurrent(state)).toEqual(exportCurrent(app._debug.state!));
  expect(c.exportSession(state).original).toEqual(capture.original);
  queueInput(state, { kind: 'ring' });
  queueInput(app._debug.state!, { kind: 'ring' });
  step(state);
  step(app._debug.state!);
  expect(exportCurrent(state)).toEqual(exportCurrent(app._debug.state!));
  const before = JSON.stringify(c.exportSession(state));
  const lone = structuredClone(downloaded);
  const position = fixtureText.indexOf('"runId":"') + 9;
  lone.original.text = fixtureText.slice(0, position) + '\ud800' + fixtureText.slice(position + 1);
  lone.provenance = JSON.parse(lone.original.text);
  lone.original.sha256 = createHash('sha256').update(lone.original.text).digest('hex');
  await expect(c.importFile(JSON.stringify(lone))).rejects.toThrow();
  expect(JSON.stringify(c.exportSession(state))).toBe(before);
  document.getElementById('choose-another')!.click();
  const valid = new TextEncoder().encode(fixtureText);
  const invalid = valid.slice();
  const stringByte = fixtureText.indexOf('"runId":"') + 9;
  expect(stringByte).toBeGreaterThan(9);
  invalid[stringByte] = 0xff; // replacement decoding would leave syntactically valid JSON
  selectedBytes(document.getElementById('file') as HTMLInputElement, invalid);
  await tickSelection();
  expect(app._debug.state).not.toBeNull();
  expect(document.getElementById('file-result')?.textContent).toContain('unchanged');
});

it('actual chooser later selection cancels older reads including later invalid oversized and decode failures', async () => {
  const app = await bootSelectedByteControl();
  const a = new TextEncoder().encode(fixtureText);
  const b = new TextEncoder().encode('\ufeff' + fixtureText);
  let resolveA!: (value: ArrayBuffer) => void;
  const slow = new Promise<ArrayBuffer>((resolve) => {
    resolveA = resolve;
  });
  const input = document.getElementById('file') as HTMLInputElement;
  selectedBytes(input, a, () => slow);
  selectedBytes(input, b);
  await vi.waitFor(() => expect(app._debug.state).not.toBeNull());
  const accepted = app._debug.state;
  resolveA(a.slice().buffer);
  await tickSelection();
  expect(app._debug.state).toBe(accepted);
  document.getElementById('menu')!.click();
  let capture = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0] as ReturnType<Continuity['exportSession']>;
  expect(capture.original!.sha256).toBe(createHash('sha256').update(b).digest('hex'));
  document.getElementById('choose-another')!.click();
  for (const bad of [new TextEncoder().encode('{'), new Uint8Array([0xff]), null]) {
    let finish!: (value: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>((resolve) => {
      finish = resolve;
    });
    const picker = document.getElementById('file') as HTMLInputElement;
    selectedBytes(picker, a, () => pending);
    selectedBytes(picker, bad ?? a, undefined, bad ? bad.byteLength : 16 * 1024 * 1024 + 1);
    await tickSelection();
    const status = document.getElementById('file-result')?.textContent;
    expect(status).toContain('unchanged');
    finish(a.slice().buffer);
    await tickSelection();
    expect(app._debug.state).toBe(accepted);
    expect(document.getElementById('file-result')?.textContent).toBe(status);
  }
  let rejectEarlier!: (reason: Error) => void;
  const earlierFailure = new Promise<ArrayBuffer>((_resolve, reject) => {
    rejectEarlier = reject;
  });
  const lastPicker = document.getElementById('file') as HTMLInputElement;
  selectedBytes(lastPicker, a, () => earlierFailure);
  selectedBytes(lastPicker, new TextEncoder().encode('{'));
  await tickSelection();
  const statusNode = document.getElementById('file-result')!;
  const statusWrites = vi.spyOn(statusNode, 'textContent', 'set');
  rejectEarlier(new Error('synthetic stale read failure'));
  await tickSelection();
  expect(statusWrites).not.toHaveBeenCalled();
  expect(app._debug.state).toBe(accepted);
  statusWrites.mockRestore();
  document.getElementById('file-resume')!.click();
  document.getElementById('menu')!.click();
  capture = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0] as ReturnType<Continuity['exportSession']>;
  expect(capture.original!.sha256).toBe(createHash('sha256').update(b).digest('hex'));
});

it('actual chooser cancels stale hash and validation without changing accepted provenance', async () => {
  const app = await bootSelectedByteControl();
  const a = new TextEncoder().encode(fixtureText);
  const b = new TextEncoder().encode('\ufeff' + fixtureText);
  const realDigest = crypto.subtle.digest.bind(crypto.subtle);
  const hashA = await realDigest('SHA-256', a);
  let finishHash!: (value: ArrayBuffer) => void;
  const pendingHash = new Promise<ArrayBuffer>((resolve) => {
    finishHash = resolve;
  });
  const hash = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => pendingHash);
  const input = document.getElementById('file') as HTMLInputElement;
  selectedBytes(input, a);
  await vi.waitFor(() => expect(hash).toHaveBeenCalledTimes(1));
  selectedBytes(input, b);
  await vi.waitFor(() => expect(app._debug.state).not.toBeNull());
  const acceptedHash = app._debug.state;
  finishHash(hashA);
  await tickSelection();
  expect(app._debug.state).toBe(acceptedHash);
  hash.mockRestore();
  document.getElementById('menu')!.click();
  const hashCapture = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0] as ReturnType<
    Continuity['exportSession']
  >;
  expect(hashCapture).toBeDefined();
  expect(hashCapture.original?.sha256).toBe(createHash('sha256').update(b).digest('hex'));
  document.getElementById('choose-another')!.click();
  const { Continuity: LiveContinuity } = await import('../src/continuity.ts');
  let finishValidation!: () => void;
  const pendingValidation = new Promise<void>((resolve) => {
    finishValidation = resolve;
  });
  const validate = vi
    .spyOn(LiveContinuity.prototype, 'validateRunEnvelopes')
    .mockImplementationOnce(() => pendingValidation);
  const picker = document.getElementById('file') as HTMLInputElement;
  selectedBytes(picker, a);
  await vi.waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
  selectedBytes(picker, b);
  await vi.waitFor(() => expect(app._debug.state).not.toBe(acceptedHash));
  const acceptedValidation = app._debug.state;
  finishValidation();
  await tickSelection();
  expect(app._debug.state).toBe(acceptedValidation);
  document.getElementById('menu')!.click();
  const capture = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0] as ReturnType<
    Continuity['exportSession']
  >;
  expect(capture.original!.sha256).toBe(createHash('sha256').update(b).digest('hex'));
  const restored = new Continuity(lab, undefined, () => {}, true);
  expect(exportCurrent(await restored.importFile(JSON.stringify(capture)))).toEqual(
    exportCurrent(app._debug.state!),
  );
});

it('review repro Resume cancels pending replacement', async () => {
  const app = await bootSelectedByteControl();
  const bytes = new TextEncoder().encode(fixtureText);
  selectedBytes(document.getElementById('file') as HTMLInputElement, bytes);
  await vi.waitFor(() => expect(app._debug.state).not.toBeNull());
  const accepted = app._debug.state;
  document.getElementById('menu')!.click();
  document.getElementById('choose-another')!.click();
  let finish!: (value: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>((resolve) => {
    finish = resolve;
  });
  selectedBytes(document.getElementById('file') as HTMLInputElement, bytes, () => pending);
  document.getElementById('file-resume')!.click();
  expect(app._debug.state).toBe(accepted);
  finish(bytes.slice().buffer);
  await tickSelection();
  expect(
    app._debug.state === accepted,
    'Resume must keep the accepted state object after pending replacement finishes',
  ).toBe(true);
});

it('public Resume preserves continued complete play and BOM provenance across pending read hash and validation', async () => {
  const app = await bootSelectedByteControl();
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  const replacement = new TextEncoder().encode(fixtureText);
  const original = new TextEncoder().encode('\ufeff' + fixtureText);
  selectedBytes(document.getElementById('file') as HTMLInputElement, original);
  await vi.waitFor(() => expect(app._debug.state).not.toBeNull());
  const accepted = app._debug.state!;
  let time = performance.now() + 10000;
  function resumeAndPlay() {
    document.getElementById('file-resume')!.click();
    expect(app._debug.state).toBe(accepted);
    document.querySelector<HTMLElement>('[data-g="level"]')!.click();
    document.querySelector<HTMLElement>('.sheet [data-job="level"]')!.click();
    expect(accepted.inputs.at(-1)?.kind).toBe('ask');
    const before = accepted.minute;
    for (let i = 0; i < 40; i++) {
      time += 250;
      frame?.(time);
    }
    expect(accepted.minute).toBeGreaterThan(before);
    const run = exportCurrent(accepted);
    expect(exportCurrent(importCurrent(run))).toEqual(run);
    return run;
  }
  async function assertPreserved(expected: ReturnType<typeof exportCurrent>) {
    expect(app._debug.state).toBe(accepted);
    expect(exportCurrent(accepted)).toEqual(expected);
    document.getElementById('menu')!.click();
    const capture = vi.mocked(lab.captureSave).mock.calls.at(-1)?.[0] as ReturnType<
      Continuity['exportSession']
    >;
    expect([...new TextEncoder().encode(capture.original!.text)]).toEqual([...original]);
    expect(capture.original!.sha256).toBe(createHash('sha256').update(original).digest('hex'));
    const c = new Continuity(lab, undefined, () => {}, true);
    const restored = await c.importFile(JSON.stringify(capture));
    expect(exportCurrent(restored)).toEqual(expected);
    expect(c.exportSession(restored).original).toEqual(capture.original);
    const continued = importCurrent(expected);
    queueInput(restored, { kind: 'ring' });
    queueInput(continued, { kind: 'ring' });
    step(restored);
    step(continued);
    expect(exportCurrent(restored)).toEqual(exportCurrent(continued));
  }
  document.getElementById('menu')!.click();
  document.getElementById('choose-another')!.click();
  let finishRead!: (value: ArrayBuffer) => void;
  const pendingRead = new Promise<ArrayBuffer>((resolve) => {
    finishRead = resolve;
  });
  selectedBytes(document.getElementById('file') as HTMLInputElement, replacement, () => pendingRead);
  const afterReadResume = resumeAndPlay();
  finishRead(replacement.slice().buffer);
  await tickSelection();
  await assertPreserved(afterReadResume);

  document.getElementById('choose-another')!.click();
  const realDigest = crypto.subtle.digest.bind(crypto.subtle);
  const replacementHash = await realDigest('SHA-256', replacement);
  let finishHash!: (value: ArrayBuffer) => void;
  const pendingHash = new Promise<ArrayBuffer>((resolve) => {
    finishHash = resolve;
  });
  const hash = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(() => pendingHash);
  selectedBytes(document.getElementById('file') as HTMLInputElement, replacement);
  await vi.waitFor(() => expect(hash).toHaveBeenCalledTimes(1));
  const afterHashResume = resumeAndPlay();
  finishHash(replacementHash);
  await tickSelection();
  hash.mockRestore();
  await assertPreserved(afterHashResume);

  document.getElementById('choose-another')!.click();
  const { Continuity: LiveContinuity } = await import('../src/continuity.ts');
  const realValidate = LiveContinuity.prototype.validateRunEnvelopes;
  let finishValidation!: () => void;
  const pendingValidation = new Promise<void>((resolve) => {
    finishValidation = resolve;
  });
  const validation = vi
    .spyOn(LiveContinuity.prototype, 'validateRunEnvelopes')
    .mockImplementationOnce(async function (this: InstanceType<typeof LiveContinuity>, state) {
      await pendingValidation;
      await realValidate.call(this, state);
    });
  selectedBytes(document.getElementById('file') as HTMLInputElement, replacement);
  await vi.waitFor(() => expect(validation).toHaveBeenCalledTimes(1));
  const afterValidationResume = resumeAndPlay();
  finishValidation();
  await tickSelection();
  validation.mockRestore();
  await assertPreserved(afterValidationResume);
});
