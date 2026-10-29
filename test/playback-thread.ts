/** Production worker bridge used only by the async playback control. */
import { parentPort } from 'node:worker_threads';
import { watchOwner } from '../src/validation-worker.ts';

if (!parentPort) throw Error('A production worker thread is required.');
const port = parentPort;
const receive = watchOwner((value) => port.postMessage(value));
port.on('message', (message) => void receive(message));
