// @vitest-environment happy-dom

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { discoveriesFor } from '../src/sim/cast.ts';
import {
  exportRun,
  fingerprint,
  type GameState,
  type Input,
  newGame,
  personOf,
  queueInput,
  replay,
  restoreState,
  step,
} from '../src/sim/dam.ts';
import { keeperSceneAvailable } from '../src/sim/keeper-scenes.ts';
import { SAMPLE_DAWN } from '../src/ui/opener.ts';
import { reportBody } from '../src/ui/report.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';
import { required } from './required.ts';

vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    setPersonaRecording() {},
    allowPersonaRecording() {},
    build: () => ({ c: 'test' }),
    screen() {},
    milestone() {},
    openSendDialog: vi.fn(),
    trackRun() {},
    captureSave: vi.fn(),
    sendFeedback: vi.fn(async () => 'stored-reference'),
    sendRun: vi.fn(async () => 'queued'),
    setEventsOff: vi.fn((off: boolean) => localStorage.setItem('hf-lab-recording-off', off ? '1' : '0')),
    privacySignalOn: false,
    privacyOverride: false,
  },
}));

vi.mock('@adam0white/lab-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({
    ready: Promise.resolve(true),
    enabled: false,
    setEnabled() {},
    request: async () => null,
  }),
  watchPersonaCheckpoint: () => () => {},
}));
function localFixture(s: GameState) {
  return { run: exportRun(s, '4.14.0'), runId: 'test-run', heads: [], fileOrigin: false, sources: [] };
}
async function click(id: string) {
  const button = document.getElementById(id);
  expect(button, id).not.toBeNull();
  button?.click();
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
async function boot() {
  const app = await import('../src/ui/app.ts');
  app.start();
  return app._debug;
}
function state(debug: { state: GameState | null }): GameState {
  if (!debug.state) throw new Error('No game at the desk');
  return debug.state;
}
function chooseGauge(id: string) {
  (document.querySelector(`[data-g="${id}"]`) as HTMLElement).click();
}
async function tap(button: HTMLElement) {
  button.dispatchEvent(new Event('pointerdown'));
  button.dispatchEvent(new Event('pointerup'));
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
beforeEach(() => {
  vi.stubGlobal('Worker', BrowserWorker);
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  window.history.replaceState({}, '', '/?lab=1');
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  disposeBrowserWorkers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('title and first call', () => {
  it('shows the sample and offers safe file play in collapsed Debug', async () => {
    await boot();
    expect(document.querySelector('#sample-chart')).not.toBeNull();
    expect(document.querySelector('#goal')?.textContent).toContain("Friday's first light");
    expect(document.querySelector('#load')).toBeNull();
    await click('sample');
    expect(document.querySelector('#sample-page .legend')?.textContent).toContain('actual reading time');
    await click('dialog-back');
    expect(document.querySelector('#debug a')?.getAttribute('href')).toBe('/file/');
    expect(document.querySelector<HTMLDetailsElement>('#debug')?.open).toBe(false);
  });
  it('starts on the whole desk with no inspection or queued input', async () => {
    const debug = await boot();
    await click('new');
    expect(document.querySelector('.watch.sheet-open')).toBeNull();
    expect(document.querySelector('#scene')).not.toBeNull();
    expect(document.querySelectorAll('.gauge')).toHaveLength(2);
    expect(document.querySelector('[data-g="level"] .by')?.textContent).toBe('not read');
    expect(document.querySelector('.first-call')?.textContent).toContain(
      'Nobody has read the level tonight.',
    );
    expect(state(debug).minute).toBe(1320);
    expect(state(debug).inputs).toHaveLength(0);
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    expect(state(debug).inputs.at(-1)).toMatchObject({
      kind: 'ask',
      keeper: 'dai',
      job: 'level',
      insist: false,
    });
    expect(document.querySelector('.first-call')).toBeNull();
    expect(document.querySelector('#concern')?.textContent).toContain('waiting for an answer');
    await debug.step(1);
    expect(document.querySelector('#concern')?.textContent).toMatch(/Dai.*level.*about 22:/);
  });
  it('asks before discarding a saved week and resumes the old fingerprint', async () => {
    const expected = newGame(7);
    for (let i = 0; i < 20; i++) step(expected);
    localStorage.setItem('glance-cast-local-v3', JSON.stringify(localFixture(replay(7, [], 1340))));
    const debug = await boot();
    await click('new');
    expect(document.getElementById('restart-confirm')?.hidden).toBe(false);
    expect(JSON.parse(required(localStorage.getItem('glance-cast-local-v3'))).run.state.minute).toBe(1340);
    await click('cancel-new');
    await click('cont');
    expect(fingerprint(state(debug))).toBe(fingerprint(expected));
  });
  it('offers file play without an in-place diagnostic importer or native-save mutation', async () => {
    const saved = JSON.stringify(localFixture(newGame(7)));
    localStorage.setItem('glance-cast-local-v3', saved);
    await boot();
    expect(document.querySelector('#debug a')?.getAttribute('href')).toBe('/file/');
    expect(document.querySelector('#load')).toBeNull();
    expect(localStorage.getItem('glance-cast-local-v3')).toBe(saved);
  });
});

describe('desk sheets and reading labels', () => {
  it('keeps the desk nodes when a sheet opens, and close adds no input', async () => {
    const debug = await boot();
    await click('new');
    const scene = document.querySelector('#scene');
    const top = document.querySelector('.topbar');
    chooseGauge('gate');
    expect(document.querySelector('#scene')).toBe(scene);
    expect(document.querySelector('.topbar')).toBe(top);
    expect(document.querySelector('[data-g="gate"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.turns [data-job="gate"]')).toHaveLength(6);
    expect(document.querySelector('#clock-rate')?.textContent).toBe(
      'Time continues slowly while this inspection is open. It does not stop.',
    );
    expect(document.getElementById('skip-bar')?.hidden).toBe(true);
    const before = state(debug).inputs.length;
    await click('x');
    expect(state(debug).inputs).toHaveLength(before);
    expect(document.getElementById('skip-bar')?.hidden).toBe(false);
  });
  it('preserves controls and forecast disclosure across actual minute updates', async () => {
    const debug = await boot();
    await click('new');
    chooseGauge('gate');
    const buttons = [...document.querySelectorAll('.sheet [data-job]')];
    const details = document.querySelector('.sheet details') as HTMLDetailsElement;
    details.open = true;
    await debug.step(3);
    [...document.querySelectorAll('.sheet [data-job]')].forEach((b, i) => {
      expect(b).toBe(buttons[i]);
    });
    expect(details.open).toBe(true);
    await click('x');
    chooseGauge('gate');
    expect((document.querySelector('.sheet details') as HTMLDetailsElement).open).toBe(false);
  });
  it('does not promise a successful job before the actual HF answer', async () => {
    const debug = await boot();
    await click('new');
    chooseGauge('level');
    const words = document.querySelector('.sheet [data-job="level"] .h')?.textContent;
    expect(words).toBeTruthy();
    const before = JSON.stringify(state(debug).inputs);
    await debug.step(0);
    expect(JSON.stringify(state(debug).inputs)).toBe(before);
    expect(Object.isFrozen(state(debug).people[0]!.body)).toBe(true);
  });
  it('preserves a written reading time independently of actual reading and radio arrival', async () => {
    const { readingTime } = await import('../src/ui/time.ts');
    const r = {
      who: 'dai' as const,
      gauge: 'level' as const,
      value: 3.8,
      truth: 4.1,
      at: 1380,
      wrote: 1350,
      cause: 'unattributed' as const,
      conf: 0.5,
      clarity: 0.5,
      skipped: false,
    };
    expect(readingTime(r)).toBe('read 22:30 (as written)');
    expect(
      reportBody(
        {
          ...SAMPLE_DAWN,
          misses: [
            {
              at: 1380,
              who: 'dai',
              gauge: 'level',
              said: 3.8,
              truth: 4.1,
              cause: 'unattributed',
              caught: false,
            },
          ],
        },
        false,
      ),
    ).toContain('Reading at 23:00');
    expect(r.at).toBe(1380);
  });
  it('preserves the gate reading label and offers only the actual opening crew', async () => {
    const debug = await boot();
    await click('new');
    chooseGauge('gate');
    expect(document.querySelector('.sheet .soft')?.textContent).toContain('last gate reading');
    expect(document.querySelector('.segmented [data-k="callum"]')).toBeNull();
    expect(
      state(debug)
        .keepers.filter((k) => k.on)
        .map((k) => k.id),
    ).toEqual(['dai']);
  });
  it('keeps hold to insist and hold-only warnings', async () => {
    const debug = await boot();
    await click('new');
    chooseGauge('gate');
    const button = document.querySelector('.turns [data-job]') as HTMLElement;
    button.dispatchEvent(new Event('pointerdown'));
    expect(button.classList.contains('holding')).toBe(true);
    vi.advanceTimersByTime(501);
    button.dispatchEvent(new Event('pointerup'));
    for (let i = 0; i < 100; i++) await Promise.resolve();
    expect(state(debug).inputs.at(-1)).toMatchObject({ kind: 'ask', insist: true });
    expect(state(debug).inputs.at(-1)?.kind).toBe('ask');
  });
  it('holds immutable source log entries and does not forge a tree report during inspection', async () => {
    const debug = await boot();
    await click('new');
    const before = JSON.stringify(state(debug).said);
    expect(Object.isFrozen(state(debug).said)).toBe(true);
    chooseGauge('level');
    await debug.step(0);
    expect(JSON.stringify(state(debug).said)).toBe(before);
  });
});

it('holds menu time, keeps speeds in the menu, and stops Skip on the first delivered event', async () => {
  let next: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    next = cb;
    return 1;
  });
  const debug = await boot();
  await click('new');
  expect(document.querySelector('#speed')).toBeNull();
  expect(document.querySelector('#skip')?.textContent).toBe('Skip ⏩');
  let now = performance.now();
  const pulse = async () => {
    now += 250;
    next(now);
    for (let n = 0; n < 100; n++) await Promise.resolve();
  };
  const before = state(debug).minute;
  const inputs = JSON.stringify(state(debug).inputs);
  await click('menu');
  expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(true);
  expect(document.querySelectorAll('[data-pace]')).toHaveLength(4);
  expect(document.querySelector('#game-menu')?.textContent).not.toMatch(/\bSave\b/);
  for (let i = 0; i < 40; i++) await pulse();
  expect(state(debug).minute).toBe(before);
  expect(JSON.stringify(state(debug).inputs)).toBe(inputs);
  await click('dialog-back');
  await tap(document.querySelector('.first-call [data-job]') as HTMLElement);
  await click('skip');
  expect(document.querySelector('#skip')?.textContent).toBe('Stop');
  for (let i = 0; i < 12 && document.querySelector('#skip')?.textContent === 'Stop'; i++) await pulse();
  expect(state(debug).minute).toBeGreaterThan(before);
  expect(state(debug).minute - before).toBeLessThanOrEqual(60);
  expect(document.querySelector('#skip')?.textContent).toBe('Skip ⏩');
  expect(fingerprint(state(debug))).toBe(
    fingerprint(
      (await import('../src/sim/dam.ts')).replay(
        state(debug).seed,
        state(debug).inputs,
        state(debug).minute,
        state(debug).chapter ?? undefined,
        state(debug).rules,
        state(debug).applied,
      ),
    ),
  );
});

it('shows save failure without adding a manual Save action', async () => {
  const debug = await boot();
  await click('new');
  const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  chooseGauge('gate');
  tap(document.querySelector('.turns [data-job]') as HTMLElement);
  expect(document.querySelector('#save-warning')?.textContent).toContain('could not save');
  set.mockRestore();
  await click('menu');
  expect(document.querySelector('#save-warning')).toBeNull();
  expect(JSON.parse(required(localStorage.getItem('glance-cast-local-v3'))).run.state.minute).toBe(
    state(debug).minute,
  );
});

it('sends linked feedback with verdict and trimmed remembered name', async () => {
  await boot();
  await click('new');
  await click('menu');
  await click('send-word');
  (document.querySelector('[data-verdict="keep"]') as HTMLElement).click();
  (document.getElementById('feedback-note') as HTMLTextAreaElement).value = 'I wanted another reading.';
  (document.getElementById('feedback-name') as HTMLInputElement).value = '  owner  ';
  await click('feedback-send');
  await vi.waitFor(() =>
    expect(document.getElementById('feedback-result')?.textContent).toBe(
      'Sent. Your note is stored. Reference stored-reference.',
    ),
  );
  const { lab } = await import('../src/ui/lab.ts');
  expect(lab.sendFeedback).toHaveBeenCalledWith(
    '[keep] I wanted another reading.',
    expect.objectContaining({ name: 'owner', run: expect.any(Object) }),
  );
  expect(localStorage.getItem('hf-lab-feedback-name')).toBe('owner');
});

it('allows feedback while recording is off without another recording choice', async () => {
  localStorage.setItem('hf-lab-recording-off', '1');
  await boot();
  await click('menu');
  await click('send-word');
  expect((document.getElementById('feedback-send') as HTMLButtonElement).disabled).toBe(false);
  expect(document.getElementById('record-feedback')).toBeNull();
  await click('feedback-send');
  const { lab } = await import('../src/ui/lab.ts');
  expect(lab.sendFeedback).toHaveBeenCalled();
});

it('allows a privacy note without a run or another dialog', async () => {
  const { lab } = await import('../src/ui/lab.ts');
  Object.assign(lab, { privacySignalOn: true });
  await boot();
  await click('new');
  await click('menu');
  await click('send-word');
  expect((document.getElementById('feedback-send') as HTMLButtonElement).disabled).toBe(false);
  (document.getElementById('feedback-note') as HTMLTextAreaElement).value = 'A note';
  (document.getElementById('feedback-name') as HTMLInputElement).value = 'owner';
  await click('feedback-send');
  await vi.waitFor(() => expect(lab.sendFeedback).toHaveBeenCalled());
  expect(lab.sendRun).not.toHaveBeenCalled();
  expect(lab.openSendDialog).not.toHaveBeenCalled();
});

it('scrolls the sheet to new radio words while leaving the initial first call visible', async () => {
  const debug = await boot();
  await click('new');
  const sheet = document.getElementById('sheet') as HTMLElement;
  expect(sheet.scrollTop).toBe(0);
  await tap(document.querySelector('.first-call [data-job]') as HTMLElement);
  Object.defineProperty(sheet, 'scrollHeight', { configurable: true, value: 600 });
  sheet.scrollTop = 0;
  await debug.step(1);
  expect(sheet.scrollTop).toBe(600);
});

it('keeps gate job identity when the real worker forecast arrives', async () => {
  const debug = await boot();
  await click('new');
  chooseGauge('gate');
  const buttons = [...document.querySelectorAll('.sheet [data-job]')];
  await debug.step(3);
  for (let n = 0; n < 100; n++) await Promise.resolve();
  [...document.querySelectorAll('.sheet [data-job]')].forEach((b, i) => {
    expect(b).toBe(buttons[i]);
  });
  expect(document.querySelector('.watch')?.getAttribute('data-sheet-id')).toBe('gauge-gate-dai');
});

it('keeps feedback sent when remembering the name fails', async () => {
  const { lab } = await import('../src/ui/lab.ts');
  Object.assign(lab, { privacySignalOn: false });
  await boot();
  await click('new');
  await click('menu');
  await click('send-word');
  const failedName = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  await click('feedback-send');
  await vi.waitFor(() =>
    expect(document.getElementById('feedback-result')?.textContent).toBe(
      'Sent. Your note is stored. Reference stored-reference.',
    ),
  );
  expect(document.getElementById('feedback-send')?.textContent).toBe('Back to the desk');
  failedName.mockRestore();
});

it.each([false, true])('submits its single recording opt-in checkbox as %s', async (sharePlay) => {
  await boot();
  const { lab } = await import('../src/ui/lab.ts');
  Object.assign(lab, { telemetryOn: false });
  await click('menu');
  await click('send-word');
  const choice = document.querySelector<HTMLInputElement>('#feedback input[type=checkbox]');
  expect(choice).not.toBeNull();
  expect(choice?.checked).toBe(false);
  expect(document.querySelector('#feedback label label')).toBeNull();
  if (choice) choice.checked = sharePlay;
  await click('feedback-send');
  await vi.waitFor(() =>
    expect(lab.sendFeedback).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sharePlay })),
  );
});

