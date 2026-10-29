import { readFileSync } from 'node:fs';
import type { Reservation } from '../src/preparation-store.ts';

/** Exact full r2 .5.5 raw captures; readonly reconstruction is not current write eligibility. */
export function historicalEvent(file: string, kind: string, index = 0): any {
  const raw = JSON.parse(
    readFileSync(new URL(`./fixtures/incoming-pre-gate/${file}.json`, import.meta.url), 'utf8'),
  );
  const event = raw.events.filter((event: { kind: string }) => event.kind === kind)[index];
  if (!event) throw Error(`Missing full historical event ${file}/${kind}`);
  return structuredClone(event.value);
}
/** Restore the exact historical IDB row, like a reopened database. Never changes its phase/body. */
export async function restoreHistoricalReservation(record: Reservation) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const q = indexedDB.open('glance-incoming-1', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('reservations', { keyPath: 'id' });
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('reservations', 'readwrite');
      tx.objectStore('reservations').add(structuredClone(record));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
