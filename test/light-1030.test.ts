// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Report } from '../src/sim/dam.ts';
import { clock, exportRun, keeperOf, newGame, queueInput, replay, step } from '../src/sim/dam.ts';
import { PRIVATE_PREMISE } from '../src/sim/private-scenes.ts';
import { gateAfterLevel } from '../src/ui/gate-note.ts';
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

describe('F-2206 night one river side', () => {
  it('says on night one when the river reports begin, using the authored plan', async () => {
    await boot();
    await click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.getElementById('sheet')?.textContent).toContain(
      'Tonight the board shows only the dam. The Bridge Inn’s river reports begin on Tuesday.',
    );
  });
});

describe('F-2203 gate reading against level reading, by written time', () => {
  const report = (gauge: 'level' | 'gate', at: number, wrote: number): Report => ({
    at,
    wrote,
    who: 'dai',
    gauge,
    value: gauge === 'gate' ? 2 : 3.5,
    truth: 0,
    conf: 1,
    clarity: 1,
    cause: 'fresh',
    skipped: false,
  });
  it('names both written times, not the delivery time of a held gate report', () => {
    // Written 22:30 (1350); delivered after a radio outage at 23:50 (1430).
    const text = gateAfterLevel(report('level', 1335, 1335), report('gate', 1430, 1350));
    expect(text).toContain('read 22:30 (as written)');
    expect(text).toContain('read 22:15 (as written)');
    expect(text).not.toContain(clock(1430));
    expect(text).not.toMatch(/because|caused|lowered|raised/);
  });
  it('says nothing when the gate reading was written before the level reading', () => {
    expect(gateAfterLevel(report('level', 1360, 1360), report('gate', 1430, 1350))).toBe('');
    expect(gateAfterLevel(undefined, report('gate', 1350, 1350))).toBe('');
  });
  it('shows it in the level sheet of a saved first night with a bounded generated fixture', async () => {
    const saved = replay(
      7,
      [
        { at: 1321, kind: 'ask', keeper: 'dai', job: 'level', insist: false },
        { at: 1335, kind: 'ask', keeper: 'dai', job: 'gate', target: 2, insist: false },
      ],
      1370,
    );
    expect(saved.board.gate?.wrote).toBeGreaterThan(saved.board.level?.wrote ?? Number.MAX_SAFE_INTEGER);
    localStorage.setItem(
      'glance-cast-local-v3',
      JSON.stringify({
        run: exportRun(saved, '4.14.0'),
        runId: 'test-run',
        heads: [],
        fileOrigin: false,
        sources: [],
      }),
    );
    await boot();
    await click('cont');
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    const note = document.querySelector('.gate-after')?.textContent ?? '';
    expect(note).toContain(`read ${clock(saved.board.gate?.wrote ?? 0)} (as written)`);
    expect(note).toContain(`read ${clock(saved.board.level?.wrote ?? 0)} (as written)`);
  });
});

describe('F-2209 what a new call does to earlier work', () => {
  const dai = (s: ReturnType<typeof newGame>) => keeperOf(s, 'dai');
  const levelReports = (s: ReturnType<typeof newGame>) =>
    s.reports.filter((r) => r.gauge === 'level').map((r) => r.at);
  const play = (second?: { job: 'level' | 'gate' | 'nap'; target?: number }, between = 3) => {
    const s = newGame(7);
    step(s);
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level', insist: false });
    for (let i = 0; i < between; i++) step(s);
    if (second)
      queueInput(s, {
        kind: 'ask',
        keeper: 'dai',
        job: second.job,
        ...(second.target === undefined ? {} : { target: second.target }),
        insist: false,
      });
    for (let i = 0; i < 40; i++) step(s);
    return s;
  };
  it('source: two calls with no step between leave only the second one', () => {
    const s = newGame(7);
    step(s);
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'level', insist: false });
    queueInput(s, { kind: 'ask', keeper: 'dai', job: 'gate', target: 2, insist: false });
    expect(s.inputs.slice(s.applied).map((i) => i.kind)).toEqual(['ask', 'ask']);
    for (let i = 0; i < 40; i++) step(s);
    expect(levelReports(s)).toEqual([1320]);
    expect(s.reports.some((r) => r.gauge === 'gate' && r.at > 1320)).toBe(true);
  });
  it('source: repeating the active level call restarts it and the report comes later', () => {
    expect(levelReports(play())).toEqual([1320, 1331]);
    expect(levelReports(play({ job: 'level' }))).toEqual([1320, 1334]);
  });
  it('source: a request he does not take up still interrupts the active job and delays its report', () => {
    const s = play({ job: 'nap' });
    expect(dai(s).job?.job).not.toBe('nap');
    expect(levelReports(s)).toEqual([1320, 1334]);
  });
  it('desk: with the first call still queued, the next call button says it replaces it', async () => {
    const debug = await boot();
    await click('new');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    const queued = debug.state?.inputs.slice(debug.state.applied) ?? [];
    expect(queued.map((i) => i.kind)).toEqual(['ask']);
    expect(debug.state?.keepers.find((k) => k.id === 'dai')?.pending ?? null).toBeNull();
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.turns .h')?.textContent).toContain(
      'Your earlier call to him is still waiting. This call replaces it.',
    );
    expect(document.querySelector('.turns .h')?.textContent).toContain('even if he does not agree');
  });
  it('desk: during an active level job a repeat call says it starts again; no notice before any call', async () => {
    const debug = await boot();
    await click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.turns .h')?.textContent).not.toContain('interrupts');
    await click('x');
    await tap(document.querySelector('.first-call [data-job="level"]') as HTMLElement);
    await debug.step(3);
    expect(debug.state?.keepers.find((k) => k.id === 'dai')?.job?.job).toBe('level');
    (document.querySelector('[data-g="level"]') as HTMLElement).click();
    const again = document.querySelector('.sheet [data-job="level"] .h')?.textContent ?? '';
    expect(again).toContain('A call interrupts his current job, even if he does not agree.');
    expect(again).toContain('it starts again and its report can come later');
    await click('x');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.turns .h')?.textContent).toContain('If he goes back to it afterwards');
  });
});