it('shows the effective privacy default and opts in with the single recording switch', async () => {
  await boot();
  const { lab } = await import('../src/ui/lab.ts');
  const setRecording = vi.fn((off: boolean) => Object.assign(lab, { telemetryOn: !off }));
  Object.assign(lab, { telemetryOn: false, privacySignalOn: true, setTelemetryOff: setRecording });
  await click('menu');
  const recording = document.getElementById('record-menu') as HTMLInputElement;
  expect(recording.checked).toBe(false);
  recording.click();
  expect(setRecording).toHaveBeenCalledWith(false);
  expect(recording.checked).toBe(true);
});

it.each(['', '?lab=0', '?lab=true', '?lab=01'])(
  'offers public pace and collapsed diagnostics at ordinary URL %s',
  async (search) => {
    window.history.replaceState({}, '', `/${search}`);
    await boot();
    expect(document.querySelector<HTMLDetailsElement>('#debug')?.open).toBe(false);
    expect(document.querySelector('.credit')).toBeNull();
    await click('menu');
    expect(document.getElementById('browser-people')).toBeNull();
    expect(document.querySelectorAll('[data-pace]')).toHaveLength(4);
    expect(document.getElementById('to-title')).not.toBeNull();
    expect(document.getElementById('send-word')?.textContent).toBe('Feedback');
    expect(document.querySelector('#game-menu a')?.getAttribute('href')).toBe(
      'https://human.adamwhite.work/games/',
    );
    expect(document.getElementById('menu-new')).not.toBeNull();
  },
);

