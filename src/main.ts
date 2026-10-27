import './ui/style.css';
import { fileEntry } from './entry.ts';

const entryMode = fileEntry(location.search, location.pathname);
if (entryMode === 'invalid') {
  const app = document.getElementById('app');
  if (app) app.textContent = 'This file address is invalid. Use /file/ to choose a saved file.';
} else if (
  entryMode === 'file' &&
  (location.pathname !== '/file/' || new URLSearchParams(location.search).has('file'))
) {
  const query = new URLSearchParams(location.search);
  query.delete('file');
  const search = query.toString();
  location.replace(`/file/${search ? `?${search}` : ''}${location.hash}`);
} else {
  // Redirect/refusal must finish before App, SDK, native continuity or SW initialization.
  const { _debug, start } = await import('./ui/app.ts');
  if (import.meta.env.DEV) (window as unknown as { __glance: typeof _debug }).__glance = _debug;
  start();
}
