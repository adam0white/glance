// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { LOCAL_KEY } from '../src/continuity.ts';
import { newGame, step } from '../src/sim/dam.ts';
import { exportCurrent } from '../src/sim/run.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';
import { historicalEvent } from './incoming-fixtures.ts';

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
let native: string, debug: typeof import('../src/ui/app.ts')['_debug'];
const settle = async () => {
  for (let n = 0; n < 100; n++) await Promise.resolve();
};
const click = async (id: string) => {
  document.getElementById(id)!.click();
  await settle();
};
beforeAll(() => {
  const source = newGame(7);
  for (let n = 0; n < 3; n++) step(source);
  native = JSON.stringify({
    run: exportCurrent(source),
    runId: 'recovery-ui-control',
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
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem(LOCAL_KEY, native);
  window.history.replaceState({}, '', '/?lab=1');
  document.body.innerHTML = '<div id="app"></div>';
  // Only the UI recovery boundary is delayed. The retained row is genuine historical
  // input; these tests claim no shelf/CAS result. Resume/create use the real owner.
  const { record } = historicalEvent('recovery-5', 'changed-snapshot-refusal');
  const { Continuity } = await import('../src/continuity.ts');
  vi.spyOn(Continuity.prototype, 'pendingPreparations').mockResolvedValue([record]);
  const app = await import('../src/ui/app.ts');
  debug = app._debug;
  app.start();
  await settle();
});
afterEach(() => {
  disposeBrowserWorkers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  [false, 'resume'],
  [true, 'resume'],
  [false, 'new'],
  [true, 'new'],
] as const)('keeps the later %s/%s watch when old recovery rejects', async (warm, opening) => {
  if (warm) {
    await click('cont');
    expect(debug.state?.phase).toBe('watch');
    await click('menu');
    await click('to-title');
  }
  const { Continuity } = await import('../src/continuity.ts');
  let reject!: (error: Error) => void;
  vi.spyOn(Continuity.prototype, 'recoverPrepared').mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const recovery = document.querySelector<HTMLButtonElement>('#prepared-openings button')!;
  recovery.click();
  await settle();
  expect(recovery.disabled).toBe(true);
  if (opening === 'resume') await click('cont');
  else {
    const fresh = Continuity.prototype.fresh;
    let completed: ReturnType<InstanceType<typeof Continuity>['fresh']> | undefined;
    vi.spyOn(Continuity.prototype, 'fresh').mockImplementation(function (
      this: InstanceType<typeof Continuity>,
      ...args: Parameters<InstanceType<typeof Continuity>['fresh']>
    ) {
      completed = fresh.apply(this, args);
      return completed;
    });
    await click('new');
    await click('confirm-new');
    await completed;
    await settle();
  }
  const accepted = debug.state;
  expect(accepted?.phase).toBe('watch');
  const before = JSON.stringify((await import('../src/sim/run.ts')).exportCurrent(accepted!)),
    saved = localStorage.getItem(LOCAL_KEY);
  reject(new Error('Controlled stale recovery rejection'));
  await settle();
  expect(debug.state === accepted).toBe(true);
  expect(localStorage.getItem(LOCAL_KEY) === saved).toBe(true);
  expect(JSON.stringify((await import('../src/sim/run.ts')).exportCurrent(debug.state!)) === before).toBe(
    true,
  );
  const minute = accepted!.minute;
  await debug.step(1);
  expect(debug.state?.minute).toBe(minute + 1);
});
it('keeps a resumed watch when an older new-game attempt rejects', async () => {
  const { Continuity } = await import('../src/continuity.ts');
  let reject!: (error: Error) => void;
  vi.spyOn(Continuity.prototype, 'fresh').mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await click('new');
  await click('confirm-new');
  await click('cont');
  const accepted = debug.state;
  expect(accepted?.phase).toBe('watch');
  const saved = localStorage.getItem(LOCAL_KEY);
  reject(new Error('Controlled stale new-game rejection'));
  await settle();
  expect(debug.state === accepted).toBe(true);
  expect(localStorage.getItem(LOCAL_KEY) === saved).toBe(true);
  const minute = accepted!.minute;
  await debug.step(1);
  expect(debug.state?.minute).toBe(minute + 1);
});
it('reports a current recovery failure without replacing the saved watch', async () => {
  const { Continuity } = await import('../src/continuity.ts');
  vi.spyOn(Continuity.prototype, 'recoverPrepared').mockRejectedValue(
    new Error('Controlled current recovery rejection'),
  );
  const saved = localStorage.getItem(LOCAL_KEY),
    button = document.querySelector<HTMLButtonElement>('#prepared-openings button')!;
  button.click();
  await settle();
  expect(debug.state).toBeNull();
  expect(localStorage.getItem(LOCAL_KEY) === saved).toBe(true);
  expect(button.disabled).toBe(false);
  expect(document.getElementById('prepared-openings')?.textContent).toContain(
    'Controlled current recovery rejection',
  );
});