it('preserves the saved run and receipts when shared admission fails', async () => {
  window.history.replaceState({}, '', '/');
  const saved = JSON.stringify(localFixture(newGame(7)));
  localStorage.setItem('glance-cast-local-v3', saved);
  const { Continuity } = await import('../src/continuity.ts');
  vi.spyOn(Continuity.prototype, 'fresh').mockRejectedValue(
    new Error('Shelf unavailable. Use a local file.'),
  );
  await boot();
  await click('new');
  await click('confirm-new');
  expect(localStorage.getItem('glance-cast-local-v3')).toBe(saved);
  expect(document.querySelector('#start-error')?.textContent).toContain('saved watch is unchanged');
  expect(document.querySelector<HTMLDetailsElement>('#start-error details')?.open).toBe(false);
  expect(document.querySelector('#retry-start')).not.toBeNull();
  expect(document.querySelector('#error-feedback')).not.toBeNull();
  expect(document.querySelector('#continuity')).toBeNull();
});

it('resumes an old paused chapter through the ordinary Resume button', async () => {
  window.history.replaceState({}, '', '/');
  const run = newGame(7);
  queueInput(run, { kind: 'ask', keeper: 'dai', job: 'level', insist: true });
  step(run);
  queueInput(run, { kind: 'pause' });
  step(run);
  for (let i = 0; i < 100 && !run.chapterPaused; i++) step(run);
  expect(run.chapterPaused).toBe(true);
  localStorage.setItem('glance-cast-local-v3', JSON.stringify(localFixture(run)));
  const debug = await boot();
  await click('cont');
  await click('menu');
  await click('dialog-back');
  expect(state(debug).chapterPaused).toBe(false);
  expect(state(debug).inputs.at(-1)?.kind).toBe('resume');
});

