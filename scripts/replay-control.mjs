// Run with Node >=24. Set PLAYWRIGHT_MODULE to an existing Playwright ESM entry if not installed locally.
// No app UI, telemetry, screenshots, or new player rounds. Only synthetic loopback GETs are allowed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, createServer } from 'vite';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(import.meta.dirname, '..');
const control = JSON.parse(await readFile(resolve(root, 'test/fixtures/replay-seed7.json'), 'utf8'));
const digest = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const temp = await mkdtemp(resolve(tmpdir(), 'glance-replay-'));
let server;
let browser;
try {
  await build({
    root,
    configFile: false,
    logLevel: 'error',
    build: {
      target: 'es2022',
      outDir: resolve(temp, 'bundle'),
      emptyOutDir: true,
      lib: {
        entry: resolve(root, 'scripts/replay-control-entry.ts'),
        formats: ['es'],
        fileName: () => 'run.mjs',
      },
      minify: 'esbuild',
      sourcemap: false,
    },
  });
  const bundlePath = resolve(temp, 'bundle/run.mjs');
  const built = await readFile(bundlePath);
  server = await createServer({
    root,
    configFile: false,
    cacheDir: resolve(temp, 'cache'),
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  });
  const nodeDev = await server.ssrLoadModule('/scripts/replay-control-entry.ts');
  const nodeMinified = await import(pathToFileURL(bundlePath).href);
  const baseline = nodeDev.controlRun(control);
  assert.equal(control.inputs.length, 36);
  assert.equal(baseline.ex.state.minute, 3240);
  assert.equal(baseline.ex.state.dawns.length, 2);
  assert.equal(baseline.ex.game, 'glance@4-deterministic-water');
  assert.equal(baseline.ex.framework, '3.0.0');
  assert.equal(baseline.numeric[3], 0.3431961515031887);
  assert.equal(baseline.rain, 8.806680617486581);
  assert.equal(baseline.samples[0].minute, 2884);
  assert.equal(baseline.samples[0].water.town, 0.1886180624025132);
  assert.equal(baseline.samples[1].minute, 3077);
  assert.equal(baseline.samples[1].water.town, 0.409742177719169);
  assert.equal(baseline.samples[1].bridge, 3.356812570682373);
  assert.equal(baseline.ex.state.board.bridge.truth, 3.356812570682373);
  assert.equal(baseline.ex.state.reports[16].truth, 3.356812570682373);
  assert.equal(baseline.ex.state.dawns[1].reports[16].truth, 3.356812570682373);
  const receipt = {
    node: process.version,
    v8: process.versions.v8,
    sha256: digest(baseline.ex),
    inputSha256: createHash('sha256')
      .update(await readFile(resolve(root, 'test/fixtures/replay-seed7.json')))
      .digest('hex'),
    rain: baseline.rain,
    samples: baseline.samples,
    results: [],
  };
  for (const [variant, io] of [
    ['dev', nodeDev],
    ['minified', nodeMinified],
  ]) {
    const result = io.controlRun(control);
    assert.deepStrictEqual(result, baseline, `Node ${variant} complete result`);
    assert.deepStrictEqual(io.exportCurrent(io.importCurrent(structuredClone(result.ex))), baseline.ex);
  }
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const origin = new URL(base).origin;
  for (const [engine, launcher] of [
    ['chromium', pw.chromium],
    ['webkit', pw.webkit],
  ]) {
    browser = await launcher.launch();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    let blocked = 0;
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET' || url.origin !== origin) {
        blocked++;
        return route.abort();
      }
      if (url.pathname === '/control')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Replay control</title>',
        });
      if (url.pathname === '/minified.mjs')
        return route.fulfill({ contentType: 'text/javascript', body: built });
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(`${base}control`);
    for (const variant of ['dev', 'minified']) {
      const result = await page.evaluate(
        async ({ variant, control, nodeExport }) => {
          const io = await import(variant === 'dev' ? '/scripts/replay-control-entry.ts' : '/minified.mjs');
          const run = io.controlRun(control);
          const imported = io.exportCurrent(io.importCurrent(nodeExport));
          const self = io.exportCurrent(io.importCurrent(structuredClone(run.ex)));
          return { run, imported, self };
        },
        { variant, control, nodeExport: baseline.ex },
      );
      assert.deepStrictEqual(
        result.run,
        baseline,
        `${engine} ${variant}: every complete export/numeric/sample field`,
      );
      assert.deepStrictEqual(result.imported, baseline.ex, `Node -> ${engine} ${variant}`);
      assert.deepStrictEqual(result.self, baseline.ex, `${engine} ${variant} self import`);
      for (const io of [nodeDev, nodeMinified]) {
        assert.deepStrictEqual(
          io.exportCurrent(io.importCurrent(result.run.ex)),
          baseline.ex,
          `${engine} -> Node`,
        );
      }
      assert.equal(digest(result.run.ex), receipt.sha256);
      receipt.results.push({
        engine,
        version: browser.version(),
        variant,
        sha256: digest(result.run.ex),
        strictImports: 'both directions + self passed',
      });
    }
    assert.equal(blocked, 0, 'Control attempted a disallowed request');
    await context.close();
    await browser.close();
    browser = undefined;
  }
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await rm(temp, { recursive: true, force: true });
}
