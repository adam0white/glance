// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportRun, fingerprint, type GameState, newGame, queueInput, step } from '../src/sim/dam.ts';

// Notebook telemetry is external; keep the game and its DOM real.
vi.mock('../src/ui/lab.ts', () => ({
  lab: { screen() {}, milestone() {}, openSendDialog() {} },
}));

function click(id: string) {
  const button = document.getElementById(id);
  expect(button, id).not.toBeNull();
  button?.click();
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

async function importRun(run: ReturnType<typeof exportRun>) {
  const file = document.getElementById('file') as HTMLInputElement;
  Object.defineProperty(file, 'files', {
    value: [{ text: async () => JSON.stringify(run) }],
  });
  file.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(document.getElementById('file')).toBeNull());
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('alert', () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the first page of a new week', () => {
  it('offers the first reading directly after a short goal without advancing the run', async () => {
    const debug = await boot();
    const titleWords = document.querySelector('#goal')?.textContent?.trim().split(/\s+/).length;
    expect(titleWords).toBeLessThanOrEqual(20);
    click('new');
    expect(document.querySelector('.opener')).toBeNull();
    expect(document.querySelector('[data-job="level"]')).not.toBeNull();
    expect(state(debug).inputs).toHaveLength(0);
    expect(state(debug).minute).toBe(1320);
  });

  it('keeps the old rules and sample report reachable on request', async () => {
    const debug = await boot();
    click('new');
    const before = fingerprint(state(debug));
    click('help');
    expect(document.querySelector('#about #chart')).not.toBeNull();
    expect(document.querySelector('#about')?.textContent).toContain('More gate turns');
    click('close-about');
    expect(document.querySelector('[data-job="level"]')).not.toBeNull();
    expect(fingerprint(state(debug))).toBe(before);
  });

  it('names a pending reading and replaces it with an expected report time', async () => {
    const debug = await boot();
    click('new');
    const request = document.querySelector('[data-job="level"]') as HTMLElement;
    request.dispatchEvent(new Event('pointerdown'));
    request.dispatchEvent(new Event('pointerup'));
    expect(document.querySelector('#concern')?.textContent).toContain('level request');
    expect(document.querySelector('#concern')?.textContent).toContain('waiting for an answer');
    debug.step(1);
    expect(document.querySelector('#concern')?.textContent).toMatch(/Dai.*level.*expected ~22:/);
    debug.step(20);
    expect(document.querySelector('#concern')?.textContent).not.toContain('waiting for an answer');
    expect(document.querySelector('#threshold')?.textContent).toContain('Last level');
  });

  it('keeps all gate choices and their rule together, with selection separate from attention', async () => {
    await boot();
    click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.watch.sheet-open')).not.toBeNull();
    expect(document.querySelectorAll('.turns [data-job="gate"]')).toHaveLength(6);
    expect(document.querySelector('.sheet .hint')?.textContent).toContain('Hold a button');
    expect(document.querySelector('#concern.attention')).not.toBeNull();
    expect(document.querySelector('#speed [aria-pressed="true"]')).not.toBeNull();
  });

  it('skips the opener when returning to a saved desk', async () => {
    localStorage.setItem('glance-save-v1', JSON.stringify({ seed: 7, inputs: [], minute: 1340 }));
    const debug = await boot();
    click('cont');
    expect(document.querySelector('.watch')).not.toBeNull();
    expect(document.querySelector('.opener')).toBeNull();
    expect(debug.state?.minute).toBe(1340);
  });

  it('imports a replay directly without showing the opener or changing its fingerprint', async () => {
    const run = newGame(7);
    for (let n = 0; n < 20; n++) step(run);
    const debug = await boot();
    await importRun(exportRun(run, 'test'));
    expect(document.querySelector('.watch')).not.toBeNull();
    expect(document.querySelector('.opener')).toBeNull();
    expect(fingerprint(state(debug))).toBe(fingerprint(run));
  });

  it('makes an early ending explicit on the last dawn and offers the first reading again for another week', async () => {
    const debug = await boot();
    click('new');
    state(debug).water.overtopped = true;
    debug.step(1);
    expect(debug.state?.phase).toBe('end');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('week ends');
    click('end');
    expect(document.querySelector('h2')?.textContent).toBe('The week is over');
    click('again');
    expect(document.querySelector('[data-job="level"]')).not.toBeNull();
  });

  it('marks completion after the last night and offers no further night', async () => {
    const run = newGame(7);
    // Keep the outlet open in this fixture so the test reaches the final dawn.
    while (run.phase !== 'end') {
      if (run.phase === 'dawn') queueInput(run, { kind: 'next' });
      else {
        run.water.gate = 4;
        step(run);
      }
    }
    expect(run.night).toBe(5);
    expect(run.dawns.at(-1)?.overtopped).toBe(false);
    localStorage.setItem('glance-save-v1', JSON.stringify({ seed: 7, inputs: [], minute: 1320 }));
    const debug = await boot();
    click('cont');
    // Display the final dawn through the same path used by an arriving watch.
    Object.assign(state(debug), run);
    debug.step(0);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('after Friday night');
    expect(document.getElementById('next')).toBeNull();
    click('end');
    expect(document.querySelector('h2')?.textContent).toBe('The week is over');
  });
});

describe('clarity follow-up', () => {
  it('reports explicit save failure and lets the player retry', async () => {
    await boot();
    click('new');
    (
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent === 'Game menu',
      ) as HTMLElement
    ).click();
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    const save = Array.from(document.querySelectorAll('dialog button')).find(
      (b) => b.textContent === 'Save',
    ) as HTMLElement;
    save.click();
    await vi.waitFor(() =>
      expect(document.querySelector('dialog [role="status"]')?.textContent).toContain(
        'try Download this run',
      ),
    );
    expect(document.querySelector('.watch')).not.toBeNull();
    set.mockRestore();
    save.click();
    await vi.waitFor(() =>
      expect(document.querySelector('dialog [role="status"]')?.textContent).toBe('Saved.'),
    );
    expect(JSON.parse(localStorage.getItem('glance-save-v1') ?? '{}').minute).toBe(1320);
  });

  it('separates a stale gate report from the current clock and shows inspection speed', async () => {
    const debug = await boot();
    click('new');
    debug.step(24);
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect(document.querySelector('.sheet .who')?.textContent).toContain('Now 22:24');
    expect(document.querySelector('.sheet .who')?.textContent).toContain('reported 22:00');
    expect(document.querySelector('.sheet')?.textContent).toContain('Inspection slowdown · steady selected');
  });

  it('keeps the forecast expanded across a running-clock minute, but resets for a new sheet', async () => {
    let frame: FrameRequestCallback = () => {};
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const debug = await boot();
    click('new');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    (document.querySelector('.sheet details') as HTMLDetailsElement).open = true;
    const from = performance.now();
    for (let n = 1; n <= 16; n++) frame(from + n * 250);
    expect(state(debug).minute).toBeGreaterThan(1320);
    expect((document.querySelector('.sheet details') as HTMLDetailsElement).open).toBe(true);
    click('x');
    (document.querySelector('[data-g="gate"]') as HTMLElement).click();
    expect((document.querySelector('.sheet details') as HTMLDetailsElement).open).toBe(false);
  });
});
