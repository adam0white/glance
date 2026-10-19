/**
 * HF-character playtesters (the human-framework repo's packages/playtester harness, untracked work in progress)
 * play The Glance headless. The adapter shows only what the screen shows: the board, the log, the telegraph
 * shorts and the dawn page. Time runs at 'steady' (1.4 sim minutes per real second), 0.35 while a sheet is open
 * is not modelled. Run (needs a human-framework checkout beside this repo): node scripts/playtester/hf-session.ts [seeds=2]
 */
import {
  type GameAdapter,
  type Observation,
  PERSONAS,
  type Persona,
  type PlayAction,
  type PlayEvent,
  playSession,
  readSession,
} from '../../../human-framework/packages/playtester/src/index.ts';
import {
  clock,
  type GameState,
  hint,
  keeperOf,
  newGame,
  planOf,
  queueInput,
  step,
} from '../../src/sim/dam.ts';
import { NAMES } from '../../src/sim/keepers.ts';
import { TURNS } from '../../src/sim/water.ts';

const STEADY = 1.4;
const VERDICT: Record<string, number> = {
  assented: 1,
  complied: 0.7,
  modified: 0.4,
  deferred: 0.3,
  refused: 0.1,
};

class GlanceAdapter implements GameAdapter {
  name = 'the-glance';
  s: GameState;
  private seenSaid = 0;
  private seenDawns = 0;
  private carry = 0;
  constructor(seed: number) {
    this.s = newGame(seed);
  }
  observe(): Observation {
    const s = this.s;
    const events: PlayEvent[] = [];
    const lines = s.said.filter((x) => x.at >= 0);
    const fresh = lines.slice(Math.min(this.seenSaid, lines.length));
    this.seenSaid = lines.length;
    for (const x of fresh) {
      const refusal = x.kind === 'answer' && /^(No|Not|I can’t|I… I can’t|after)/.test(x.text);
      events.push({
        kind:
          x.kind === 'report' ? 'report' : x.who === 'narrator' ? 'narration' : refusal ? 'refused' : x.kind,
        summary: `${x.who}: ${x.text}`,
        valence: refusal ? -0.35 : x.kind === 'report' ? 0.15 : 0.05,
        salience: x.who === 'narrator' ? 0.7 : 0.55,
        ...(x.who === 'dai' || x.who === 'callum' ? { by: x.who } : {}),
      });
    }
    while (this.seenDawns < s.dawns.length) {
      const d = s.dawns[this.seenDawns++];
      if (!d) break;
      const caught = d.misses.filter((m) => m.caught).length;
      events.push({
        kind: 'dawn',
        summary: `dawn ${d.night}: ${d.overtopped ? 'overtopped' : 'held'}, Mill Lane ${d.mill}, caught ${caught}/${d.misses.length}`,
        valence: d.overtopped ? -1 : d.mill === 'flooded' ? -0.6 : 0.3 + 0.1 * caught,
        salience: 1,
      });
      for (const m of d.misses)
        events.push({
          kind: 'miss-revealed',
          summary: `${m.who} was wrong at ${clock(m.at)}`,
          valence: m.caught ? 0.4 : -0.3,
          salience: 0.8,
          by: m.who,
        });
    }
    const lvl = s.board.level?.value ?? 4;
    const bridge = s.board.bridge?.value ?? 0;
    return {
      clock: `N${s.night} ${clock(s.minute)}`,
      phase: s.phase,
      events,
      features: { pressure: Math.max(0, Math.min(1, (lvl - 4) / 1.6 + (bridge >= 4 ? 0.3 : 0))) },
      over: s.phase === 'end',
    };
  }
  actions(): PlayAction[] {
    const s = this.s;
    if (s.phase === 'dawn') return [{ id: 'next', label: 'next night', kind: 'next', promise: 0.6 }];
    if (s.phase === 'end') return [];
    const out: PlayAction[] = [];
    const lvl = s.board.level?.value ?? 4;
    const age = s.board.level ? s.minute - s.board.level.at : 999;
    for (const id of planOf(s).keepers) {
      if (keeperOf(s, id).job) continue;
      const h = hint(s, id, 'level');
      out.push({
        id: `${id}:level`,
        label: `ask ${NAMES[id]} to read the level`,
        kind: 'read',
        promise: Math.min(1, age / 60) * (VERDICT[h.verdict] ?? 0.3),
      });
      const g = s.board.gate?.value ?? 0;
      const want = lvl > 4.9 ? TURNS : lvl > 4.6 ? 4 : lvl > 4.3 ? 3 : 1;
      if (want !== g) {
        const hg = hint(s, id, 'gate', want);
        out.push({
          id: `${id}:gate:${want}`,
          label: `ask ${NAMES[id]} to set the gate to ${want}`,
          kind: 'gate',
          promise: 0.3 + 0.4 * Math.min(1, Math.abs(want - g) / 3) * (VERDICT[hg.verdict] ?? 0.3),
          focus: 0.4,
        });
      }
      if (planOf(s).weir)
        out.push({ id: `${id}:weir`, label: `send ${NAMES[id]} to the weir`, kind: 'read', promise: 0.25 });
    }
    if (planOf(s).inn) {
      out.push({
        id: 'ring',
        label: 'ring the inn',
        kind: 'read',
        promise: s.nerys.ringing === null ? 0.3 : 0,
      });
      if (s.warnedAt === null)
        out.push({
          id: 'warn',
          label: 'warn Mill Lane',
          kind: 'warn',
          promise: (s.board.bridge?.value ?? 0) >= 4 ? 0.8 : 0.05,
          tags: ['confront'],
        });
    }
    return out;
  }
  apply(id: string) {
    const s = this.s;
    if (id === 'next') return queueInput(s, { kind: 'next' });
    if (id === 'ring') return queueInput(s, { kind: 'ring' });
    if (id === 'warn') return queueInput(s, { kind: 'warn' });
    const [keeper, job, t] = id.split(':') as ['dai' | 'callum', 'level' | 'gate' | 'weir', string?];
    queueInput(
      s,
      t === undefined ? { kind: 'ask', keeper, job } : { kind: 'ask', keeper, job, target: Number(t) },
    );
  }
  advance(seconds: number) {
    if (this.s.phase !== 'watch') return;
    this.carry += seconds * STEADY;
    while (this.carry >= 1 && this.s.phase === 'watch') {
      this.carry -= 1;
      step(this.s);
    }
  }
}

