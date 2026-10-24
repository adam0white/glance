// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportRun,
  fingerprint,
  type GameState,
  type Input,
  newGame,
  personOf,
  queueInput,
  replay,
  step,
} from '../src/sim/dam.ts';
import { SAMPLE_DAWN } from '../src/ui/opener.ts';
import { reportBody } from '../src/ui/report.ts';

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
    sendFeedback: vi.fn(async () => 'queued'),
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
  return { run: exportRun(s, '2.18.0'), runId: 'test-run', heads: [], fileOrigin: false, sources: [] };
}
async function click(id: string) {
  const button = document.getElementById(id);
  expect(button, id).not.toBeNull();
  button?.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
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
function tap(button: HTMLElement) {
  button.dispatchEvent(new Event('pointerdown'));
  button.dispatchEvent(new Event('pointerup'));
}
async function importRun(run: ReturnType<typeof exportRun>) {
  await click('other');
  const file = document.getElementById('file') as HTMLInputElement;
  Object.defineProperty(file, 'files', { value: [{ text: async () => JSON.stringify(run) }] });
  file.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(document.getElementById('load-result')?.textContent).toContain('matches'));
  await click('dialog-back');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('title and first call', () => {
  it('shows the sample and the week end, while keeping import in Other ways in', async () => {
    await boot();
    expect(document.querySelector('#sample-chart')).not.toBeNull();
    expect(document.querySelector('#goal')?.textContent).toContain("Friday's first light");
    expect(document.querySelector('#load')).toBeNull();
    await click('sample');
    expect(document.querySelector('#sample-page .legend')?.textContent).toContain('actual reading time');
    await click('dialog-back');
    await click('other');
    expect(document.querySelector('#load')).not.toBeNull();
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
    tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    expect(state(debug).inputs.at(-1)).toMatchObject({
      kind: 'ask',
      keeper: 'dai',
      job: 'level',
      insist: false,
    });
    expect(document.querySelector('.first-call')).toBeNull();
    expect(document.querySelector('#concern')?.textContent).toContain('◷');
    debug.step(1);
    expect(document.querySelector('#concern')?.textContent).toMatch(/Dai.*level ~22:/);
  });
  it('asks before discarding a saved week and resumes the old fingerprint', async () => {
    const expected = newGame(7);
    for (let i = 0; i < 20; i++) step(expected);
    localStorage.setItem('glance-cast-local-v3', JSON.stringify(localFixture(replay(7, [], 1340))));
    const debug = await boot();
    await click('new');
    expect(document.getElementById('restart-confirm')?.hidden).toBe(false);
    expect(JSON.parse(localStorage.getItem('glance-cast-local-v3')!).run.state.minute).toBe(1340);
    await click('cancel-new');
    await click('cont');
    expect(fingerprint(state(debug))).toBe(fingerprint(expected));
  });
  it('imports inline and resumes the same replay fingerprint without alert', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    const run = newGame(7);
    for (let i = 0; i < 20; i++) step(run);
    const debug = await boot();
    await importRun(exportRun(run, 'test'));
    expect(fingerprint(state(debug))).toBe(fingerprint(run));
    expect(alert).not.toHaveBeenCalled();
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
    expect(document.querySelector('#clock-rate')?.textContent).toBe('Time waits while you look');
    expect(document.getElementById('skip-bar')?.hidden).toBe(true);
    const before = state(debug).inputs.length;
    await click('x');
    expect(state(debug).inputs).toHaveLength(before);
    expect(document.getElementById('skip-bar')?.hidden).toBe(false);
  });
  it('preserves controls and forecast disclosure across minute and report updates', async () => {
    const debug = await boot();
    await click('new');
    chooseGauge('gate');
    const buttons = [...document.querySelectorAll('.sheet [data-job]')];
    const details = document.querySelector('.sheet details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    details.open = true;
    debug.step(3);
    state(debug).said.push({ at: state(debug).minute, who: 'dai', kind: 'report', text: 'A new report.' });
    debug.step(0);
    [...document.querySelectorAll('.sheet [data-job]')].forEach((button, i) => {
      expect(button).toBe(buttons[i]);
    });
    expect((document.querySelector('.sheet details') as HTMLDetailsElement).open).toBe(true);
    expect(document.querySelector('#latest-radio')?.textContent).toContain('A new report.');
    await click('x');
    chooseGauge('gate');
    expect((document.querySelector('.sheet details') as HTMLDetailsElement).open).toBe(false);
  });
  it('explains unanswered calls before asking, without promising work or a completion time', async () => {
    const debug = await boot();
    await click('new');
    tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    debug.step(1);
    const run = state(debug);
    const activity = personOf(run, 'dai').activity!;
    activity.affordanceId = 'doze';
    chooseGauge('level');
    const words = document.querySelector('.sheet [data-job="level"] .h')?.textContent;
    expect(words).toBe('call; wait');
    expect(document.querySelector('.call-advice')?.textContent).toContain('If no answer, call again.');
    expect(words).not.toContain('min');
    chooseGauge('gate');
    expect(document.querySelector('.turns .h')?.textContent).toBe('call; wait');
    activity.affordanceId = 'nap';
    debug.step(0);
    expect(document.querySelector('.call-advice')?.textContent).toContain('If no answer, call again.');
    run.radioOut = true;
    debug.step(0);
    expect(document.querySelector('.turns .h')?.textContent).toBe('radio out');
    expect(document.querySelector('.call-advice')?.textContent).toContain(
      'Call again when the radio clears.',
    );
    expect(run.inputs).toHaveLength(1);
  });
  it('distinguishes written readings, previous readings, and radio arrival times', async () => {
    const debug = await boot();
    await click('new');
    const run = state(debug);
    const original = run.board.level!;
    run.minute = 1410;
    run.inputs.push({ at: 1350, kind: 'ask', keeper: 'dai', job: 'level' });
    const reading = { ...original, at: 1380, wrote: 1350, late: true };
    run.reports.push(reading);
    run.board.level = reading;
    run.said.push({ at: 1400, who: 'dai', kind: 'report', text: 'Radio’s back. Three-nine.' });
    debug.step(0);
    expect(document.querySelector('[data-g="level"] .by')?.textContent).toContain('read 22:30 (as written)');
    expect(document.querySelector('[data-g="level"] .same-reader')?.textContent).toContain('read 22:00');
    expect(document.querySelector('#log .line:last-child .t')?.textContent).toBe('reported 23:20');
    chooseGauge('level');
    expect(document.querySelector('.sheet .hint')?.textContent).toContain('read 22:30 (as written)');
    expect(document.querySelector('#threshold')?.textContent).toContain('read 60 min ago (as written)');
    expect(
      reportBody(
        {
          ...SAMPLE_DAWN,
          misses: [
            { at: 1380, who: 'dai', gauge: 'level', said: 3.8, truth: 4.1, cause: 'sleepy', caught: false },
          ],
        },
        false,
      ),
    ).toContain('actual read 23:00');
  });
  it('uses segments for who goes and keeps four gauge reading labels', async () => {
    const debug = await boot();
    await click('new');
    const run = state(debug);
    run.night = 3;
    const opening = run.board.level!;
    run.board.weir = { ...opening, gauge: 'weir' };
    run.board.bridge = { ...opening, who: 'nerys', gauge: 'bridge' };
    run.board.gate!.wrote = 1290;
    debug.step(0);
    expect(document.querySelectorAll('.gauge .by')).toHaveLength(4);
    chooseGauge('gate');
    expect(document.querySelector('.sheet .who')?.textContent).toContain('read 21:30 (as written)');
    expect(document.querySelectorAll('.segmented [data-k]')).toHaveLength(2);
    (document.querySelector('.segmented [data-k="callum"]') as HTMLElement).click();
    expect(document.querySelector('.segmented [data-k="callum"]')?.getAttribute('aria-pressed')).toBe('true');
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
    expect(state(debug).inputs.at(-1)).toMatchObject({ kind: 'ask', insist: true });
    state(debug).night = 2;
    debug.step(0);
    chooseGauge('bridge');
    const warning = document.getElementById('warn')!;
    const before = state(debug).inputs.length;
    tap(warning);
    expect(state(debug).inputs).toHaveLength(before);
    expect(warning.textContent).toContain('keep your finger');
    warning.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(501);
    expect(state(debug).inputs.at(-1)).toMatchObject({ kind: 'warn' });
  });
  it('keeps tree notices distinct from received reading reports', async () => {
    const debug = await boot();
    await click('new');
    const run = state(debug);
    run.radioOut = true;
    run.said.push({ at: run.minute, who: 'dai', kind: 'report', text: 'A tree on the screen.' });
    debug.step(0);
    expect(document.querySelector('#log .line:last-child .t')?.textContent).toBe('22:00');
    expect(document.querySelector('#skip-caption')?.textContent).toBe('Radio is out');
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
  const pulse = () => {
    now += 250;
    next(now);
  };
  const before = state(debug).minute;
  const inputs = JSON.stringify(state(debug).inputs);
  await click('menu');
  expect(document.querySelector<HTMLDialogElement>('#game-menu')?.open).toBe(true);
  expect(document.querySelectorAll('[data-pace]')).toHaveLength(4);
  expect(document.querySelector('#game-menu')?.textContent).not.toMatch(/\bSave\b/);
  for (let i = 0; i < 40; i++) pulse();
  expect(state(debug).minute).toBe(before);
  expect(JSON.stringify(state(debug).inputs)).toBe(inputs);
  await click('dialog-back');
  tap(document.querySelector('.first-call [data-job]') as HTMLElement);
  await click('skip');
  expect(document.querySelector('#skip')?.textContent).toBe('Stop');
  for (let i = 0; i < 12 && document.querySelector('#skip')?.textContent === 'Stop'; i++) pulse();
  expect(state(debug).minute).toBeGreaterThan(before);
  expect(state(debug).minute - before).toBeLessThanOrEqual(60);
  expect(document.querySelector('#skip')?.textContent).toBe('Skip ⏩');
  expect(fingerprint(state(debug))).toBe(
    fingerprint(
      (await import('../src/sim/dam.ts')).replay(state(debug).seed, state(debug).inputs, state(debug).minute),
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
  expect(JSON.parse(localStorage.getItem('glance-cast-local-v3')!).run.state.minute).toBe(
    state(debug).minute,
  );
});

it('uses phase information and keeps the final tally below people and closed', async () => {
  const debug = await boot();
  await click('help');
  expect(document.querySelector('#about')?.textContent).toContain('Five nights');
  await click('new');
  await click('help');
  expect(document.querySelector('#about')?.textContent).toContain('Let him rest');
  const run = state(debug);
  run.night = 4;
  debug.step(0);
  // Re-entering through the save refreshes phase-specific help.
  await click('menu');
  await click('to-title');
  await click('cont');
  state(debug).water.overtopped = true;
  debug.step(1);
  expect(document.querySelector('.week-end')?.textContent).toContain('week ends');
  expect(document.querySelector('#about')?.textContent).toContain('red line');
  await click('end');
  expect(document.querySelector('#tally-result')?.hasAttribute('hidden')).toBe(true);
  expect(document.querySelector('#about')?.textContent).toContain('own reckoning');
  const ended = JSON.stringify(state(debug));
  await click('see-tally');
  expect(document.querySelector('#tally-result')?.hasAttribute('hidden')).toBe(false);
  expect(JSON.stringify(state(debug))).toBe(ended);
  await click('back');
  expect(document.querySelector('#chart')).not.toBeNull();
});

it('marks the final dawn and offers no further night', async () => {
  const run = newGame(7);
  while (run.phase !== 'end') {
    if (run.phase === 'dawn') queueInput(run, { kind: 'next' });
    else {
      run.water.gate = 4;
      step(run);
    }
  }
  const debug = await boot();
  await click('new');
  Object.assign(state(debug), run);
  debug.step(0);
  expect(document.querySelector('.week-end')?.textContent).toContain('after Friday night');
  expect(document.getElementById('next')).toBeNull();
  await click('end');
  expect(document.querySelector('h2')?.textContent).toBe('The week is over');
  await click('again');
  expect(document.querySelector('.first-call')).not.toBeNull();
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
    expect(document.getElementById('feedback-result')?.textContent).toBe('Sent. Thank you.'),
  );
  const { lab } = await import('../src/ui/lab.ts');
  expect(lab.sendFeedback).toHaveBeenCalledWith(
    '[keep] I wanted another reading.',
    expect.objectContaining({ name: 'owner', run: expect.any(Object) }),
  );
  expect(localStorage.getItem('hf-lab-feedback-name')).toBe('owner');
});

it('allows feedback while recording is off and keeps the inline switch', async () => {
  localStorage.setItem('hf-lab-recording-off', '1');
  await boot();
  await click('menu');
  await click('send-word');
  expect((document.getElementById('feedback-send') as HTMLButtonElement).disabled).toBe(false);
  expect(document.querySelector('#recording-notice')?.textContent).toContain('still send your note');
  const input = document.getElementById('record-feedback') as HTMLInputElement;
  input.checked = true;
  input.dispatchEvent(new Event('change'));
  expect((document.getElementById('feedback-send') as HTMLButtonElement).disabled).toBe(false);
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
  tap(document.querySelector('.first-call [data-job]') as HTMLElement);
  Object.defineProperty(sheet, 'scrollHeight', { configurable: true, value: 600 });
  sheet.scrollTop = 0;
  state(debug).said.push({ at: state(debug).minute, who: 'dai', kind: 'report', text: 'Four-six.' });
  debug.step(0);
  expect(sheet.scrollTop).toBe(600);
});

it('keeps gate job identity when a forecast appears after a delayed keeper report', async () => {
  const save = {
    seed: 12345,
    inputs: [
      { kind: 'ask', keeper: 'dai', job: 'gate', target: 6, insist: true, at: 1320 },
      { kind: 'next', at: 1800 },
      { kind: 'ask', keeper: 'dai', job: 'gate', target: 6, insist: true, at: 2760 },
      { kind: 'next', at: 3240 },
      { kind: 'ask', keeper: 'dai', job: 'gate', target: 6, insist: true, at: 4200 },
      { kind: 'next', at: 4680 },
      { kind: 'ask', keeper: 'dai', job: 'gate', target: 6, insist: true, at: 5640 },
      { kind: 'ask', keeper: 'callum', job: 'clear', insist: true, at: 5810 },
    ],
    minute: 5860,
  };
  localStorage.setItem(
    'glance-cast-local-v3',
    JSON.stringify(localFixture(replay(save.seed, save.inputs as Input[], save.minute))),
  );
  const debug = await boot();
  await click('cont');
  chooseGauge('gate');
  const buttons = [...document.querySelectorAll('.sheet [data-job]')];
  debug.step(3);
  [...document.querySelectorAll('.sheet [data-job]')].forEach((button, i) => {
    expect(button).toBe(buttons[i]);
  });
});

it('keeps feedback sent when remembering the name fails', async () => {
  const { lab } = await import('../src/ui/lab.ts');
  Object.assign(lab, { privacySignalOn: false });
  await boot();
  await click('new');
  await click('menu');
  await click('send-word');
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  await click('feedback-send');
  await vi.waitFor(() =>
    expect(document.getElementById('feedback-result')?.textContent).toBe('Sent. Thank you.'),
  );
  expect(document.getElementById('feedback-send')?.textContent).toBe('Back to the desk');
});
