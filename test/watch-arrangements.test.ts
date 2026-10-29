// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { newGame, queueInput, step } from '../src/sim/dam.ts';
import { exportCurrent } from '../src/sim/run.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';

vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    preservationStatus: 'existing-local',
    dispose() {},
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
let original: string, debug: typeof import('../src/ui/app.ts')['_debug'];
const settle = async () => {
  for (let n = 0; n < 100; n++) await Promise.resolve();
};
beforeAll(() => {
  const source = newGame(7);
  step(source);
  queueInput(source, { kind: 'ask', keeper: 'dai', job: 'gate', target: 6 });
  for (let n = 0; source.phase === 'watch' && n < 500; n++) step(source);
  expect(source.phase).toBe('dawn');
  queueInput(source, { kind: 'next' });
  expect(source.phase).toBe('watch');
  expect(source.night).toBe(2);
  original = JSON.stringify(exportCurrent(source));
});
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('Worker', BrowserWorker);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  localStorage.setItem('hf-lab:once:telemetry-notice-v1', 'synthetic existing notice');
  window.history.replaceState({}, '', '/file/');
  document.body.innerHTML = '<div id="app"></div>';
  const app = await import('../src/ui/app.ts');
  debug = app._debug;
  app.start();
  let accepted!: () => void;
  const ready = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  const post = BrowserWorker.prototype.postMessage;
  vi.spyOn(BrowserWorker.prototype, 'postMessage').mockImplementation(function (
    this: BrowserWorker,
    value: unknown,
  ) {
    const q = value as { id: number; kind: string };
    if (q.kind === 'file') {
      const receive = this.onmessage;
      this.onmessage = (event) => {
        receive?.(event);
        if (event.data.id === q.id && event.data.kind === 'accepted') accepted();
      };
    }
    post.call(this, value);
  });
  const input = document.getElementById('file') as HTMLInputElement,
    bytes = new TextEncoder().encode(original);
  Object.defineProperty(input, 'files', {
    value: [{ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }],
    configurable: true,
  });
  input.dispatchEvent(new Event('change'));
  await ready;
  await settle();
  expect(debug.state?.night).toBe(2);
  expect(document.querySelector('.watch')).not.toBeNull();
  (document.querySelector('[data-watch-arrangements]') as HTMLElement).click();
});
afterEach(() => {
  disposeBrowserWorkers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  ['set-standing', 'standing'],
  ['clear-standing', 'cancel-standing'],
  ['invite-relief', 'recruit'],
])('sends %s through the owning worker before reporting the request ready', async (button, kind) => {
  const before = debug.state!.inputs.length,
    result = document.getElementById('arrangement-result')!;
  document.getElementById(button)!.click();
  expect(result.textContent).toBe('');
  await settle();
  expect(debug.state!.inputs.slice(before).map((x) => x.kind)).toEqual([kind]);
  expect(result.textContent).toContain('request is ready');
});
it('does not report success or change source when the arrangement input is refused', async () => {
  const { exportCurrent } = await import('../src/sim/run.ts');
  const before = JSON.stringify(exportCurrent(debug.state!)),
    result = document.getElementById('arrangement-result')!;
  const post = BrowserWorker.prototype.postMessage;
  vi.spyOn(BrowserWorker.prototype, 'postMessage').mockImplementation(function (
    this: BrowserWorker,
    value: unknown,
  ) {
    const q = value as { id: number; kind: string; value?: { input?: { kind: string } } };
    if (q.kind === 'mutate' && q.value?.input?.kind === 'standing')
      queueMicrotask(() =>
        this.onmessage?.({
          data: { id: q.id, kind: 'refused', message: 'Synthetic transport refusal' },
        } as MessageEvent),
      );
    else post.call(this, value);
  });
  document.getElementById('set-standing')!.click();
  await settle();
  expect(JSON.stringify(exportCurrent(debug.state!)) === before).toBe(true);
  expect(result.textContent).toBe('');
  expect(document.getElementById('watch-work')?.textContent).toContain('could not advance');
});
