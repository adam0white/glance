// Writes public/release.json (commit, dirty flag, game and framework versions) before each build.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const game = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const hf = JSON.parse(readFileSync('node_modules/@adam0white/human-framework/package.json', 'utf8')) as {
  version: string;
};
let commit = 'none';
try {
  commit = git('rev-parse', 'HEAD');
} catch {}
const dirty = commit === 'none' || git('status', '--porcelain').length > 0;
const release = { app: game.version, framework: hf.version, commit, dirty };
writeFileSync('public/release.json', `${JSON.stringify(release, null, 2)}\n`);
console.log('release', release);
