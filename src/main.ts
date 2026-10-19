import './ui/style.css';
import { _debug, start } from './ui/app.ts';

if (import.meta.env.DEV) (window as unknown as { __glance: typeof _debug }).__glance = _debug;
start();