it('keeps the town goal beside gate orders and offers the lightning comparison', async () => {
  await boot();
  await click('new');
  chooseGauge('gate');
  expect(document.querySelector('#desk-goal')?.textContent).toContain('town dry');
  expect(document.querySelector('#desk-goal')?.textContent).toContain("Friday's first light");
  expect(document.querySelector('#sheet #desk-goal')).toBeNull();
  const panel = required(document.getElementById('sheet'));
  panel.scrollTop = 200;
  await click('compare-observations');
  expect(panel.scrollTop).toBe(0);
  expect(document.querySelector('#observation')?.textContent).toContain('next lightning flash');
  await click('x');
});

// One immutable, actual seeded source fixture serves separate UI and replay controls.
// No Person setter, deadline increase or shortened physical wait is used.
describe('saved lightning comparison', () => {
  let saved: ReturnType<typeof exportRun>;
  beforeAll(() => {
    const run = newGame(7);
    queueInput(run, { kind: 'ask', keeper: 'dai', job: 'level', insist: false });
    for (let n = 0; n < 50 && !run.flashes.length; n++) step(run);
    expect(run.flashes.length).toBeGreaterThan(0);
    for (let n = 0; n < 31; n++) step(run);
    saved = exportRun(run, '4.14.0');
  });
  it('offers the saved image after the actual scene flash expires without changing the watch', async () => {
    const source = restoreState(structuredClone(saved.state));
    localStorage.setItem('glance-cast-local-v3', JSON.stringify(localFixture(source)));
    const debug = await boot();
    await click('cont');
    const run = state(debug);
    const flash = required(run.flashes.at(-1));
    expect(run.minute - flash.at).toBeGreaterThanOrEqual(31);
    const before = fingerprint(run);
    await click('compare-observations');
    expect(document.querySelector('#observation svg')).not.toBeNull();
    expect(document.querySelector('#observation')?.textContent).toContain('solid line is Dai');
    expect(document.querySelector('#observation')?.textContent).toContain('saved image');
    expect(document.querySelector('#observation')?.textContent).toContain('different times');
    expect(document.querySelector('#observation')?.textContent).not.toContain(flash.level.toFixed(2));
    await debug.step(0);
    expect(fingerprint(run)).toBe(before);
  });
  it('replays the complete actual saved-flash source', () => {
    const run = replay(
      saved.seed,
      saved.inputs,
      saved.state.minute,
      saved.state.chapter ?? undefined,
      saved.state.rules,
      saved.state.applied,
    );
    expect(exportRun(run, '4.14.0')).toEqual(saved);
  });
});