const seeds = Number(process.argv.find((a) => a.startsWith('seeds='))?.slice(6) ?? 2);
for (const persona of Object.values(PERSONAS) as Persona[])
  for (let seed = 1; seed <= seeds; seed++) {
    const game = new GlanceAdapter(500 + seed);
    const trace = playSession(game, persona, seed);
    const r = readSession(trace);
    const nights = game.s.dawns.map((d) => `${d.overtopped ? 'X' : 'ok'}/${d.mill[0]}`).join(' ');
    console.log(
      `\n${persona.id} seed ${seed}: ${r.ended.reason} after ${r.minutes} min at ${r.ended.clock} (${r.ended.why})`,
    );
    console.log(
      `  nights ${nights || '-'}; engagement ${r.meanEngagement}; time ${JSON.stringify(r.choices)}`,
    );
    console.log(
      `  longest lull ${r.longestLull.seconds}s from ${r.longestLull.from} (${r.longestLull.phase}); looked away ${r.lookedAway}x`,
    );
    for (const m of trace.moments.filter((x) => x.kind !== 'rewarded').slice(0, 6))
      console.log(
        `  ${Math.floor(m.t / 60)}:${String(m.t % 60).padStart(2, '0')} ${m.clock} ${m.kind}: ${m.text}`,
      );
    console.log(`  rewarded ${r.rewarded.length}x, first: ${r.rewarded.slice(0, 3).join(' | ')}`);
  }
