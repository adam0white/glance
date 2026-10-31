import type { GameState, Report } from '../sim/dam.ts';
import { reportWords } from '../sim/dam.ts';
import { spoken } from '../sim/reading.ts';

/**
 * The words the keeper actually said for this report, from the retained Said log, or null when they cannot
 * be matched safely. A report keeps no saved words and no ID, so a match needs the same keeper, the same
 * delivery minute and exactly one such line. A radio-delayed report is never matched: its line is stamped
 * when the radio returned and carries extra text. The opening level report is matched to Dai's single
 * combined opening sentence only when that sentence names the report's own level figure.
 */
export function exactWords(st: GameState, r: Report): string | null {
  if (r.late) return null;
  const lines = st.said.filter((x) => x.kind === 'report' && x.who === r.who && x.at === r.at);
  const line = lines.length === 1 ? lines[0] : undefined;
  if (!line) return null;
  if (line.text === reportWords(st, r)) return line.text;
  const opening =
    r.gauge === 'level' &&
    r.at === st.reports[0]?.at &&
    line.text.startsWith('Good evening. The level is ') &&
    line.text.includes(`The level is ${spoken(r.value)},`);
  return opening ? line.text : null;
}