it('lets the player mark a received reading and remove the note through ordinary controls', async () => {
  const debug = await boot();
  await click('new');
  expect(document.getElementById('reading-note')).toBeNull();
  tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
  const run = state(debug);
  for (let n = 0; n < 50 && !run.board.level; n++) await debug.step(1);
  expect(run.board.level).not.toBeNull();
  chooseGauge('level');
  expect(document.getElementById('reading-note')?.textContent).toContain('Doubt this reading');
  await click('reading-note');
  await debug.step(1);
  expect(document.querySelector('[data-g="level"]')?.textContent).toContain('Marked for another check');
  chooseGauge('level');
  expect(document.getElementById('reading-note')?.getAttribute('aria-pressed')).toBe('true');
  await click('reading-note');
  await debug.step(1);
  expect(run.board.level?.doubted).toBe(false);
});

it('keeps quiet feedback choices local until Submit and uses the SDK literal label', async () => {
  const debug = await boot();
  await click('new');
  await click('menu');
  await click('send-word');
  const { lab } = await import('../src/ui/lab.ts');
  vi.mocked(lab.sendFeedback).mockClear();
  const button = document.querySelector<HTMLButtonElement>('[data-feedback-label="confused"]');
  expect(button?.textContent).toBe("I'm confused");
  button?.click();
  expect(lab.sendFeedback).not.toHaveBeenCalled();
  await click('feedback-send');
  await vi.waitFor(() => expect(lab.sendFeedback).toHaveBeenCalledOnce());
  expect(vi.mocked(lab.sendFeedback).mock.calls[0]?.[0]).toBe("I'm confused");
  expect(vi.mocked(lab.sendFeedback).mock.calls[0]?.[1]?.run).toEqual(
    (await import('../src/sim/dam.ts')).exportRun(state(debug), '4.14.0'),
  );
});

