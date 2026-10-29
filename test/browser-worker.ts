/** Unit-test transport only. It runs the exact production worker owner and public
 * HF engine. Actual thread responsiveness/cancellation is a separate App proof. */
import { watchOwner } from '../src/validation-worker.ts';

const workers = new Set<BrowserWorker>();
export class BrowserWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private closed = false;
  private receive = watchOwner((value) =>
    queueMicrotask(() => {
      if (!this.closed) this.onmessage?.({ data: structuredClone(value) } as MessageEvent);
    }),
  );
  constructor() {
    workers.add(this);
  }
  postMessage(value: unknown) {
    const input = structuredClone(value);
    queueMicrotask(() => {
      if (!this.closed)
        void this.receive(input as never).catch((error) => this.onerror?.({ error } as ErrorEvent));
    });
  }
  terminate() {
    this.closed = true;
    workers.delete(this);
  }
}
export function disposeBrowserWorkers() {
  for (const worker of workers) worker.terminate();
}
