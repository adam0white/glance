import './ui/style.css';
// app resolves the explicit entry mode before constructing native continuity.
import { _debug, start } from './ui/app.ts';
import { entryMode } from './ui/lab.ts';

if (entryMode !== 'invalid' && import.meta.env.DEV)
  (window as unknown as { __glance: typeof _debug }).__glance = _debug;
start();
