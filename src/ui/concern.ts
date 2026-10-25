import { clock, type GameState, type Job, keeperOf, personOf, planOf, walkMinutes } from '../sim/dam.ts';
import { NAMES } from '../sim/keepers.ts';
import { CREST, LIP } from '../sim/water.ts';

const jobs: Record<Job, { doing: string; request: string }> = {
  level: { doing: 'reading the level', request: 'read the level' },
  weir: { doing: 'reading the weir', request: 'read the weir' },
  gate: { doing: 'turning the gate', request: 'turn the gate' },
  stove: { doing: 'resting by the stove', request: 'rest by the stove' },
  nap: { doing: 'sleeping', request: 'take a nap' },
  clear: { doing: 'clearing the debris screen', request: 'clear the debris screen' },
};

const expected = (minute: number) => `about ${clock(Math.round(minute / 5) * 5)}`;

/** Nominal desk estimates must not reveal a skipped walk, true gate setting or bodily capacity. */
export function concernLines(s: GameState): string[] {
  const queued = s.inputs.slice(s.applied).filter((input) => input.at <= s.minute);
  const lines = planOf(s).keepers.map((id) => {
    const k = keeperOf(s, id);
    const a = personOf(s, id).activity;
    const j = k.job;
    let words = 'He is available';
    if (a?.affordanceId === 'doze') words = 'He is not answering';
    else if (a?.affordanceId === 'nap') words = 'He is asleep, as you asked';
    else if (j) {
      words = `He is ${jobs[j.job].doing}`;
      if (j.job === 'level' || j.job === 'weir') {
        const destination = j.job === 'level' ? 'staff' : 'weir';
        const due = j.startedAt + walkMinutes(j.from, destination) + 3;
        words += `. His report is expected ${expected(due)}`;
      } else if (j.job === 'gate') {
        const reported = s.board.gate?.value;
        if (reported === undefined) words += '. His report is expected after the walk and work';
        else {
          const turns = Math.abs((j.target ?? reported) - reported);
          const due = j.startedAt + walkMinutes(j.from, 'gate') + Math.max(2, turns * 7);
          words += `. His report is expected ${expected(due)}`;
        }
      } else if (a) {
        words += `. He is expected to finish ${expected(a.endsAt)}`;
      }
    }
    const request = queued.findLast((input) => input.kind === 'ask' && input.keeper === id);
    const pendingJob = request?.kind === 'ask' ? request.job : k.pending?.job;
    if (pendingJob) words += `. Your request to ${jobs[pendingJob].request} is waiting for an answer`;
    else if (k.deferred && s.minute <= k.deferred.until)
      words += `. Your request to ${jobs[k.deferred.job].request} is waiting for him to reconsider`;
    return `${NAMES[id]}: ${words}.`;
  });
  if (s.nerys.ringing !== null)
    lines.push(`Nerys: Her river report is expected ${expected(s.nerys.ringing)}.`);
  else if (queued.some((input) => input.kind === 'ring'))
    lines.push('Nerys: Your call is waiting for an answer.');
  if (s.radioOut) lines.push('Radio: There is static. Keeper requests and reports cannot get through.');
  return lines;
}

export function thresholdWords(s: GameState): string {
  const r = s.board.level;
  if (!r) return `The level has not been read. The crest, or top of the dam, is at ${CREST.toFixed(1)} m.`;
  const observer = r.who === 'nerys' ? 'Nerys' : NAMES[r.who];
  const age = Math.max(0, s.minute - r.wrote);
  const next =
    r.value < LIP
      ? `The spillway lip, where water starts to overflow into the spillway, is at ${LIP.toFixed(1)} m.`
      : `${r.value >= CREST ? 'This reading is at or above the crest. ' : ''}The crest, or top of the dam, is at ${CREST.toFixed(1)} m.`;
  return `The last level was ${r.value.toFixed(2)} m. ${observer} read it ${age} min ago (as written). ${next}`;
}
