// @vitest-environment happy-dom
import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';

const sinks = vi.hoisted(() => ({ sdk: vi.fn(), shelf: vi.fn() }));
vi.mock('@adam0white/lab-client', async (original) => {
  const sdk = await original<typeof import('@adam0white/lab-client')>();
  return {
    ...sdk,
    createLab: (...args: Parameters<typeof sdk.createLab>) => {
      sinks.sdk(...args);
      return sdk.createLab(...args);
    },
    personaChannel: () => {
      sinks.shelf();
      return { ready: Promise.resolve(true), enabled: false };
    },
    watchPersonaCheckpoint: () => () => {},
  };
});
let browser: Window;
let dispose: (() => void) | undefined;
afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await browser?.happyDOM.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function boot(path: string) {
  vi.resetModules();
  sinks.sdk.mockClear();
  sinks.shelf.mockClear();
  browser = new Window({ url: `http://localhost:3000${path}` });
  for (const key of [
    'window',
    'document',
    'location',
    'history',
    'navigator',
    'localStorage',
    'sessionStorage',
  ] as const)
    vi.stubGlobal(key, key === 'window' ? browser : browser[key]);
  for (const key of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const)
    vi.stubGlobal(key, browser[key].bind(browser));
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  sessionStorage.setItem('hf-lab-session:glance', `${'b'.repeat(32)}:1234`);
  sessionStorage.setItem('hf-lab-run:glance', 'c'.repeat(32));
  const native: string[] = [];
  for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
    const original = browser.localStorage[method].bind(browser.localStorage);
    vi.spyOn(browser.localStorage, method).mockImplementation((key: string, ...rest: string[]) => {
      if (key.startsWith('glance-')) native.push(`${method}:${key}`);
      return Reflect.apply(original, browser.localStorage, [key, ...rest]);
    });
  }
  const replace = vi.spyOn(location, 'replace').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 503 })),
  );
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  await import('../src/main.ts');
  if (sinks.sdk.mock.calls.length) dispose = (await import('../src/ui/lab.ts')).lab.dispose;
  return { native, replace };
}
it('actual canonical startup selects preserving SDK and chooser without native sinks', async () => {
  const { native, replace } = await boot('/file/?labRunSource=agent');
  expect(sinks.sdk).toHaveBeenCalledWith({ game: 'glance', preservation: 'preserve' });
  expect(sinks.shelf).not.toHaveBeenCalled();
  expect(native).toEqual([]);
  expect(replace).not.toHaveBeenCalled();
  expect(document.getElementById('file')).not.toBeNull();
});
it('actual legacy startup redirects before SDK/App/native effects and preserves attribution', async () => {
  const { native, replace } = await boot('/?file=1&labRunSource=agent&other=keep#section');
  expect(replace).toHaveBeenCalledWith('/file/?labRunSource=agent&other=keep#section');
  expect(sinks.sdk).not.toHaveBeenCalled();
  expect(sinks.shelf).not.toHaveBeenCalled();
  expect(native).toEqual([]);
});
it('actual malformed and duplicate legacy startup refuses before SDK/native effects', async () => {
  for (const path of ['/?file=0', '/?file=', '/?file=1&file=1', '/file/?file=1&file=other']) {
    const { native, replace } = await boot(path);
    expect(document.body.textContent).toContain('file address is invalid');
    expect(sinks.sdk).not.toHaveBeenCalled();
    expect(sinks.shelf).not.toHaveBeenCalled();
    expect(native).toEqual([]);
    expect(replace).not.toHaveBeenCalled();
    await browser.happyDOM.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
it('actual ordinary startup retains standard SDK, native shelf and local-save read', async () => {
  const { native, replace } = await boot('/?labRunSource=agent');
  expect(sinks.sdk).toHaveBeenCalledWith({ game: 'glance' });
  expect(sinks.shelf).toHaveBeenCalledTimes(1);
  expect(native).toContain('getItem:glance-cast-local-v3');
  expect(replace).not.toHaveBeenCalled();
  expect(document.getElementById('file')).toBeNull();
});