it('offers the twelve-night public watch directly and retains the physical dam choice', async () => {
  const debug = await boot();
  expect(document.getElementById('extended-watch')).toBeNull();
  expect(document.getElementById('goal')?.textContent).toContain('twelve nights');
  expect(document.getElementById('goal')?.textContent).toContain('second Friday');
  expect(document.querySelector('#dam-choice option[value="upper"]')?.textContent).toContain('harder');
  await click('help');
  expect(document.getElementById('about')?.textContent).toContain('twelve nights');
  await click('new');
  expect(state(debug).rules?.edition).toBe('extended-2');
  expect(document.getElementById('about')?.textContent).toContain('twelve nights');
  expect(document.getElementById('about')?.textContent).toContain('you marked that report as doubted');
});

// SCOPE: HF3 saved rules are evidence, not an alternate current engine path.
it('refuses an unsupported saved edition before replacing browser state', async () => {
  const old = localFixture(newGame(7));
  old.run.framework = '3.0.0';
  const saved = JSON.stringify(old);
  localStorage.setItem('glance-cast-local-v3', saved);
  const debug = await boot();
  expect(document.getElementById('cont')).toBeNull();
  expect(document.body.textContent).toContain('This watch was saved by an older version. Start a new game.');
  expect(debug.state).toBeNull();
  expect(localStorage.getItem('glance-cast-local-v3')).toBe(saved);
});

