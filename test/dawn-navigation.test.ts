// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { LOCAL_KEY } from '../src/continuity.ts';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { exportCurrent } from '../src/sim/run.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';

vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    setPersonaRecording() {},
    allowPersonaRecording() {},
    build: () => ({ c: 'test' }),
    screen() {},
    milestone() {},
    trackRun() {},
    captureSave() {},
    openSendDialog() {},
    sendFeedback: async () => 'stored',
    sendRun: async () => 'queued',
    setEventsOff() {},
    privacySignalOn: false,
    privacyOverride: false,
  },
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({
    ready: Promise.resolve(true),
    enabled: false,
    setEnabled() {},
    request: async () => null,
  }),
  watchPersonaCheckpoint: () => () => {},
}));
let native: string;
let debug: typeof import('../src/ui/app.ts')['_debug'];
const settle = async () => {
  for (let n = 0; n < 100; n++) await Promise.resolve();
};
beforeAll(() => {
  const source = newGame(7);
  step(source);
  queueInput(source, { kind: 'ask', keeper: 'dai', job: 'gate', target: 6 });
  for (let n = 0; source.phase === 'watch' && n < 500; n++) step(source);
  expect(source.phase).toBe('dawn');
  expect(source.minute).toBe(1800);
  native = JSON.stringify({
    run: exportCurrent(source),
    runId: 'dawn-control',
    heads: [],
    fileOrigin: false,
    sources: [],
  });
});
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('Worker', BrowserWorker);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem(LOCAL_KEY, native);
  window.history.replaceState({}, '', '/?lab=1');
  document.body.innerHTML = '<div id="app"></div>';
  const app = await import('../src/ui/app.ts');
  debug = app._debug;
  app.start();
  document.getElementById('cont')!.click();
  await settle();
  expect(debug.state?.phase).toBe('dawn');
  expect(document.querySelector('.dawn')).not.toBeNull();
});
afterEach(() => {
  disposeBrowserWorkers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('opens the next watch and restarts playback only after the owning worker accepts next', async () => {
  const raf = vi.mocked(requestAnimationFrame);
  const before = raf.mock.calls.length;
  document.getElementById('next')!.click();
  expect(document.querySelector('.dawn')).not.toBeNull();
  await settle();
  expect(debug.state?.phase).toBe('watch');
  expect(debug.state?.night).toBe(2);
  expect(document.querySelector('.watch')).not.toBeNull();
  expect(document.querySelector('.dawn')).toBeNull();
  expect(raf.mock.calls.length).toBeGreaterThan(before);
});
it('keeps the same morning, save and source when the next input is refused', async () => {
  const { exportCurrent } = await import('../src/sim/run.ts');
  const before = JSON.stringify(exportCurrent(debug.state!)),
    saved = localStorage.getItem(LOCAL_KEY),
    morning = document.querySelector('.dawn');
  const post = BrowserWorker.prototype.postMessage;
  // A transport refusal executes no source input. Other messages use the real owner.
  vi.spyOn(BrowserWorker.prototype, 'postMessage').mockImplementation(function (
    this: BrowserWorker,
    value: unknown,
  ) {
    const q = value as { id: number; kind: string; value?: { input?: { kind: string } } };
    if (q.kind === 'mutate' && q.value?.input?.kind === 'next')
      queueMicrotask(() =>
        this.onmessage?.({
          data: { id: q.id, kind: 'refused', message: 'Synthetic transport refusal' },
        } as MessageEvent),
      );
    else post.call(this, value);
  });
  document.getElementById('next')!.click();
  await settle();
  expect(JSON.stringify(exportCurrent(debug.state!))).toBe(before);
  expect(localStorage.getItem(LOCAL_KEY) === saved).toBe(true);
  expect(document.querySelector('.dawn')).toBe(morning);
  expect(document.querySelector('.watch')).toBeNull();
  expect(document.getElementById('watch-work')?.textContent).toContain('could not advance');
});
