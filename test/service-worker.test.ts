import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

function worker() {
  const handlers: Record<string, (event: any) => void> = {};
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    self: {
      location: new URL('https://glance.adamwhite.work/sw.js'),
      addEventListener: (type: string, handler: (event: any) => void) => {
        handlers[type] = handler;
      },
    },
    caches: {
      match: async () => undefined,
      open: async () => ({ put: async () => {} }),
    },
    fetch: async () => new Response('asset'),
  });
  return handlers.fetch!;
}

it('leaves cross-origin GETs to the browser instead of intercepting their CORS and integrity handling', () => {
  const fetch = worker();
  for (const url of [
    'https://static.cloudflareinsights.com/beacon.min.js/version',
    'https://fonts.gstatic.com/font.woff2',
    'https://human.adamwhite.work/lab/api/linked',
  ]) {
    let intercepted = false;
    fetch({
      request: new Request(url),
      respondWith: () => {
        intercepted = true;
      },
    });
    expect(intercepted, url).toBe(false);
  }
});

it('continues to cache same-origin game assets for offline play', async () => {
  let response: Promise<Response> | undefined;
  worker()({
    request: new Request('https://glance.adamwhite.work/assets/game.js'),
    respondWith: (value: Promise<Response>) => {
      response = value;
    },
  });
  expect(response).toBeDefined();
  expect(await (await response!).text()).toBe('asset');
});