it('offers a new game when a current-version saved watch cannot replay', async () => {
  const changed = localFixture(newGame(7));
  changed.run.state.minute += 1;
  const saved = JSON.stringify(changed);
  localStorage.setItem('glance-cast-local-v3', saved);
  await boot();
  await click('cont');
  expect(document.querySelector('#start-error')?.textContent).toContain(
    'This saved watch could not be replayed. Start a new game.',
  );
  expect(document.getElementById('retry-start')).toBeNull();
  expect(localStorage.getItem('glance-cast-local-v3')).toBe(saved);
});

it('accounts real frame minutes under the admitted inspector and holds menus and legacy inspections', async () => {
  let frame: FrameRequestCallback = () => {};
  let now = 10000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => {
    frame = next;
    return 1;
  });
  const run = newGame(7, undefined, { edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  localStorage.setItem('glance-cast-local-v3', JSON.stringify(localFixture(run)));
  const debug = await boot();
  await click('cont');
  chooseGauge('level');
  const initial = state(debug).minute;
  const advance = async (frames: number) => {
    for (let i = 0; i < frames; i++) {
      now += 250;
      frame(now);
      for (let n = 0; n < 100; n++) await Promise.resolve();
    }
  };
  await advance(12);
  expect(state(debug).minute).toBe(initial + 1);
  expect(document.getElementById('clock-rate')?.textContent).toContain('continues slowly');
  expect(document.querySelector('.watch')?.getAttribute('data-sheet-id')).toBe('gauge-level-dai');
  await click('menu');
  const beforeMenu = state(debug).minute;
  await advance(40);
  expect(state(debug).minute).toBe(beforeMenu);
  await click('dialog-back');
  await advance(12);
  expect(state(debug).minute).toBe(beforeMenu + 1);
});

it('offers all implemented scenes in every ordinary new game without feature switches', async () => {
  window.history.replaceState({}, '', '/');
  const debug = await boot();
  expect(document.getElementById('shift-outcomes')).toBeNull();
  expect(document.getElementById('private-scenes')).toBeNull();
  expect(document.getElementById('extended-watch')).toBeNull();
  await click('new');
  expect(state(debug).rules).toEqual({ edition: 'extended-2', dam: 'valley', outcomes: 'private-scenes-1' });
  expect(state(debug).outcomes).toBeDefined();
  expect(state(debug).privateScenes).toBeDefined();
});
