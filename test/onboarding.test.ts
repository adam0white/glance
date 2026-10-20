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
  it('keeps the sample report open beyond ten seconds without advancing or changing the run', async () => {
    const debug = await boot();
    click('new');
    expect(document.querySelector('.opener #chart')).not.toBeNull();
    expect(document.querySelector('.opener .houses')).not.toBeNull();
    const before = fingerprint(state(debug));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(document.querySelector('.opener')).not.toBeNull();
    expect(fingerprint(state(debug))).toBe(before);
    expect(debug.state?.dawns).toHaveLength(0);
    click('begin');
    expect(document.querySelector('.watch')).not.toBeNull();
    expect(fingerprint(state(debug))).toBe(before);
  });

  it('allows an immediate keyboard dismissal without queuing a game action', async () => {
    const debug = await boot();
    click('new');
    expect(document.querySelector('.opener')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.querySelector('.watch')).not.toBeNull();
    expect(debug.state?.inputs).toHaveLength(0);
  });

  it('lets keyboard readers scroll through the report without dismissing it', async () => {
    await boot();
    click('new');
    for (const key of ['ArrowDown', 'PageDown', 'End', ' ', 'Tab']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(document.querySelector('.opener')).not.toBeNull();
    }
    click('begin');
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

  it('makes an early ending explicit on the last dawn and opens the sample again for another week', async () => {
    const debug = await boot();
    click('new');
    click('begin');
    state(debug).water.overtopped = true;
    debug.step(1);
    expect(debug.state?.phase).toBe('end');
    expect(document.querySelector('[role="status"]')?.textContent).toContain('week ends');
    click('end');
    expect(document.querySelector('h2')?.textContent).toBe('The week is over');
    click('again');
    expect(document.querySelector('.opener #chart')).not.toBeNull();
    click('begin');
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
