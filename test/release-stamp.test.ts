import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

type FetchRequest = { request: Request; respondWith: (response: Promise<Response>) => void };

it('leaves the release stamp to the network even when an old stamp is cached', async () => {
  const handlers: Record<string, (event: FetchRequest) => void> = {};
  const match = vi.fn(async () => new Response('old cached content'));
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    self: {
      location: new URL('https://game.example/sw.js'),
      addEventListener: (type: string, handler: (event: FetchRequest) => void) => {
        handlers[type] = handler;
      },
    },
    caches: { match },
    fetch: vi.fn(),
  });
  const handleFetch = handlers.fetch;
  if (!handleFetch) throw new Error('The worker did not register its fetch handler.');
  for (const path of ['/release.json', '/release.json?recheck=1']) {
    const respondWith = vi.fn();
    handleFetch({
      request: new Request(`https://game.example${path}`, { cache: 'no-store' }),
      respondWith,
    });
    expect(respondWith, path).not.toHaveBeenCalled();
  }
  expect(match).not.toHaveBeenCalled();

  // Offline assets still use the existing cache policy.
  let response: Promise<Response> | undefined;
  handleFetch({
    request: new Request('https://game.example/assets/game.js'),
    respondWith: (value: Promise<Response>) => {
      response = value;
    },
  });
  if (!response) throw new Error('The worker did not handle the offline asset.');
  expect(await (await response).text()).toBe('old cached content');
});
