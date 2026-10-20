import { clock, type GameState, type Job, keeperOf, personOf, planOf, walkMinutes } from '../sim/dam.ts';
import { NAMES } from '../sim/keepers.ts';
import { CREST, LIP } from '../sim/water.ts';

const jobs: Record<Job, string> = {
  level: 'reading the level',
  weir: 'reading the weir',
  gate: 'turning the gate',
  stove: 'resting by the stove',
  nap: 'sleeping',
  clear: 'clearing the screen',
};

const expected = (minute: number) => `~${clock(Math.round(minute / 5) * 5)}`;

/** Nominal desk estimates must not reveal a skipped walk, true gate setting or bodily capacity. */
export function concernLines(s: GameState): string[] {
  const queued = s.inputs.slice(s.applied).filter((input) => input.at <= s.minute);
  const lines = planOf(s).keepers.map((id) => {
    const k = keeperOf(s, id);
    const a = personOf(s, id).activity;
    const j = k.job;
    let words = 'available';
    if (a?.affordanceId === 'doze') words = 'not answering';
    else if (a?.affordanceId === 'nap') words = 'asleep, as you said';
    else if (j) {
      words = jobs[j.job];
      if (j.job === 'level' || j.job === 'weir') {
        const destination = j.job === 'level' ? 'staff' : 'weir';
        const due = j.startedAt + walkMinutes(j.from, destination) + 3;
        words += ` · report expected ${expected(due)}`;
      } else if (j.job === 'gate') {
        const reported = s.board.gate?.value;
        if (reported === undefined) words += ' · report expected after the walk and work';
        else {
          const turns = Math.abs((j.target ?? reported) - reported);
          const due = j.startedAt + walkMinutes(j.from, 'gate') + Math.max(2, turns * 7);
          words += ` · report expected ${expected(due)}`;
        }
      } else if (a) {
        words += ` · finish expected ${expected(a.endsAt)}`;
      }
    }
    const request = queued.findLast((input) => input.kind === 'ask' && input.keeper === id);
    const pendingJob = request?.kind === 'ask' ? request.job : k.pending?.job;
    if (pendingJob) words += `; ${pendingJob} request waiting for an answer`;
    else if (k.deferred && s.minute <= k.deferred.until)
      words += `; ${k.deferred.job} request waiting to reconsider`;
    return `${NAMES[id]}: ${words}.`;
  });
  if (s.nerys.ringing !== null) lines.push(`Nerys: river report expected ${expected(s.nerys.ringing)}.`);
  else if (queued.some((input) => input.kind === 'ring')) lines.push('Nerys: call waiting for an answer.');
  if (s.radioOut) lines.push('Radio: static; keeper requests and reports cannot get through.');
  return lines;
}

export function thresholdWords(s: GameState): string {
  const r = s.board.level;
  if (!r) return `Level not read · crest ${CREST.toFixed(1)} m.`;
  const observer = r.who === 'nerys' ? 'Nerys' : NAMES[r.who];
  const age = Math.max(0, s.minute - r.wrote);
  const next =
    r.value < LIP
      ? `spillway lip ${LIP.toFixed(1)} m`
      : `${r.value >= CREST ? 'at or above ' : ''}crest ${CREST.toFixed(1)} m`;
  return `Last level: ${r.value.toFixed(2)} m · ${observer}, read ${age} min ago (as written) · ${next}.`;
}
