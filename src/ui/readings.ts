/** Actual received reports only. Never reconstruct a missing or radio-held reading from world truth. */
import type { GameState, Gauge, Report } from '../sim/dam.ts';
export function receivedReadings(s: GameState, gauge: Gauge): Report[] {
  const latest = new Map<Report['who'], Report>();
  for (const report of s.reports) {
    if (report.gauge === gauge && !s.held.includes(report)) latest.set(report.who, report);
  }
  return [...latest.values()].sort((a, b) => a.at - b.at);
}
