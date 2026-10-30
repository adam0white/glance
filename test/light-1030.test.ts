// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame } from '../src/sim/dam.ts';
import { PRIVATE_PREMISE } from '../src/sim/private-scenes.ts';
import { BrowserWorker, disposeBrowserWorkers } from './browser-worker.ts';

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
    setEventsOff: vi.fn(),
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

async function settle() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}
async function click(id: string) {
  document.getElementById(id)?.click();
  await settle();
}
async function tap(button: HTMLElement) {
  button.dispatchEvent(new Event('pointerdown'));
  button.dispatchEvent(new Event('pointerup'));
  await settle();
}
async function boot() {
  const app = await import('../src/ui/app.ts');
  app.start();
  return app._debug;
}
beforeEach(() => {
  vi.stubGlobal('Worker', BrowserWorker);
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
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

describe('F-2198 optional chapter copy on the first screen', () => {
  it('keeps the long paragraph out of the note above the gauges and shows it once, collapsed in the log', async () => {
    const debug = await boot();
    await click('new');
    expect(document.getElementById('latest-radio')?.textContent ?? '').not.toContain('dark corners');
    const app = document.getElementById('app') as HTMLElement;
    expect(app.textContent?.split('Her three dark corners').length).toBe(2);
    const note = document.querySelector<HTMLDetailsElement>('#log details.chapter-note');
    expect(note).not.toBeNull();
    expect(note?.open).toBe(false);
    expect(note?.querySelector('summary')?.textContent).toMatch(/Nerys/);
    // Disclosure stays complete and word for word inside the collapsed note.
    expect(note?.textContent).toContain(PRIVATE_PREMISE);
    expect(note?.textContent).toContain('Neither channel sends anything outside this game.');
    // The replayed journal line is unchanged.
    expect(debug.state?.said.some((x) => x.text === PRIVATE_PREMISE && x.kind === 'journal')).toBe(true);
    expect(newGame(7).said.some((x) => x.text === PRIVATE_PREMISE)).toBe(true);
  });
  it('still shows a later radio line in the note above the gauges', async () => {
    const debug = await boot();
    await click('new');
    await debug.step(40);
    const newest = debug.state?.said.at(-1);
    expect(newest?.text).not.toBe(PRIVATE_PREMISE);
    expect(document.getElementById('latest-radio')?.textContent).toContain((newest?.text ?? '').slice(0, 20));
  });
});

describe('F-2200 first job and progressive rules', () => {
  const gate = () => (document.querySelector('[data-g="gate"]') as HTMLElement).click();
  it('opens the gate sheet with direction and no insist, forecast or caught rule yet', async () => {
    await boot();
    await click('new');
    gate();
    const sheet = document.getElementById('sheet') as HTMLElement;
    expect(sheet.textContent).toContain('More turns lower the water behind the dam.');
    expect(sheet.textContent).not.toContain('insist');
    // The rule stays reachable, collapsed, in the doubt note.
    expect(sheet.querySelector<HTMLDetailsElement>('details.catch-rule')?.open).toBe(false);
    expect(sheet.querySelector('.reading-note > p.hint')?.textContent).not.toContain('caught');
    expect(sheet.querySelector<HTMLElement>('details.fore')?.hidden).toBe(true);
  });
  it('names insist and shows the forecast at the gate once a first job has been asked', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    expect(debug.state?.inputs.at(-1)).toMatchObject({ kind: 'ask', job: 'level' });
    gate();
    const sheet = document.getElementById('sheet') as HTMLElement;
    expect(sheet.querySelector('.turns + p.hint')?.textContent).toContain('Hold a button to insist.');
    expect(sheet.querySelector<HTMLElement>('details.fore')?.hidden).toBe(false);
  });
  it('keeps the caught rule reachable but collapsed in the doubt note', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(30);
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    await settle();
    const rule = document.querySelector<HTMLDetailsElement>('.reading-note details.catch-rule');
    expect(rule).not.toBeNull();
    expect(rule?.open).toBe(false);
    expect(rule?.textContent).toContain('A wrong reading counts as caught');
    expect(document.querySelector('.reading-note > p.hint')?.textContent).not.toContain('counts as caught');
  });
});

describe('F-2208 standing request wording', () => {
  it('says what saving does, offers a Save button and still promises nothing', async () => {
    const debug = await boot();
    await click('new');
    (document.querySelector('[data-watch-arrangements]') as HTMLElement).click();
    await settle();
    const dialog = document.getElementById('watch-arrangements') as HTMLElement;
    expect(document.getElementById('set-standing')?.textContent).toBe('Save this request');
    expect(dialog.textContent).not.toContain('Leave this request');
    expect(dialog.textContent).toContain('No request exists until you save it.');
    expect(dialog.textContent).toContain('The request is saved when you press the button.');
    expect(dialog.textContent).toContain('Once saved, a request waits for a new local level reading.');
    expect(dialog.textContent).toContain('These are requests, not promises.');
    expect(dialog.textContent).toContain('the keeper decides whether to do the gate work');
    const before = debug.state?.inputs.length ?? 0;
    document.getElementById('set-standing')?.click();
    await settle();
    expect(debug.state?.inputs.slice(before).map((x) => x.kind)).toEqual(['standing']);
  });
});

describe('F-2206 night one river side and F-2203 gate effect', () => {
  it('says on night one when the river reports begin, using the authored plan', async () => {
    await boot();
    await click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.getElementById('sheet')?.textContent).toContain(
      'Tonight the board shows only the dam. The Bridge Inn’s river reports begin on Tuesday.',
    );
  });
  it('says a level reading cannot show a gate change reported after it', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(30);
    expect(debug.state?.board.level).toBeTruthy();
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    expect(document.querySelector('.gate-after')).toBeNull();
    await click('x');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    await tap(document.querySelector('.turns [data-t="2"]') as HTMLElement);
    await debug.step(40);
    const gate = debug.state?.board.gate;
    expect(gate?.at).toBeGreaterThan(debug.state?.board.level?.at ?? 0);
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    expect(document.querySelector('.gate-after')?.textContent).toContain('after this level reading');
    expect(document.querySelector('.gate-after')?.textContent).toContain('Ask for a new reading.');
  });
});

describe('F-2209 a new call replaces an unfinished job', () => {
  it('says so on the gate buttons while Dai is reading the level, and not before', async () => {
    const debug = await boot();
    await click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.turns .h')?.textContent).not.toContain('replaces');
    await click('x');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(3);
    expect(debug.state?.keepers.find((k) => k.id === 'dai')?.job?.job).toBe('level');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.turns .h')?.textContent).toContain(
      'This call replaces his unfinished job.',
    );
    // The same job again is not a replacement.
    await click('x');
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    expect(document.querySelector('.sheet [data-job="level"] .h')?.textContent).not.toContain('replaces');
  });
});
